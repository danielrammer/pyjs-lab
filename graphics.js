import backendSource from "./python_graphics_backend.py";
import example from "./examples/graphics.py";
import javascriptExample from "./examples/graphics.js";
import canvasSource from "./python_canvas.py";
import {createPythonCanvasDisplay} from "./python-canvas.js";
import {getLocale,t,registerTranslations} from "./i18n.js";
import niceguiExample from "./examples/nicegui-animation.py";
import canvasExample from "./examples/canvas.py";
import {createNiceGUISourceView} from "./nicegui-source.js";

registerTranslations([
  ["Beispiele","Examples"],
  ["Wähle oben NiceGUI, Canvas oder Matplotlib und führe das Beispiel aus.","Choose NiceGUI, Canvas or Matplotlib above and run the example."],
  ["Lädt Code in den Editor. Rückgängig stellt deinen Code wieder her.","Loads code into the editor. Undo restores your code."],
]);

export function initializeGraphics({loadExample, onError, getLanguage=()=>"python"}) {
  const outputTab = document.querySelector("#outputTab");
  const graphicsTab = document.querySelector("#graphicsTab");
  const bothTab = document.querySelector("#bothTab");
  const tabs=[outputTab,graphicsTab,bothTab];
  let selectedTab=outputTab;
  const output = document.querySelector("#output");
  const graphics = document.querySelector("#graphics");
  const figures = document.querySelector("#figures");
  const empty = document.querySelector("#graphicsEmpty");
  const count = document.querySelector("#graphicsCount");
  const cards = new Map();
  let backend = null;
  let canvasBackend = null;
  const canvasDisplay=createPythonCanvasDisplay({addCanvas:(...args)=>addCanvas(...args),bridge:{remove_figure:id=>bridge.remove_figure(id)}},onError);

  function showTab(tab) {
    selectedTab=tab;
    output.hidden = tab===graphicsTab; graphics.hidden = tab===outputTab;
    document.querySelector("#outputPanel").classList.toggle("output-both",tab===bothTab);
    for(const item of tabs){item.setAttribute("aria-selected",String(item===tab));item.tabIndex=item===tab?0:-1;}
  }
  for (const tab of tabs) {
    tab.addEventListener("click", () => showTab(tab));
    tab.addEventListener("keydown", event => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? outputTab : event.key === "End" ? bothTab : tabs[(tabs.indexOf(tab)+(event.key==="ArrowRight"?1:tabs.length-1))%tabs.length];
        showTab(next); next.focus();
      }
    });
  }
  function updateLanguage() {
    const js=getLanguage()==="javascript";
    document.querySelector("#niceguiExample").hidden=js;
    document.querySelector("#canvasExample").hidden=js;
    document.querySelector("#graphicsExample").textContent=js?t("Load example"):"Matplotlib";
    document.querySelector("#graphicsLanguage").textContent=js?"JavaScript graphics":"Python graphics";
    document.querySelector("#graphicsEmpty h2").textContent=js?"Bring your JavaScript code to life":"Bring your Python code to life";
    document.querySelector("#graphicsEmpty p").textContent=js?"Draw a chart with graphics.plot(), or draw on a Canvas. Pan, zoom, and add interactive sliders and buttons.":t("Wähle oben NiceGUI, Canvas oder Matplotlib und führe das Beispiel aus.");
  }
  document.querySelector("#niceguiExample").addEventListener("click",()=>{
    if(getLanguage()!=="python")return;
    let code=niceguiExample;
    if(getLocale()==="en")for(const [de,en] of [["Hallo 5RA!","Hello!"],["Grün","Green"],["Lila","Purple"],["Animation starten","Start animation"]])code=code.replaceAll(de,en);
    loadExample(code);
  });
  document.querySelector("#canvasExample").addEventListener("click",()=>{
    if(getLanguage()!=="python")return;
    let code=canvasExample;
    if(getLocale()==="en")code=code.replace("Bewegter Ball","Moving ball");
    loadExample(code);
  });
  document.querySelector("#graphicsExample").addEventListener("click", () => {
    let code=getLanguage()==="javascript"?javascriptExample:example;
    if(getLocale()==="de")for(const [en,de] of [
      ["Python graphics: change the curve with the slider below the plot.","Python-Grafik: Verändere die Kurve mit dem Regler unter dem Diagramm."],
      ["JavaScript graphics: change the curve with the slider.","JavaScript-Grafik: Verändere die Kurve mit dem Regler."],
      ["Play with a sine wave","Experimentiere mit einer Sinuskurve"],
      ["Reset amplitude","Amplitude zurücksetzen"],
      ["Drag the amplitude slider, or use Pan and Zoom above the plot.","Ziehe den Amplituden-Regler oder verwende Verschieben und Zoom über dem Diagramm."],
    ])code=code.replaceAll(en,de);
    loadExample(code);
  });
  document.querySelector("#graphicsFullscreen").addEventListener("click", async () => {
    try { document.fullscreenElement ? await document.exitFullscreen() : await graphics.requestFullscreen(); }
    catch (error) { onError(error); }
  });
  function updateCount() {
    count.textContent = cards.size ? ` (${cards.size})` : "";
    empty.hidden = cards.size > 0;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag); if (className) node.className = className;
    if (text !== undefined) node.textContent = text; return node;
  }
  function invoke(card, ...args) {
    try { card.callback(...args); } catch (error) { onError(error); }
  }
  function addFigure(id, title, callback) {
    if (cards.has(id)) return;
    const root = element("section", "figure-card");
    const heading = element("h3", "figure-title", title);
    const toolbar = element("div", "figure-toolbar"); toolbar.setAttribute("aria-label", `${title} controls`);
    const area = element("div", "figure-area"); area.tabIndex = 0; area.setAttribute("aria-label", `${title}: interactive Python plot`);
    const image = element("img", "figure-image"); image.alt = title; image.draggable = false;
    const band = element("div", "figure-rubberband"); band.hidden = true;
    const message = element("div", "figure-message", "Pan: drag the plot. Zoom: drag a rectangle.");
    area.append(image, band); root.append(heading, toolbar, area, message);
    const card = {root, area, image, band, message, callback, modes:{}};
    cards.set(id, card);
    for (const [name, label] of [["home","Reset"],["back","Back"],["forward","Forward"],["pan","Pan"],["zoom","Zoom"],["download","Save PNG"]]) {
      const button = element("button", undefined, label); button.type = "button";
      button.addEventListener("click", () => name === "download" ? download(id) : invoke(card, name));
      if (["pan", "zoom"].includes(name)) { card.modes[name] = button; button.setAttribute("aria-pressed", "false"); }
      toolbar.append(button);
    }
    let pointer = null;
    const coordinates = event => { const rect = area.getBoundingClientRect(); return [(event.clientX - rect.left)/rect.width, (event.clientY - rect.top)/rect.height]; };
    const modifiers = event => [event.ctrlKey ? "ctrl" : "", event.altKey ? "alt" : "", event.shiftKey ? "shift" : ""].filter(Boolean).join("+");
    const mouse = (name, event) => invoke(card, name, ...coordinates(event), event.button + 1, modifiers(event));
    area.addEventListener("pointerdown", event => {
      if (card.canvas) return;
      if (pointer !== null) return;
      pointer = event.pointerId; area.setPointerCapture(pointer); area.focus({preventScroll:true});
      event.preventDefault(); mouse("button_press_event", event);
    });
    area.addEventListener("pointermove", event => {if(!card.canvas)mouse("motion_notify_event", event);});
    area.addEventListener("pointerup", event => {
      if (pointer !== event.pointerId) return;
      mouse("button_release_event", event); area.releasePointerCapture(pointer); pointer = null;
    });
    area.addEventListener("pointercancel", event => { mouse("button_release_event", event); pointer = null; band.hidden = true; });
    area.addEventListener("pointerenter", event => mouse("figure_enter_event", event));
    area.addEventListener("pointerleave", event => mouse("figure_leave_event", event));
    area.addEventListener("contextmenu", event => event.preventDefault());
    for (const [dom, name] of [["keydown","key_press_event"],["keyup","key_release_event"]]) {
      area.addEventListener(dom, event => {
        if (event.key === "Tab") return;
        event.preventDefault();
        const keys = {ArrowLeft:"left", ArrowRight:"right", ArrowUp:"up", ArrowDown:"down", Escape:"escape", " ":" "};
        const key = [event.ctrlKey ? "ctrl" : "", event.altKey ? "alt" : "", event.shiftKey ? "shift" : "", keys[event.key] || event.key].filter(Boolean).join("+");
        invoke(card, name, 0.5, 0.5, 1, key);
      });
    }
    figures.append(root); updateCount(); if(selectedTab!==bothTab)showTab(graphicsTab);return card;
  }
  function download(id) {
    const card = cards.get(id); const source=card?.canvas?.toDataURL("image/png") || card?.image.src;if (!source) return;
    const link = document.createElement("a"); link.href = source; link.download = id.startsWith("js-")?"javascript-plot.png":"python-plot.png"; link.click();
  }
  const bridge = {
    add_figure:addFigure,
    draw_figure(id, png, width, height) {
      const card = cards.get(id); if (!card) return;
      card.image.src = `data:image/png;base64,${png}`;
      card.image.width = width; card.image.height = height; card.area.style.aspectRatio = `${width} / ${height}`;
    },
    remove_figure(id) { const card = cards.get(id); card?.dispose?.();card?.root.remove(); cards.delete(id); updateCount(); },
    set_message(id, message) { const card = cards.get(id); if (card) card.message.textContent = message; },
    set_cursor(id, cursor) { const card = cards.get(id); if (card) card.area.style.cursor = ({1:"default",2:"pointer",3:"crosshair",4:"move",5:"wait",6:"ew-resize",7:"ns-resize"})[cursor] || "default"; },
    set_mode(id, mode) { const card = cards.get(id); if (card) for (const [name, button] of Object.entries(card.modes)) button.setAttribute("aria-pressed", String(mode === name)); },
    draw_rubberband(id, x0, y0, x1, y1) {
      const band = cards.get(id)?.band; if (!band) return;
      Object.assign(band.style, {left:`${Math.min(x0,x1)*100}%`,top:`${Math.min(y0,y1)*100}%`,width:`${Math.abs(x1-x0)*100}%`,height:`${Math.abs(y1-y0)*100}%`}); band.hidden = false;
    },
    remove_rubberband(id) { const band = cards.get(id)?.band; if (band) band.hidden = true; },
    download_figure:download,
  };
  function addCanvas(id,title,width,height) {
      const card=addFigure(id,title,()=>{}),canvas=element("canvas","figure-canvas");
      canvas.width=width;canvas.height=height;canvas.setAttribute("aria-label",title);
      card.image.replaceWith(canvas);card.canvas=canvas;card.area.style.aspectRatio=`${width} / ${height}`;
      for(const button of card.root.querySelectorAll(".figure-toolbar button"))if(button.textContent!=="Save PNG")button.hidden=true;
      card.message.textContent="Interactive JavaScript Canvas";return {canvas,card};
  }
  return {
    bridge,
    updateLanguage,
    addCanvas,
    addWebApp(id,title,frame,dispose,stop) {
      const root=element("section","figure-card nicegui-preview");
      const header=element("div","figure-toolbar"),heading=element("h3","figure-title",title);
      const cancel=element("button",undefined,t("Stoppen"));cancel.type="button";cancel.addEventListener("click",stop);
      const docs=element("a","nicegui-docs",t("NiceGUI 3.18 · Browser-Version · Dokumentation"));
      docs.href="https://nicegui.io/documentation";docs.target="_blank";docs.rel="noopener noreferrer";
      header.append(heading,cancel);root.append(header,docs,frame,createNiceGUISourceView(frame));
      cards.set(id,{root,dispose});figures.append(root);updateCount();if(selectedTab!==bothTab)showTab(graphicsTab);
    },
    install(pyodide) {
      pyodide.registerJsModule("_pyjs_graphics", bridge);
      pyodide.FS.writeFile("/home/pyodide/pyjs_graphics_backend.py", backendSource);
      pyodide.registerJsModule("_pyjs_canvas",canvasDisplay.bridge);
      pyodide.FS.writeFile("/home/pyodide/pyjs_canvas.py",canvasSource);
      canvasBackend=pyodide.pyimport("pyjs_canvas");
      pyodide.runPython("import os as _pyjs_os; _pyjs_os.environ['MPLBACKEND'] = 'module://pyjs_graphics_backend'; del _pyjs_os");
    },
    configure(pyodide) {
      if (!backend && pyodide.loadedPackages.matplotlib) { backend = pyodide.pyimport("pyjs_graphics_backend"); backend.configure(); }
    },
    clear() {
      backend?.prepare_run(); canvasBackend?.prepare_run();canvasDisplay.clear();for(const card of cards.values())card.dispose?.();figures.replaceChildren(); cards.clear(); updateCount();
    },
    finish() { backend?.finish_run(); },
    showOutput() { if(selectedTab!==bothTab)showTab(outputTab); },
  };
}
