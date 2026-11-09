import {build} from "esbuild";
import {readFile} from "node:fs/promises";
await build({entryPoints:["python-worker.js"],bundle:true,minify:true,loader:{".py":"text"},outfile:"python-worker.bundle.txt",format:"iife"});
await build({entryPoints:["app.js"],bundle:true,minify:true,loader:{".py":"text"},outfile:"app.bundle.js",plugins:[{
  name:"graphics-example-source",
  setup(build){build.onLoad({filter:/[\\/]examples[\\/]graphics\.js$/},async args=>({contents:await readFile(args.path,"utf8"),loader:"text"}));},
}]});
