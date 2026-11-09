// Native Canvas display for Python, shared by the worker and main-thread runtime.
export function createPythonCanvasDisplay(display,onError) {
  const cards=new Map();
  const bridge={
    create(id,title,width,height,callback){
      const {canvas,card}=display.addCanvas(id,title,width,height);
      cards.set(id,{canvas,card,callback});
      card.area.setAttribute("aria-label",`${title}: interactive Python Canvas`);
      card.message.textContent="Interactive Python Canvas";
      const point=event=>{const box=canvas.getBoundingClientRect();return [(event.clientX-box.left)*width/box.width,(event.clientY-box.top)*height/box.height];};
      let pointer=null;
      const invoke=(event,...args)=>{if(cards.has(id))try{callback(event,...args);}catch(error){onError(error);}};
      canvas.addEventListener("pointerdown",event=>{
        if(event.button!==0||pointer!==null)return;
        event.preventDefault();pointer=event.pointerId;canvas.setPointerCapture(pointer);
        invoke("press",...point(event));
      });
      canvas.addEventListener("pointermove",event=>{if(pointer===null||pointer===event.pointerId)invoke("move",...point(event));});
      const release=event=>{if(pointer!==event.pointerId)return;invoke("release",...point(event));if(canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);pointer=null;};
      canvas.addEventListener("pointerup",release);canvas.addEventListener("pointercancel",release);
      return canvas.getContext("2d");
    },
    present(){},
    slider(id,key,label,min,max,step,value){
      const item=cards.get(id);if(!item)return;
      let controls=item.card.root.querySelector(".javascript-controls");
      if(!controls){controls=document.createElement("div");controls.className="javascript-controls";item.card.root.insertBefore(controls,item.card.message);}
      const container=document.createElement("label"),text=document.createElement("span"),input=document.createElement("input");
      text.textContent=`${label}: ${value}`;input.type="range";input.min=min;input.max=max;input.step=step;input.value=value;input.setAttribute("aria-label",label);
      container.append(text,input);controls.append(container);
      input.addEventListener("input",()=>{if(!cards.has(id))return;text.textContent=`${label}: ${input.value}`;try{item.callback("slider",key,Number(input.value));}catch(error){onError(error);}});
    },
    close(id){cards.delete(id);display.bridge.remove_figure(id);},
  };
  return {bridge,clear(){cards.clear();},frame(id,bitmap){try{const item=cards.get(id);if(item){const ctx=item.canvas.getContext("2d");ctx.clearRect(0,0,item.canvas.width,item.canvas.height);ctx.drawImage(bitmap,0,0);}}finally{bitmap.close();}}};
}
