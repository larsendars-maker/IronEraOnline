import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express(), server=http.createServer(app);
const wss=new WebSocketServer({server});
app.use(express.static(path.join(__dirname,"public")));

const countries=[
{id:"aurora",name:"Аурория",color:"#4f8cff",x:120,y:170,w:190,h:140,ai:false,factories:8,manpower:420,steel:90,stability:72,divisions:12,aggression:50},
{id:"borealis",name:"Бореалия",color:"#e06c75",x:310,y:115,w:190,h:150,ai:true,factories:8,manpower:420,steel:90,stability:72,divisions:12,aggression:68},
{id:"centria",name:"Центрия",color:"#e5b567",x:300,y:255,w:180,h:145,ai:true,factories:8,manpower:420,steel:90,stability:72,divisions:12,aggression:44},
{id:"doria",name:"Дория",color:"#61c08b",x:500,y:180,w:190,h:170,ai:true,factories:8,manpower:420,steel:90,stability:72,divisions:12,aggression:72},
{id:"elyria",name:"Элирия",color:"#a78bfa",x:675,y:275,w:150,h:125,ai:true,factories:8,manpower:420,steel:90,stability:72,divisions:12,aggression:55}
];
const state={year:1936,day:1,turn:1,countries:Object.fromEntries(countries.map(c=>[c.id,c])),wars:[],log:["Мирная конференция завершена. ИИ-государства начинают самостоятельную игру."]};
const clients=new Set();

function broadcast(){
 const data=JSON.stringify({type:"state",state});
 for(const ws of clients) if(ws.readyState===1) ws.send(data);
}
function log(m){state.log.unshift(m);state.log=state.log.slice(0,12);}
function country(id){return state.countries[id];}
function warExists(a,b){return state.wars.some(w=>(w.a===a&&w.b===b)||(w.a===b&&w.b===a));}
function startWar(a,b){if(a!==b&&!warExists(a,b)){state.wars.push({a,b});log(`${country(a).name} объявляет войну: ${country(b).name}.`);return true}return false}
function aiTurn(){
 for(const c of Object.values(state.countries).filter(c=>c.ai)){
   if(c.steel>=40&&c.factories<16&&Math.random()<.55){c.steel-=40;c.factories++;log(`${c.name}: ИИ построил военный завод.`)}
   if(c.manpower>=30&&c.steel>=15&&Math.random()<.45){c.manpower-=30;c.steel-=15;c.divisions++;log(`${c.name}: ИИ сформировал дивизию.`)}
   if(c.aggression>=60&&Math.random()<.13){
     const candidates=Object.values(state.countries).filter(t=>t.id!==c.id);
     const t=candidates[Math.floor(Math.random()*candidates.length)];
     startWar(c.id,t.id);
   }
 }
}
function tick(){
 state.day++;state.turn++;
 if(state.day>30){state.day=1;state.year++}
 for(const c of Object.values(state.countries)){c.steel+=Math.floor(c.factories*.35);c.manpower+=2}
 aiTurn();broadcast();
}
setInterval(tick,5000);

function handle(ws,msg){
 if(msg.type==="join"){ws.country=msg.country||"aurora";ws.send(JSON.stringify({type:"joined",country:ws.country}));broadcast();return}
 if(msg.type==="action"){
   const c=country(ws.country||"aurora");
   if(msg.action==="factory"&&c.steel>=40){c.steel-=40;c.factories++;log(`${c.name}: построен военный завод.`)}
   else if(msg.action==="division"&&c.manpower>=30&&c.steel>=15){c.manpower-=30;c.steel-=15;c.divisions++;log(`${c.name}: сформирована дивизия.`)}
   else if(msg.action==="war"&&country(msg.target))startWar(c.id,msg.target);
   else ws.send(JSON.stringify({type:"error",message:"Недостаточно ресурсов или неверное действие."}));
   broadcast();
 }
 if(msg.type==="chat"){const text=String(msg.text||"").slice(0,180);if(text)broadcastChat(ws.country,text)}
}
function broadcastChat(id,text){
 const packet=JSON.stringify({type:"chat",from:country(id)?.name||"Игрок",text});
 for(const ws of clients)if(ws.readyState===1)ws.send(packet);
}
wss.on("connection",ws=>{
 clients.add(ws);
 ws.send(JSON.stringify({type:"state",state}));
 ws.on("message",raw=>{try{handle(ws,JSON.parse(raw.toString()))}catch(e){ws.send(JSON.stringify({type:"error",message:"Ошибка запроса."}))}});
 ws.on("close",()=>clients.delete(ws));
});
app.get("/health",(req,res)=>res.json({ok:true,players:clients.size,turn:state.turn}));
const PORT=process.env.PORT||10000;
server.listen(PORT,()=>console.log(`Iron Era running on ${PORT}`));
