import {ensureSyntaxTree,syntaxTree} from "@codemirror/language";
import {EditorView} from "@codemirror/view";

const javascriptScopes=new Set(["Script","Block","FunctionDeclaration","FunctionExpression","ArrowFunction","MethodDeclaration","ForStatement","CatchClause","ClassDeclaration","ClassExpression"]);
const javascriptFunctions=new Set(["Script","FunctionDeclaration","FunctionExpression","ArrowFunction","MethodDeclaration"]);
const pythonScopes=new Set(["Script","FunctionDefinition","ClassDefinition","LambdaExpression","ArrayComprehensionExpression","SetComprehensionExpression","DictionaryComprehensionExpression","ComprehensionExpression"]);
const cache=new WeakMap();
const children=node=>{const result=[];for(let child=node.firstChild;child;child=child.nextSibling)result.push(child);return result;};
const key=node=>`${node.name}:${node.from}:${node.to}`;
function nearest(node,names){for(;node;node=node.parent)if(names.has(node.name))return node;return null;}
function walk(node,visit){visit(node);for(const child of children(node))walk(child,visit);}

function indexDeclarations(state,language,tree){
  const scopes=language==="python"?pythonScopes:javascriptScopes,bindings=new Map(),declarations=new Map(),directives=new Map();
  const text=node=>state.sliceDoc(node.from,node.to);
  function add(node,scope,direct=true){
    if(!scope)return;
    const identity=key(scope),name=text(node),range={from:node.from,to:node.to};
    if(!bindings.has(identity))bindings.set(identity,new Map());
    const names=bindings.get(identity);
    if(!names.has(name)||node.from<names.get(name).from)names.set(name,range);
    if(direct)declarations.set(`${node.from}:${node.to}`,range);
  }
  function pythonTargets(node,scope){
    if(node.name==="VariableName")add(node,scope,false);
    else if(!["MemberExpression","SubscriptExpression"].includes(node.name))for(const child of children(node))pythonTargets(child,scope);
  }
  walk(tree.topNode,node=>{
    if(language!=="python"){
      if(node.name!=="VariableDefinition")return;
      const parent=node.parent;
      if(["FunctionDeclaration","ClassDeclaration"].includes(parent?.name)){add(node,nearest(parent.parent,scopes));return;}
      if(["FunctionExpression","ClassExpression"].includes(parent?.name)){add(node,parent);return;}
      let declaration=node.parent;
      while(declaration&&!scopes.has(declaration.name)&&!["VariableDeclaration","ForOfSpec","ForInSpec","ParamList"].includes(declaration.name))declaration=declaration.parent;
      const variable=declaration&&["VariableDeclaration","ForOfSpec","ForInSpec"].includes(declaration.name);
      const isVar=variable&&children(declaration).some(child=>child.name==="var");
      add(node,nearest(node.parent,isVar?javascriptFunctions:scopes));return;
    }
    const scope=nearest(node.parent,scopes),parts=children(node);
    if(node.name==="FunctionDefinition"||node.name==="ClassDefinition"){
      const name=node.getChild("VariableName");if(name)add(name,scope);
    }else if(node.name==="ParamList"){
      let parameter=true;
      for(const part of parts){
        if(part.name===","||part.name==="*"||part.name==="**")parameter=true;
        else if(part.name==="VariableName"&&parameter){add(part,scope);parameter=false;}
      }
    }else if(node.name==="AssignStatement"){
      const lastOperator=parts.findLastIndex(part=>part.name==="AssignOp");
      if(lastOperator>=0)for(const part of parts.slice(0,lastOperator))pythonTargets(part,scope);
    }else if(node.name==="ForStatement"){
      const end=parts.findIndex(part=>part.name==="in");
      for(const part of parts.slice(1,end))pythonTargets(part,scope);
    }else if(node.name.endsWith("ComprehensionExpression")){
      for(let i=0;i<parts.length;i++)if(parts[i].name==="for"){
        while(++i<parts.length&&parts[i].name!=="in")pythonTargets(parts[i],node);
      }
    }else if(node.name==="ImportStatement"){
      const start=parts.findIndex(part=>part.name==="import")+1;
      let imported=null,alias=false;
      for(const part of parts.slice(start)){
        if(part.name===","){if(imported)add(imported,scope);imported=null;alias=false;}
        else if(part.name==="as")alias=true;
        else if(part.name==="VariableName"&&(!imported||alias)){imported=part;alias=false;}
      }
      if(imported)add(imported,scope);
    }else if(node.name==="ScopeStatement"){
      const identity=key(scope);if(!directives.has(identity))directives.set(identity,new Map());
      for(const part of parts)if(part.name==="VariableName")directives.get(identity).set(text(part),text(parts[0]));
    }
  });
  return {bindings,declarations,directives,tree,language};
}

export function findDeclaration(state,position,language){
  const tree=ensureSyntaxTree(state,state.doc.length,100)||syntaxTree(state);
  let node=tree.resolveInner(position,-1);
  if(!["VariableName","VariableDefinition"].includes(node.name))node=tree.resolveInner(position,1);
  if(!["VariableName","VariableDefinition"].includes(node.name)||position<node.from||position>node.to)return null;
  let index=cache.get(state);
  if(!index||index.tree!==tree||index.language!==language){index=indexDeclarations(state,language,tree);cache.set(state,index);}
  const direct=index.declarations.get(`${node.from}:${node.to}`);if(direct)return direct;
  const name=state.sliceDoc(node.from,node.to),scopes=language==="python"?pythonScopes:javascriptScopes;
  let inPythonFunction=false,nonlocal=false;
  for(let scope=node.parent;scope;scope=scope.parent){
    if(!scopes.has(scope.name))continue;
    if(language==="python"){
      if(scope.name==="FunctionDefinition"||scope.name==="ClassDefinition"){
        const body=scope.getChild("Body");if(body&&node.from<body.from)continue;
      }
      if(scope.name==="ClassDefinition"&&inPythonFunction)continue;
      if(scope.name==="FunctionDefinition"||scope.name==="LambdaExpression")inPythonFunction=true;
      const directive=index.directives.get(key(scope))?.get(name);
      if(directive==="global")return index.bindings.get(key(tree.topNode))?.get(name)||null;
      if(directive==="nonlocal"){nonlocal=true;continue;}
      if(nonlocal&&scope.name!=="FunctionDefinition")continue;
    }
    const result=index.bindings.get(key(scope))?.get(name);if(result)return result;
  }
  return null;
}

export function declarationNavigation(getLanguage){
  let hover=null;
  const clear=view=>view.dom.classList.remove("cm-declaration-hover");
  function highlight(view,enabled){
    const position=enabled&&hover?view.posAtCoords(hover):null;
    view.dom.classList.toggle("cm-declaration-hover",position!==null&&!!findDeclaration(view.state,position,getLanguage()));
  }
  return EditorView.domEventHandlers({
    mousemove(event,view){
      hover=event.target.closest?.(".cm-content")?{x:event.clientX,y:event.clientY}:null;
      highlight(view,event.ctrlKey||event.metaKey);return false;
    },
    keydown(event,view){if(event.key==="Control"||event.key==="Meta")highlight(view,true);return false;},
    keyup(event,view){if(event.key==="Control"||event.key==="Meta")clear(view);return false;},
    mouseleave(event,view){hover=null;clear(view);return false;},
    blur(event,view){clear(view);return false;},
    mousedown(event,view){
    if(event.button!==0||!(event.ctrlKey||event.metaKey)||event.altKey||event.shiftKey||!event.target.closest?.(".cm-content"))return false;
    const position=view.posAtCoords({x:event.clientX,y:event.clientY});if(position===null)return false;
    const declaration=findDeclaration(view.state,position,getLanguage());if(!declaration)return false;
    event.preventDefault();
    view.dispatch({selection:{anchor:declaration.from,head:declaration.to},effects:EditorView.scrollIntoView(declaration.from,{y:"center"})});
    view.focus();return true;
  }});
}
