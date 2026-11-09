import {t,registerTranslations} from "./i18n.js";

registerTranslations([
  ["Momentaufnahme der App. Nach Änderungen auf Aktualisieren klicken.","App snapshot. Click Refresh after making changes."],
  ["Aktualisieren","Refresh"], ["HTML kopieren","Copy HTML"], ["CSS kopieren","Copy CSS"],
  ["Gerendertes HTML","Rendered HTML"], ["CSS-Quelle","CSS source"],
  ["Style-Attribute als CSS-Regeln","Style attributes as CSS rules"],
  ["Direkte Styles werden hier als CSS-Regeln dargestellt. Die geladenen Stylesheets stehen ebenfalls zur Auswahl.","Inline styles are shown here as CSS rules. Loaded stylesheets are also available in the list."],
  ["Die App ist noch nicht bereit. Nach dem Start erneut aktualisieren.","The app is not ready yet. Refresh after it has started."],
  ["Kopiert.","Copied."], ["Kopieren nicht möglich. Bitte den Code markieren und kopieren.","Could not copy. Please select and copy the code."],
  ["Dieses Stylesheet darf der Browser nicht auslesen (andere Herkunft).","The browser cannot read this stylesheet (different origin)."],
  ["Keine Style-Attribute vorhanden.","No style attributes found."],
]);

const voidTags=new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
const escapeText=text=>text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const escapeAttribute=text=>escapeText(text).replaceAll('"',"&quot;");

// This is a formatted view, not an executable clone of the student's DOM.
function formatHTML(node,depth=0){
  const indent="  ".repeat(depth);
  if(node.nodeType===3)return node.textContent.trim()?indent+escapeText(node.textContent):"";
  if(node.nodeType===8)return indent+`<!--${node.textContent}-->`;
  if(node.nodeType!==1)return "";
  if(["pre","textarea","script","style","code"].includes(node.localName))return indent+node.outerHTML;
  const tag=node.namespaceURI==="http://www.w3.org/1999/xhtml"?node.localName:node.tagName;
  const attributes=[...node.attributes].map(attr=>` ${attr.name}="${escapeAttribute(attr.value)}"`).join("");
  const start=`<${tag}${attributes}>`;
  if(voidTags.has(tag))return indent+start;
  if([...node.childNodes].every(child=>child.nodeType===3))return indent+start+escapeText(node.textContent)+`</${tag}>`;
  const children=[...node.childNodes].map(child=>formatHTML(child,depth+1)).filter(Boolean);
  return indent+start+"\n"+children.join("\n")+"\n"+indent+`</${tag}>`;
}

function inlineCSS(root){
  const selector=element=>{
    const parts=[];
    for(let item=element;item;item=item.parentElement){
      if(item.id){parts.unshift("#"+CSS.escape(item.id));break;}
      const siblings=[...item.parentElement.children].filter(sibling=>sibling.localName===item.localName);
      parts.unshift(item.localName+`:nth-of-type(${siblings.indexOf(item)+1})`);
      if(item===root)break;
    }
    return parts.join(" > ");
  };
  return [root,...root.querySelectorAll("[style]")].filter(element=>element.style.length).map(element=>{
    const declarations=[...element.style].map(name=>`  ${name}: ${element.style.getPropertyValue(name)}${element.style.getPropertyPriority(name)?" !important":""};`);
    return `${selector(element)} {\n${declarations.join("\n")}\n}`;
  }).join("\n\n") || `/* ${t("Keine Style-Attribute vorhanden.")} */`;
}

function cssSources(doc,root){
  const entries=[{label:t("Style-Attribute als CSS-Regeln"),read:()=>inlineCSS(root)}],seen=new Set();
  function visit(sheet){
    if(!sheet || seen.has(sheet))return;
    seen.add(sheet);
    const label=sheet.href?new URL(sheet.href).pathname.split("/").pop():`<style> ${entries.length}`;
    const read=()=>{try{return [...sheet.cssRules].map(rule=>rule.cssText).join("\n\n");}catch{return `/* ${t("Dieses Stylesheet darf der Browser nicht auslesen (andere Herkunft).")} */`;}};
    entries.push({label,read});
    try{for(const rule of sheet.cssRules)if(rule.type===3)visit(rule.styleSheet);}catch{/* Cross-origin CSS stays listed with an explanation. */}
  }
  for(const sheet of [...doc.styleSheets,...(doc.adoptedStyleSheets||[])])visit(sheet);
  return entries;
}

export function createNiceGUISourceView(frame){
  const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=t(text);return node;};
  const details=element("details","nicegui-source"),summary=element("summary",null,"HTML & CSS");
  const hint=element("p","nicegui-source-hint","Momentaufnahme der App. Nach Änderungen auf Aktualisieren klicken.");
  const tools=element("div","nicegui-source-tools");
  const refresh=element("button",null,"Aktualisieren"),copyHTML=element("button",null,"HTML kopieren"),copyCSS=element("button",null,"CSS kopieren");
  for(const button of [refresh,copyHTML,copyCSS])button.type="button";
  tools.append(refresh,copyHTML,copyCSS);
  const htmlHeading=element("h4",null,"Gerendertes HTML"),html=element("pre","nicegui-html-source");html.tabIndex=0;html.dataset.noI18n="";
  const cssLabel=element("label","nicegui-css-label","CSS-Quelle"),select=element("select","nicegui-css-select");select.setAttribute("aria-label",t("CSS-Quelle"));cssLabel.append(select);
  const cssHint=element("p","nicegui-source-hint","Direkte Styles werden hier als CSS-Regeln dargestellt. Die geladenen Stylesheets stehen ebenfalls zur Auswahl.");
  const css=element("pre","nicegui-css-source");css.tabIndex=0;css.dataset.noI18n="";
  const status=element("p","nicegui-source-status");status.setAttribute("role","status");
  let entries=[];
  function updateCSS(){css.textContent=entries[Number(select.value)]?.text||"";}
  function update(){
    const doc=frame.contentDocument,root=doc?.getElementById("app");
    if(!root?.children.length){status.textContent=t("Die App ist noch nicht bereit. Nach dem Start erneut aktualisieren.");return;}
    const previous=select.selectedOptions[0]?.textContent;
    html.textContent=formatHTML(root);
    entries=cssSources(doc,root).map(entry=>({label:entry.label,text:entry.read()}));select.replaceChildren();
    for(const [index,entry] of entries.entries()){const option=element("option",null,entry.label);option.value=String(index);select.append(option);}
    const selected=entries.findIndex(entry=>entry.label===previous);select.value=String(Math.max(0,selected));
    updateCSS();status.textContent="";
  }
  async function copy(source){
    try{await navigator.clipboard.writeText(source.textContent);status.textContent=t("Kopiert.");}
    catch{status.textContent=t("Kopieren nicht möglich. Bitte den Code markieren und kopieren.");}
  }
  refresh.addEventListener("click",update);select.addEventListener("change",updateCSS);
  copyHTML.addEventListener("click",()=>copy(html));copyCSS.addEventListener("click",()=>copy(css));
  details.addEventListener("toggle",()=>{if(details.open)update();});
  details.append(summary,hint,tools,htmlHeading,html,cssLabel,cssHint,css,status);
  return details;
}
