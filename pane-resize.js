export function initializePaneResize() {
  const main=document.querySelector("main"), divider=document.querySelector("#paneDivider");
  const mobile=matchMedia("(max-width:850px)");
  let ratio=0.6, pointer=null;
  function apply(value) {
    const box=main.getBoundingClientRect();
    const size=(mobile.matches?box.height:box.width)-32;
    const minimum=Math.max(0.15,Math.min(0.4,(mobile.matches?180:160)/size));
    ratio=Math.max(minimum,Math.min(1-minimum,value));
    main.style.setProperty("--editor-share",`${ratio}fr`);
    main.style.setProperty("--output-share",`${1-ratio}fr`);
    divider.setAttribute("aria-valuemin",String(Math.round(minimum*100)));
    divider.setAttribute("aria-valuemax",String(Math.round((1-minimum)*100)));
    divider.setAttribute("aria-valuenow",String(Math.round(ratio*100)));
    divider.setAttribute("aria-valuetext",`Code ${Math.round(ratio*100)}%, output ${Math.round((1-ratio)*100)}%`);
    divider.setAttribute("aria-orientation",mobile.matches?"horizontal":"vertical");
  }
  function move(event) {
    const box=main.getBoundingClientRect();
    const position=mobile.matches?event.clientY-box.top:event.clientX-box.left;
    apply((position-16)/((mobile.matches?box.height:box.width)-32));
  }
  divider.addEventListener("pointerdown",event=>{
    if(event.button!==0 || pointer!==null)return;
    pointer=event.pointerId;divider.setPointerCapture(pointer);divider.focus({preventScroll:true});
    document.body.classList.add("resizing-panes");event.preventDefault();
  });
  divider.addEventListener("pointermove",event=>{if(event.pointerId===pointer)move(event);});
  function end(event) {
    if(event.pointerId!==pointer)return;
    pointer=null;document.body.classList.remove("resizing-panes");
    if(divider.hasPointerCapture(event.pointerId))divider.releasePointerCapture(event.pointerId);
  }
  for(const event of ["pointerup","pointercancel","lostpointercapture"])divider.addEventListener(event,end);
  divider.addEventListener("dblclick",()=>apply(0.6));
  divider.addEventListener("keydown",event=>{
    const delta=event.shiftKey?0.1:0.025;
    if(["ArrowLeft","ArrowUp"].includes(event.key)){event.preventDefault();apply(ratio-delta);}
    else if(["ArrowRight","ArrowDown"].includes(event.key)){event.preventDefault();apply(ratio+delta);}
    else if(event.key==="Home"){event.preventDefault();apply(0);}
    else if(event.key==="End"){event.preventDefault();apply(1);}
  });
  mobile.addEventListener("change",()=>apply(ratio));
  window.addEventListener("resize",()=>apply(ratio));
  apply(ratio);
}
