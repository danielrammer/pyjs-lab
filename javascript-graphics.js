export function createJavaScriptGraphics(display,onError) {
  let serial=0;
  const active=new Set();
  const animations=new Map();
  function dimensions(options) {
    const width=options.width ?? 700,height=options.height ?? 480;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<100||height<100||width>2000||height>2000)throw new Error("Canvas dimensions must be integers between 100 and 2000.");
    return [width,height];
  }
  function controls(card,alive) {
    const root=document.createElement("div");root.className="javascript-controls";card.root.insertBefore(root,card.message);
    const invoke=(callback,value)=>{if(alive())try{callback(value);}catch(error){onError(error);}};
    return {
      slider({label="Value",min=0,max=10,step=0.1,value=min,onChange=()=>{}}={}) {
        if(![min,max,step,value].every(Number.isFinite)||min>=max||step<=0||value<min||value>max)throw new Error("Invalid slider range or value.");
        const container=document.createElement("label"),text=document.createElement("span"),input=document.createElement("input");
        text.textContent=`${label}: ${value}`;input.type="range";input.min=min;input.max=max;input.step=step;input.value=value;
        input.setAttribute("aria-label",label);container.append(text,input);root.append(container);
        input.addEventListener("input",()=>{text.textContent=`${label}: ${input.value}`;invoke(onChange,Number(input.value));});return input;
      },
      button(label,callback) {const button=document.createElement("button");button.textContent=label;button.type="button";button.addEventListener("click",()=>invoke(callback));root.append(button);return button;},
    };
  }
  function plot(xs,ys,options={}) {
    const id=`js-plot-${++serial}`,[width,height]=dimensions(options),canvas=document.createElement("canvas");
    canvas.width=width;canvas.height=height;const ctx=canvas.getContext("2d");
    let points,initial,limits,mode="",drag=null,history=[],position=0;
    const left=64,right=width-24,top=36,bottom=height-52;
    const alive=()=>active.has(id);
    function bounds(values) {let low=Infinity,high=-Infinity;for(const v of values){low=Math.min(low,v);high=Math.max(high,v);}const padding=(high-low)*.05 || Math.max(1,Math.abs(low)*.05);return [low-padding,high+padding];}
    function range(value,fallback){if(value===undefined)return fallback;if(!Array.isArray(value)||value.length!==2||!value.every(Number.isFinite)||value[0]>=value[1])throw new Error("Plot limits need two increasing finite numbers.");return [...value];}
    function data(x,y) {
      if(!Array.isArray(x)||!Array.isArray(y)||x.length!==y.length||x.length<2||x.length>100000||!x.every(Number.isFinite)||!y.every(Number.isFinite))throw new Error("graphics.plot needs equally sized arrays of at least two finite numbers (maximum 100000).");
      points=x.map((value,index)=>[value,y[index]]);
      initial=[...range(options.xlim,bounds(x)),...range(options.ylim,bounds(y))];
    }
    data(xs,ys);limits=[...initial];history=[[...limits]];
    const pixel=(x,y)=>[left+(x-limits[0])/(limits[1]-limits[0])*(right-left),bottom-(y-limits[2])/(limits[3]-limits[2])*(bottom-top)];
    const world=(x,y)=>[limits[0]+(x*width-left)/(right-left)*(limits[1]-limits[0]),limits[2]+(bottom-y*height)/(bottom-top)*(limits[3]-limits[2])];
    function draw() {
      if(!alive())return;
      ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);ctx.font="12px system-ui";
      for(let i=0;i<=5;i++){
        const x=left+(right-left)*i/5,y=bottom-(bottom-top)*i/5;
        ctx.strokeStyle="#e3e0e8";ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
        ctx.fillStyle="#453d50";ctx.textAlign="center";ctx.fillText((limits[0]+(limits[1]-limits[0])*i/5).toPrecision(3),x,bottom+20);
        ctx.textAlign="right";ctx.fillText((limits[2]+(limits[3]-limits[2])*i/5).toPrecision(3),left-8,y+4);
      }
      ctx.strokeStyle="#777";ctx.strokeRect(left,top,right-left,bottom-top);
      ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();ctx.strokeStyle=options.color || "#8b49b6";ctx.lineWidth=3;ctx.beginPath();
      points.forEach(([x,y],i)=>{const [px,py]=pixel(x,y);i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.stroke();ctx.restore();
      ctx.fillStyle="#302638";ctx.textAlign="center";ctx.font="16px system-ui";ctx.fillText(options.title || "JavaScript plot",width/2,23);
      ctx.font="12px system-ui";ctx.fillText(options.xlabel || "x",width/2,height-10);
      ctx.save();ctx.translate(15,height/2);ctx.rotate(-Math.PI/2);ctx.fillText(options.ylabel || "y",0,0);ctx.restore();
      display.bridge.draw_figure(id,canvas.toDataURL("image/png").split(",")[1],width,height);
    }
    function remember(){history=history.slice(0,position+1);history.push([...limits]);position=history.length-1;}
    function event(name,x,y,button,key) {
      if(!alive())return;
      if(name==="pan"||name==="zoom"){mode=mode===name?"":name;drag=null;display.bridge.remove_rubberband(id);display.bridge.set_mode(id,mode);return;}
      if(name==="home"){limits=[...initial];remember();draw();return;}
      if(name==="back"||name==="forward"){position=Math.max(0,Math.min(history.length-1,position+(name==="back"?-1:1)));limits=[...history[position]];draw();return;}
      if(name==="key_press_event"&&key==="escape"){if(drag)limits=[...drag.limits];drag=null;display.bridge.remove_rubberband(id);draw();return;}
      if(name==="button_press_event"&&button===1&&mode&&x*width>=left&&x*width<=right&&y*height>=top&&y*height<=bottom){drag={x,y,limits:[...limits]};}
      if(name==="motion_notify_event"&&drag){
        if(mode==="pan"){
          const dx=(x-drag.x)*width/(right-left)*(drag.limits[1]-drag.limits[0]),dy=(y-drag.y)*height/(bottom-top)*(drag.limits[3]-drag.limits[2]);
          limits=[drag.limits[0]-dx,drag.limits[1]-dx,drag.limits[2]+dy,drag.limits[3]+dy];draw();
        }else display.bridge.draw_rubberband(id,drag.x,drag.y,x,y);
      }
      if(name==="button_release_event"&&drag){
        if(mode==="zoom"&&Math.abs(x-drag.x)*width>5&&Math.abs(y-drag.y)*height>5){const a=world(drag.x,drag.y),b=world(Math.max(left/width,Math.min(right/width,x)),Math.max(top/height,Math.min(bottom/height,y)));limits=[Math.min(a[0],b[0]),Math.max(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[1],b[1])];}
        drag=null;display.bridge.remove_rubberband(id);remember();draw();
      }
    }
    active.add(id);const card=display.bridge.add_figure(id,options.title || "JavaScript plot",event);draw();
    return {
      setData(x,y){data(x,y);draw();},
      ...controls(card,alive),
      close(){active.delete(id);display.bridge.remove_figure(id);},
    };
  }
  const api={
    plot,
    canvas(options={}) {
      const id=`js-canvas-${++serial}`,[width,height]=dimensions(options);
      const {canvas,card}=display.addCanvas(id,options.title || "JavaScript Canvas",width,height);active.add(id);
      const widgets=controls(card,()=>active.has(id));
      canvas.animate=callback=>{
        animations.get(id)?.();let handle=null,previous=null,stopped=false;
        const stop=()=>{stopped=true;if(handle!==null)cancelAnimationFrame(handle);animations.delete(id);};
        function frame(now){
          if(stopped || !active.has(id))return;
          const dt=previous===null?0:Math.min(.05,(now-previous)/1000);previous=now;
          try{callback(dt);}catch(error){stop();onError(error);return;}
          if(!stopped)handle=requestAnimationFrame(frame);
        }
        animations.set(id,stop);handle=requestAnimationFrame(frame);return stop;
      };
      canvas.slider=widgets.slider;canvas.button=widgets.button;canvas.close=()=>{animations.get(id)?.();active.delete(id);display.bridge.remove_figure(id);};
      return canvas;
    },
  };
  return {api,clear(){for(const stop of [...animations.values()])stop();active.clear();}};
}
