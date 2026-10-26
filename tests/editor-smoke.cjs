const assert=require("node:assert/strict"),fs=require("node:fs");
const src=fs.readFileSync("src/main/resources/assets/bluemap_marker_tool/area-draw.js","utf8");
class E{
 constructor(tag){this.tag=tag;this.id="";this.style={};this.children=[];this.value="";this.dataset={};this.innerHTML="";this.listeners={};this.queries={}}
 appendChild(x){this.children.push(x);return x}
 removeChild(x){this.children=this.children.filter(y=>x!==y)}
 get firstChild(){return this.children[0]||null}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn)}
 querySelector(s){return this.queries[s]??=new E(s)}
 querySelectorAll(){return []}
 contains(){return false}
 getBoundingClientRect(){return {left:0,top:0,width:800,height:600}}
 remove(){}
}
class V{
 constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z})}
 project(){this.x/=1000;this.y/=1000;this.z=.5;return this}
}
async function main(){
 const canvas=new E("canvas"),viewer=new E("viewer");viewer.querySelector=()=>canvas;
 const sets=new Map([["another-plugin",{label:"Unrelated set"}]]);
 const root={markerSets:sets,updateMarkerSetFromData(k,v){sets.set(k,v)},remove(v){for(const [k,x] of sets)if(x===v)sets.delete(k)}};
 const bm={mapViewer:{rootElement:viewer,markers:root,_camera:{position:{x:0,y:200,z:0}},
  raycaster:{ray:{origin:new V(0,200,0),direction:{x:1,y:-1,z:1}},setFromCamera(v){this.ray.direction={x:1+v.x,y:-1,z:1+v.y}}}},markerFileManager:{}};
 const body=new E("body"),doc={body,head:new E("head"),createElement:t=>new E(t),createElementNS:(n,t)=>new E(t),addEventListener(){}};
 const original={items:[{id:"a",type:"area",title:"A",color:"#4caf50",y:64,fill:.25,points:[{x:0,z:0},{x:2,z:0},{x:2,z:3}]},
  {id:"t",type:"text",title:"T",color:"#ffffff",y:70,points:[{x:1,z:1}]}]};
 const saves=[];let exported="";
 const fetch=(url,opt)=>url==="/xyn-config.json"?Promise.resolve({ok:true,json:async()=>({apiPort:8034})}):
  opt?.method==="POST"?(saves.push(JSON.parse(opt.body)),Promise.resolve({ok:true,status:200})):
  Promise.resolve({ok:true,json:async()=>original});
 const win={bluemap:bm,location:{protocol:"https:",origin:"https://example.invalid",hostname:"example.invalid"}};
 const nav={clipboard:{writeText(x){exported=x;return Promise.resolve()}}};
 new Function("window","document","fetch","setTimeout","requestAnimationFrame","innerWidth","innerHeight","navigator","console",src)(
  win,doc,fetch,()=>{},()=>{},800,600,nav,{log(){},warn(){}});
 for(let i=0;i<12;i++)await Promise.resolve();
 const panel=body.children.find(x=>x.id==="xynPanel");assert(panel);
 for(const label of ["Road","Sea","Air"]){
  const create=panel.querySelector("#xNew"+label);assert.equal(typeof create.onclick,"function");
  create.onclick();
  for(const x of [320,380]){
   const ev={button:0,clientX:x,clientY:290,target:canvas,stopPropagation(){},preventDefault(){}};
   for(const fn of canvas.listeners.pointerdown||[])fn(ev);
   for(const fn of canvas.listeners.pointerup||[])fn(ev);
  }
 }
 for(const id of ["areas","labels","roads","sea_routes","air_routes","another-plugin"]){
  assert(sets.has(id),"Missing set "+id);
 }
 for(const id of ["roads","sea_routes","air_routes"]){
  const markers=Object.values(sets.get(id).markers);
  assert.equal(markers.length,1);assert.equal(markers[0].type,"line");assert.equal(markers[0].line.length,2);
 }
 panel.querySelector("#xExport").onclick();
 for(const id of ["roads","sea_routes","air_routes"])assert(exported.includes(id+": {"));
 assert(saves.length>=3);
 console.log("Marker editor smoke test: PASS");
}
main().catch(e=>{console.error(e);process.exitCode=1});
