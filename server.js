import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
app.use(express.static(path.join(__dirname, "public")));

const countries = [
  {id:"aurora", name:"Аурория", color:"#4f8cff", ai:false, factories:8, manpower:420, steel:90, stability:72, divisions:12, aggression:50,
   provinces:[
    [[75,135],[145,105],[225,125],[250,175],[225,245],[165,270],[100,250],[65,205]],
    [[250,175],[320,150],[365,195],[345,260],[275,275],[225,245]],
    [[145,105],[205,65],[285,80],[320,150],[250,175],[225,125]]
   ]},
  {id:"borealis", name:"Бореалия", color:"#d45b68", ai:true, factories:8, manpower:420, steel:90, stability:72, divisions:12, aggression:68,
   provinces:[
    [[300,60],[390,35],[485,65],[505,125],[450,165],[365,150],[320,150]],
    [[320,150],[365,150],[450,165],[445,220],[365,245],[320,205]],
    [[390,35],[505,25],[570,75],[505,125],[485,65]]
   ]},
  {id:"centria", name:"Центрия", color:"#c9a14a", ai:true, factories:8, manpower:420, steel:90, stability:72, divisions:12, aggression:44,
   provinces:[
    [[270,275],[345,260],[365,245],[445,220],[485,270],[465,345],[390,365],[315,340]],
    [[225,245],[275,275],[270,330],[205,350],[165,300]],
    [[445,220],[500,190],[545,235],[540,300],[485,270]]
   ]},
  {id:"doria", name:"Дория", color:"#4ca66f", ai:true, factories:8, manpower:420, steel:90, stability:72, divisions:12, aggression:72,
   provinces:[
    [[505,125],[570,75],[650,95],[700,145],[675,210],[610,235],[545,235],[500,190]],
    [[545,235],[610,235],[675,210],[710,270],[690,340],[610,345],[540,300]],
    [[650,95],[760,110],[790,180],[700,145]]
   ]},
  {id:"elyria", name:"Элирия", color:"#8e6bc5", ai:true, factories:8, manpower:420, steel:90, stability:72, divisions:12, aggression:55,
   provinces:[
    [[690,340],[710,270],[790,250],[820,315],[800,395],[735,420],[680,390]],
    [[790,180],[835,200],[850,275],[790,250],[710,270],[700,145]],
    [[610,345],[690,340],[680,390],[735,420],[680,475],[600,450]]
   ]}
];

const state = {
  year:1936, day:1, turn:1,
  countries:Object.fromEntries(countries.map(c=>[c.id,c])),
  wars:[],
  players:[],
  log:["Мирная конференция завершена. Великие державы готовятся к новой эпохе."]
};
const clients = new Map();

function safeName(v){
  const s=String(v??"").trim().replace(/[<>]/g,"").slice(0,20);
  return s || "Игрок";
}
function log(m){ state.log.unshift(m); state.log=state.log.slice(0,14); }
function getCountry(id){return state.countries[id];}
function occupiedCountry(id, exceptId=null){
  for(const p of state.players) if(p.country===id && p.id!==exceptId) return true;
  return false;
}
function warExists(a,b){return state.wars.some(w=>(w.a===a&&w.b===b)||(w.a===b&&w.b===a));}
function startWar(a,b){
  if(a!==b && getCountry(b) && !warExists(a,b)){
    state.wars.push({a,b});
    log(`${getCountry(a).name} объявляет войну ${getCountry(b).name}.`);
    return true;
  }
  return false;
}
function publicState(){
  return {
    year:state.year, day:state.day, turn:state.turn,
    countries:state.countries, wars:state.wars, log:state.log,
    players:state.players.map(p=>({id:p.id,nick:p.nick,country:p.country}))
  };
}
function broadcast(){
  const packet=JSON.stringify({type:"state",state:publicState()});
  for(const ws of clients.keys()) if(ws.readyState===1) ws.send(packet);
}
function broadcastChat(from,text){
  const packet=JSON.stringify({type:"chat",from,text});
  for(const ws of clients.keys()) if(ws.readyState===1) ws.send(packet);
}
function aiTurn(){
  for(const c of Object.values(state.countries).filter(c=>c.ai)){
    if(c.steel>=40 && c.factories<16 && Math.random()<.55){
      c.steel-=40; c.factories++; log(`${c.name}: построен военный завод.`);
    }
    if(c.manpower>=30 && c.steel>=15 && Math.random()<.45){
      c.manpower-=30; c.steel-=15; c.divisions++; log(`${c.name}: сформирована дивизия.`);
    }
    if(c.aggression>=60 && Math.random()<.13){
      const candidates=Object.values(state.countries).filter(t=>t.id!==c.id);
      const t=candidates[Math.floor(Math.random()*candidates.length)];
      startWar(c.id,t.id);
    }
  }
}
function tick(){
  state.day++; state.turn++;
  if(state.day>30){state.day=1;state.year++;}
  for(const c of Object.values(state.countries)){
    c.steel+=Math.floor(c.factories*.35);
    c.manpower+=2;
  }
  aiTurn();
  broadcast();
}
setInterval(tick,5000);

function leave(ws){
  const p=clients.get(ws);
  if(!p) return;
  clients.delete(ws);
  const i=state.players.findIndex(x=>x.id===p.id);
  if(i>=0){
    const gone=state.players.splice(i,1)[0];
    log(`${gone.nick} покинул мировую карту.`);
  }
  broadcast();
}

wss.on("connection",ws=>{
  const id=crypto.randomUUID();
  ws.on("message",raw=>{
    try{
      const m=JSON.parse(raw.toString());

      if(m.type==="join"){
        if(clients.has(ws)) return;
        const nick=safeName(m.nick);
        const countryId=state.countries[m.country] ? m.country : "aurora";
        if(occupiedCountry(countryId)){
          ws.send(JSON.stringify({type:"error",message:"Эта страна уже занята другим игроком."}));
          return;
        }
        const p={id,nick,country:countryId};
        clients.set(ws,p);
        state.players.push(p);
        log(`${nick} вступил в мировую войну за ${getCountry(countryId).name}.`);
        ws.send(JSON.stringify({type:"joined",id,country:countryId}));
        broadcast();
        return;
      }

      const p=clients.get(ws);
      if(!p){ws.send(JSON.stringify({type:"error",message:"Сначала войдите в игру."}));return;}

      if(m.type==="change_country"){
        const target=state.countries[m.country];
        if(!target){ws.send(JSON.stringify({type:"error",message:"Страна не найдена."}));return;}
        if(occupiedCountry(target.id,p.id)){ws.send(JSON.stringify({type:"error",message:"Эта страна уже занята."}));return;}
        const old=getCountry(p.country).name;
        p.country=target.id;
        log(`${p.nick} сменил державу: ${old} → ${target.name}.`);
        broadcast();
        return;
      }

      if(m.type==="action"){
        const c=getCountry(p.country);
        if(m.action==="factory" && c.steel>=40){
          c.steel-=40;c.factories++;log(`${p.nick}: ${c.name} построила военный завод.`);
        } else if(m.action==="division" && c.manpower>=30 && c.steel>=15){
          c.manpower-=30;c.steel-=15;c.divisions++;log(`${p.nick}: ${c.name} сформировала дивизию.`);
        } else if(m.action==="war" && getCountry(m.target)){
          if(startWar(c.id,m.target)) log(`${p.nick} отдал приказ начать войну.`);
        } else {
          ws.send(JSON.stringify({type:"error",message:"Недостаточно ресурсов или неверное действие."}));
          return;
        }
        broadcast();
      }

      if(m.type==="chat"){
        const text=String(m.text??"").trim().slice(0,180);
        if(text) broadcastChat(p.nick,text);
      }
    }catch{
      ws.send(JSON.stringify({type:"error",message:"Некорректный запрос."}));
    }
  });
  ws.on("close",()=>leave(ws));
});

app.get("/health",(req,res)=>res.json({ok:true,players:state.players.length,turn:state.turn}));
const PORT=process.env.PORT||10000;
server.listen(PORT,"0.0.0.0",()=>console.log(`Iron Era Online listening on ${PORT}`));
