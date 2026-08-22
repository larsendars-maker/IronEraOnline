
import express from "express";
import http from "http";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { WebSocketServer } from "ws";
import pg from "pg";

const { Pool } = pg;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = Number(process.env.PORT || 10000);

app.use(express.json({limit:"1mb"}));
app.use(express.static(new URL("./public", import.meta.url).pathname));

const pool = process.env.DATABASE_URL
  ? new Pool({connectionString:process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}})
  : null;

const sessions = new Map();
const sockets = new Map();
const rooms = new Map();

const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

const countrySeeds = [
  ["aurora","AUR","Аурория","#4d7fd8","auroraCapital",false,56,240],
  ["borealis","BOR","Бореалия","#b25561","borealisCapital",true,62,280],
  ["centria","CEN","Центрия","#b5964e","centriaCapital",true,46,190],
  ["doria","DOR","Дория","#4e9a6a","doriaCapital",true,44,200],
  ["elyria","ELY","Элирия","#825fba","elyriaCapital",true,58,260],
  ["iberia","IBE","Иберия","#a56548","iberiaCapital",true,34,175],
  ["gallia","GAL","Галлия","#6f95b5","galliaCapital",true,50,210],
  ["scandinavia","SCA","Скандинавия","#709a92","scandiCapital",true,38,150],
  ["anatolia","ANA","Анатолия","#8b8b59","anatoliaCapital",true,42,230],
  ["persia","PER","Персия","#6e8f8b","persiaCapital",true,36,220],
  ["india","IND","Индостан","#9d7760","indiaCapital",true,52,340],
  ["japania","JAP","Япония","#9d5d7e","japanCapital",true,54,260]
];

const provinceDefs = [
  ["auroraCapital","Аурория — столица","aurora","city",120,145,["a2","a3"]],
  ["a2","Аурория — север","aurora","plains",85,90,["auroraCapital","b1"]],
  ["a3","Аурория — юг","aurora","forest",105,220,["auroraCapital","c1"]],
  ["b1","Бореалия — столица","borealis","city",250,110,["b2","a2","c1"]],
  ["b2","Бореалия — восток","borealis","plains",335,95,["b1","d1"]],
  ["b3","Бореалия — юг","borealis","hills",300,190,["b1","c2","d1"]],
  ["c1","Центрия — столица","centria","city",215,235,["a3","b1","c2","e1"]],
  ["c2","Центрия — восток","centria","plains",300,270,["b3","c1","d2"]],
  ["d1","Дория — столица","doria","city",420,170,["b2","b3","d2","e2"]],
  ["d2","Дория — юг","doria","forest",405,260,["c2","d1","f1"]],
  ["e1","Элирия — столица","elyria","city",500,230,["c2","d2","e2","g1"]],
  ["e2","Элирия — север","elyria","plains",520,150,["d1","e1","f2"]],
  ["f1","Иберия — столица","iberia","city",90,385,["c1","g1"]],
  ["f2","Иберия — север","iberia","hills",140,320,["c1","e1","f1"]],
  ["g1","Галлия — столица","gallia","city",240,390,["f1","e1","g2","h1"]],
  ["g2","Галлия — север","gallia","plains",250,335,["g1","c2","h1"]],
  ["h1","Скандинавия — столица","scandinavia","forest",170,270,["b1","g1","i1"]],
  ["h2","Скандинавия — север","scandinavia","mountains",170,160,["h1","b1"]],
  ["i1","Анатолия — столица","anatolia","city",540,370,["d2","g1","i2","j1"]],
  ["i2","Анатолия — восток","anatolia","mountains",620,340,["i1","j1"]],
  ["j1","Персия — столица","persia","city",640,440,["i1","i2","k1"]],
  ["k1","Индостан — столица","india","city",755,455,["j1","k2","l1"]],
  ["k2","Индостан — восток","india","plains",820,430,["k1","l2"]],
  ["l1","Япония — столица","japania","city",850,275,["l2"]],
  ["l2","Япония — север","japania","mountains",820,215,["l1"]]
];

const techs = [
  ["infantry_weapons","Пехотное оружие","Сухопутные",100,"+2 к мягкой атаке пехоты"],
  ["artillery","Дивизионная артиллерия","Сухопутные",125,"+3 к мягкой атаке"],
  ["motorization","Моторизация","Сухопутные",150,"+1 скорость моторизованных"],
  ["medium_tanks","Средние танки","Броня",180,"+5 к твёрдой атаке танков"],
  ["logistics","Логистика","Промышленность",140,"+12 TC"],
  ["industry","Промышленная эффективность","Промышленность",120,"+8% эффективной IC"],
  ["radar","Радар","Авиация",150,"+8 к воздушной обороне"],
  ["fighters","Истребители","Авиация",170,"+8 к воздушной атаке"],
  ["naval_doctrine","Морская доктрина","Флот",165,"+8 морской силы"],
  ["submarines","Подводные лодки","Флот",155,"+10 атаки конвоев"],
  ["grand_plan","Оперативное планирование","Доктрины",210,"+6 максимуму организации"]
].map(([id,name,group,cost,effect])=>({id,name,group,cost,effect}));

function polyFor(x,y,s=34){
  return [[x-s,y-s],[x+s,y-s+5],[x+s+8,y+s],[x-6,y+s+10],[x-s-5,y+8]];
}
function makeWorld(){
  const countries={};
  for(const [id,tag,name,color,capital,ai,ic,mp] of countrySeeds){
    countries[id] = {
      id,tag,name,color,capital,ai,ideology:ai?"Авторитаризм":"Республика",
      ic,baseIc:ic,manpower:mp,metal:60,oil:34,rare:28,energy:70,money:50,
      stability:70,warSupport:ai?45:28,tc:ic+35,politicalPoints:30,
      researched:[],researchSlots:[null,null,null],production:[],
      units:[],faction:null,relations:{},spyNetworks:{},casualties:0,
      air:{fighters:8,bombers:3},navy:{destroyers:5,cruisers:1,submarines:3,convoys:15}
    };
  }
  const provinces={};
  for(const [id,name,owner,terrain,x,y,nbr] of provinceDefs){
    provinces[id]={id,name,owner,controller:owner,terrain,x,y,poly:polyFor(x,y),neighbors:nbr,
      industry:owner==="aurora"?7:5, infrastructure:terrain==="city"?8:5, victory:terrain==="city"?10:2,
      oil:Math.random()<.2?4:0, metal:2+Math.floor(Math.random()*3), rare:1+Math.floor(Math.random()*2),
      port:terrain==="coast"?4:0,resistance:0
    };
  }
  const state={year:1936,month:1,day:1,tick:0,paused:false,speed:1,weather:"clear",
    countries,provinces,wars:[],factions:[],players:[],events:[],log:["1936. Новая мировая кампания началась."]};
  // Spawn a few starter divisions
  for(const c of Object.values(countries)){
    const home=Object.values(provinces).find(p=>p.owner===c.id);
    c.units=[
      {id:crypto.randomUUID(),name:"1-я дивизия",type:"infantry",province:home.id,strength:10,max:10,org:80,exp:5,order:null,commander:"Генерал I"},
      {id:crypto.randomUUID(),name:"2-я дивизия",type:c.id==="aurora"?"armor":"infantry",province:home.id,strength:10,max:10,org:72,exp:5,order:null,commander:"Генерал II"}
    ];
    c.production.push({id:crypto.randomUUID(),type:"infantry",remaining:30,total:30});
  }
  return state;
}
function log(state,msg){ state.log.unshift(msg); state.log=state.log.slice(0,30); }
function getRoom(id){return rooms.get(id)}
function sanitizeNick(s){return String(s||"").replace(/[<>]/g,"").trim().slice(0,20)}
function roomState(room){
  const s=room.state;
  return {
    id:room.id,name:room.name,host:room.host,status:room.status,maxPlayers:room.maxPlayers,
    year:s.year,month:s.month,day:s.day,paused:s.paused,speed:s.speed,weather:s.weather,
    countries:s.countries,provinces:s.provinces,wars:s.wars,factions:s.factions,players:s.players,
    log:s.log,events:s.events.slice(-20),techs
  };
}
function broadcastRoom(room){
  const packet=JSON.stringify({type:"room_state",room:roomState(room)});
  for(const ws of wss.clients){
    const ses=sockets.get(ws);
    if(ses?.roomId===room.id && ws.readyState===1) ws.send(packet);
  }
}
async function dbInit(){
  if(!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ie_users(
      id uuid primary key,
      username varchar(40) unique not null,
      password_hash text not null,
      created_at timestamptz default now()
    );
    CREATE TABLE IF NOT EXISTS ie_rooms(
      id varchar(24) primary key,
      name varchar(80) not null,
      payload jsonb not null,
      updated_at timestamptz default now()
    );
  `);
}
async function saveRoom(room){
  if(!pool) return;
  await pool.query(`INSERT INTO ie_rooms(id,name,payload,updated_at) VALUES($1,$2,$3,now())
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,payload=EXCLUDED.payload,updated_at=now()`,
    [room.id,room.name,JSON.stringify({state:room.state,status:room.status,host:room.host,maxPlayers:room.maxPlayers})]);
}
async function loadRooms(){
  if(!pool) return;
  const r=await pool.query(`SELECT * FROM ie_rooms ORDER BY updated_at DESC LIMIT 30`);
  for(const row of r.rows){
    const saved=row.payload;
    rooms.set(row.id,{id:row.id,name:row.name,status:saved.status||"waiting",host:saved.host||null,maxPlayers:saved.maxPlayers||20,state:saved.state||makeWorld(),lastSave:Date.now()});
  }
}
function createRoom(name,hostId,maxPlayers=20){
  const id=crypto.randomBytes(4).toString("hex");
  const state=makeWorld();
  state.paused=true;
  const room={id,name:name.slice(0,50),status:"waiting",host:hostId,maxPlayers:Math.max(2,Math.min(40,Number(maxPlayers)||20)),state,lastSave:Date.now()};
  rooms.set(id,room);
  return room;
}
function makeToken(){return crypto.randomBytes(24).toString("hex")}
async function authUser(username,password){
  username=String(username||"").trim();
  if(!/^[a-zA-Z0-9_]{3,20}$/.test(username)) throw new Error("Ник: 3–20 символов, только латиница, цифры и _.");
  if(String(password||"").length<4) throw new Error("Пароль должен быть не короче 4 символов.");
  if(!pool){
    const existing=[...sessions.values()].find(s=>s.username===username);
    if(existing) return existing;
    const s={userId:crypto.randomUUID(),username,token:makeToken()};
    sessions.set(s.token,s);return s;
  }
  const found=await pool.query(`SELECT * FROM ie_users WHERE username=$1`,[username]);
  if(!found.rows[0]){
    const hash=await bcrypt.hash(password,10);
    const id=crypto.randomUUID();
    await pool.query(`INSERT INTO ie_users(id,username,password_hash) VALUES($1,$2,$3)`,[id,username,hash]);
    const token=makeToken(); const s={userId:id,username,token}; sessions.set(token,s); return s;
  }
  const ok=await bcrypt.compare(password,found.rows[0].password_hash);
  if(!ok) throw new Error("Неверный логин или пароль.");
  const token=makeToken(); const s={userId:found.rows[0].id,username,token}; sessions.set(token,s); return s;
}
function sessionFromReq(req){
  const token=(req.headers.authorization||"").replace(/^Bearer\s+/,"");
  return sessions.get(token)||null;
}
function publicUser(s){return s?{id:s.userId,username:s.username}:null}

app.get("/",(req,res)=>res.sendFile(new URL("./public/index.html",import.meta.url).pathname));
app.get("/lobby",(req,res)=>res.sendFile(new URL("./public/pages/lobby.html",import.meta.url).pathname));
app.get("/game",(req,res)=>res.sendFile(new URL("./public/pages/game.html",import.meta.url).pathname));
app.get("/profile",(req,res)=>res.sendFile(new URL("./public/pages/profile.html",import.meta.url).pathname));

app.get("/api/me",(req,res)=>res.json({user:publicUser(sessionFromReq(req))}));
app.post("/api/auth/register",async(req,res)=>{
  try{
    const s=await authUser(req.body.username,req.body.password);
    res.json({ok:true,token:s.token,user:publicUser(s)});
  }catch(e){res.status(400).json({ok:false,error:e.message})}
});
app.post("/api/auth/login",async(req,res)=>{
  try{
    const s=await authUser(req.body.username,req.body.password);
    res.json({ok:true,token:s.token,user:publicUser(s)});
  }catch(e){res.status(400).json({ok:false,error:e.message})}
});
app.post("/api/auth/logout",(req,res)=>{
  const s=sessionFromReq(req); if(s) sessions.delete(s.token); res.json({ok:true});
});
app.get("/api/rooms",(req,res)=>{
  res.json([...rooms.values()].map(r=>({
    id:r.id,name:r.name,status:r.status,host:r.host,maxPlayers:r.maxPlayers,
    players:r.state.players.length,date:`${r.state.year}.${String(r.state.month).padStart(2,"0")}.${String(r.state.day).padStart(2,"0")}`
  })));
});
app.post("/api/rooms",(req,res)=>{
  const s=sessionFromReq(req);
  if(!s) return res.status(401).json({ok:false,error:"Нужна авторизация."});
  const room=createRoom(String(req.body.name||`${s.username} — кампания`),s.username,req.body.maxPlayers);
  saveRoom(room).catch(()=>{});
  res.json({ok:true,roomId:room.id});
});
app.get("/api/profile",(req,res)=>{
  const s=sessionFromReq(req);
  if(!s) return res.status(401).json({ok:false,error:"Нужна авторизация."});
  const roomHistory=[...rooms.values()].filter(r=>r.state.players.some(p=>p.nick===s.username)).map(r=>({id:r.id,name:r.name,status:r.status,date:`${r.state.year}.${r.state.month}.${r.state.day}`}));
  res.json({ok:true,user:publicUser(s),history:roomHistory});
});
app.get("/health",(req,res)=>res.json({ok:true,rooms:rooms.size,online:[...sockets.values()].length}));

wss.on("connection",ws=>{
  sockets.set(ws,{userId:null,username:null,roomId:null,country:null});
  ws.on("message",async raw=>{
    let m; try{m=JSON.parse(raw.toString())}catch{return}
    const ses=sockets.get(ws);
    if(m.type==="auth"){
      const token=String(m.token||""); const user=sessions.get(token);
      if(!user){ws.send(JSON.stringify({type:"error",message:"Сессия недействительна."}));return}
      ses.userId=user.userId;ses.username=user.username;
      ws.send(JSON.stringify({type:"auth_ok",user:publicUser(user)}));
      return;
    }
    if(m.type==="join_room"){
      const room=rooms.get(String(m.roomId));
      if(!room){ws.send(JSON.stringify({type:"error",message:"Комната не найдена."}));return}
      if(!ses.userId){ws.send(JSON.stringify({type:"error",message:"Сначала авторизуйся."}));return}
      if(room.state.players.some(p=>p.nick===ses.username)){
        ses.roomId=room.id; ses.country=room.state.players.find(p=>p.nick===ses.username)?.country||null;
        broadcastRoom(room); return;
      }
      if(room.state.players.length>=room.maxPlayers){ws.send(JSON.stringify({type:"error",message:"Комната заполнена."}));return}
      // Country must be explicitly selected server-side.
      if(!m.country || !room.state.countries[m.country]){ws.send(JSON.stringify({type:"need_country"}));return}
      if(room.state.players.some(p=>p.country===m.country)){ws.send(JSON.stringify({type:"error",message:"Эта страна уже занята."}));return}
      const player={id:ses.userId,nick:ses.username,country:m.country,ready:false,host:room.state.players.length===0};
      room.state.players.push(player); ses.roomId=room.id;ses.country=m.country;
      if(!room.host) room.host=ses.username;
      log(room.state,`${ses.username} вошёл в комнату за ${room.state.countries[m.country].name}.`);
      broadcastRoom(room); saveRoom(room).catch(()=>{});
      return;
    }
    if(m.type==="set_ready"){
      const room=rooms.get(ses.roomId); if(!room) return;
      const p=room.state.players.find(x=>x.id===ses.userId); if(p) p.ready=!!m.value;
      const humanCount=room.state.players.length, allReady=humanCount>0 && room.state.players.every(x=>x.ready);
      if(room.status==="waiting" && allReady) {room.status="running";room.state.paused=false;log(room.state,"Кампания началась.")}
      broadcastRoom(room); return;
    }
    if(m.type==="start_room"){
      const room=rooms.get(ses.roomId);if(!room)return;
      if(room.host!==ses.username){ws.send(JSON.stringify({type:"error",message:"Только хост может начать кампанию."}));return}
      room.status="running";room.state.paused=false;log(room.state,`${ses.username} запустил кампанию.`);
      broadcastRoom(room);return;
    }
    if(m.type==="action"){
      const room=rooms.get(ses.roomId); if(!room)return;
      const p=room.state.players.find(x=>x.id===ses.userId); if(!p)return;
      const c=room.state.countries[p.country];
      if(!c)return;
      const action=m.action;
      if(action==="build_factory"){
        if(c.metal<6){ws.send(JSON.stringify({type:"error",message:"Не хватает металла."}));return}
        c.metal-=6;c.ic+=2;c.baseIc+=2;log(room.state,`${p.nick}: построена промышленность.`)
      } else if(action==="add_division"){
        const t=m.template||"infantry";const prod={id:crypto.randomUUID(),type:t,remaining:24,total:24};c.production.push(prod);
      } else if(action==="declare_war"){
        const target=m.target;if(target&&room.state.countries[target]&&target!==c.id){
          if(!room.state.wars.some(w=>(w.a===c.id&&w.b===target)||(w.a===target&&w.b===c.id))){
            room.state.wars.push({a:c.id,b:target,started:[room.state.year,room.state.month,room.state.day]});
            log(room.state,`${c.name} объявляет войну ${room.state.countries[target].name}.`);
          }
        }
      } else if(action==="research"){
        const tech=techs.find(t=>t.id===m.tech);const slot=Number(m.slot);
        if(!tech || slot<0 || slot>=c.researchSlots.length || c.researched.includes(tech.id) || c.researchSlots[slot]){
          ws.send(JSON.stringify({type:"error",message:"Нельзя начать это исследование."}));return
        }
        c.researchSlots[slot]=tech.id;log(room.state,`${c.name}: начато исследование — ${tech.name}.`);
      } else if(action==="relation"){
        const target=room.state.countries[m.target];
        if(target&&target.id!==c.id&&c.money>=5){c.money-=5;c.relations[target.id]=(c.relations[target.id]||0)+10;log(room.state,`${c.name}: улучшены отношения с ${target.name}.`)}
      } else if(action==="alliance"){
        const target=room.state.countries[m.target];
        if(target&&target.id!==c.id&&c.money>=10){
          c.money-=10;
          let f=room.state.factions.find(f=>f.members.includes(c.id));
          if(!f){f={id:crypto.randomUUID(),name:`${c.tag} Alliance`,members:[]};room.state.factions.push(f)}
          if(!f.members.includes(c.id)) f.members.push(c.id);
          if(!f.members.includes(target.id)) f.members.push(target.id);
          c.faction=f.id;target.faction=f.id;
          log(room.state,`${c.name} и ${target.name} создали альянс.`);
        }
      } else if(action==="move"){
        const u=c.units.find(u=>u.id===m.unit);
        const target=room.state.provinces[m.target];
        if(u&&target&&target.neighbors.includes(u.province)&&target.controller===c.id){u.province=target.id;u.order=null;}
      } else if(action==="attack"){
        const u=c.units.find(u=>u.id===m.unit);const target=room.state.provinces[m.target];
        if(u&&target&&target.controller!==c.id&&target.neighbors.includes(u.province))u.order={type:"attack",target:target.id};
      } else if(action==="chat"){
        const text=sanitizeNick(String(m.text||"")).slice(0,180);
        if(text){
          for(const [sock,s] of sockets) if(s.roomId===room.id && sock.readyState===1)sock.send(JSON.stringify({type:"chat",from:p.nick,text}))
        }
      }
      broadcastRoom(room); saveRoom(room).catch(()=>{});
      return;
    }
    if(m.type==="choose_country"){
      const room=rooms.get(ses.roomId);if(!room)return;
      const p=room.state.players.find(x=>x.id===ses.userId);
      if(!p)return;
      if(room.state.players.some(x=>x.country===m.country&&x.id!==p.id)){ws.send(JSON.stringify({type:"error",message:"Эта страна уже занята."}));return}
      if(!room.state.countries[m.country]){ws.send(JSON.stringify({type:"error",message:"Страна не найдена."}));return}
      p.country=m.country;ses.country=m.country;log(room.state,`${p.nick} выбрал ${room.state.countries[m.country].name}.`);broadcastRoom(room);return;
    }
  });
  ws.on("close",()=>sockets.delete(ws));
});

function aiStep(room){
  const s=room.state;
  for(const c of Object.values(s.countries).filter(c=>c.ai)){
    if(c.ic>50 && c.production.length<3 && Math.random()<.35)c.production.push({id:crypto.randomUUID(),type:Math.random()<.25?"armor":"infantry",remaining:24,total:24});
    if(c.researchSlots.some(x=>!x)){
      const t=techs.find(t=>!c.researched.includes(t.id)&&!c.researchSlots.includes(t.id));
      const i=c.researchSlots.findIndex(x=>!x); if(t&&i>=0)c.researchSlots[i]=t.id;
    }
    if(c.warSupport>55&&Math.random()<.03){
      const targets=Object.values(s.countries).filter(t=>t.id!==c.id&&!s.wars.some(w=>(w.a===c.id&&w.b===t.id)||(w.a===t.id&&w.b===c.id)));
      const t=targets[Math.floor(Math.random()*targets.length)];
      if(t){s.wars.push({a:c.id,b:t.id,started:[s.year,s.month,s.day]});log(s,`${c.name} (ИИ) начал войну с ${t.name}.`);}
    }
  }
}
function tickRoom(room){
  if(room.status!=="running"||room.state.paused)return;
  const s=room.state;
  s.day++;
  if(s.day>30){s.day=1;s.month++}
  if(s.month>12){s.month=1;s.year++}
  s.tick++;
  for(const c of Object.values(s.countries)){
    c.money+=Math.floor(c.ic*.08);
    c.metal+=2;c.oil+=1;c.energy+=2;c.rare+=1;c.politicalPoints+=.5;
    c.manpower+=1;
    c.production.forEach(p=>p.remaining-=1);
    for(let i=c.production.length-1;i>=0;i--){
      if(c.production[i].remaining<=0){
        c.units.push({id:crypto.randomUUID(),name:`${c.name} ${c.units.length+1}-я дивизия`,type:c.production[i].type,province:c.capital,strength:10,max:10,org:70,exp:0,order:null,commander:"Генерал"});
        c.production.splice(i,1);
        log(s,`${c.name}: завершено производство — ${c.units.at(-1).name}.`);
      }
    }
    for(let i=0;i<c.researchSlots.length;i++){
      const tid=c.researchSlots[i];if(!tid)continue;
      if(Math.random()<.08){
        c.researched.push(tid);c.researchSlots[i]=null;
        const t=techs.find(x=>x.id===tid);log(s,`${c.name}: завершено исследование — ${t?.name||tid}.`);
      }
    }
  }
  aiStep(room);
  if(s.tick%8===0){
    const events=[
      ["Мобилизационная дискуссия","Военные требуют расширения резервов.",["Военная поддержка +5","Стабильность -2"]],
      ["Торговый бум","На рынке вырос спрос на сырьё.",["Деньги +15","Редкие материалы +3"]],
      ["Стратегический совет","Генералы требуют пересмотреть планы.",["Политические очки +8","Военная поддержка +3"]],
      ["Промышленный рывок","Новые производственные мощности готовы.",["Промышленность +2","Металл -4"]]
    ];
    if(Math.random()<.22){
      const [title,text,effects]=events[Math.floor(Math.random()*events.length)];
      s.events.push({id:crypto.randomUUID(),title,text,effects,target:"global",choices:["Принять","Отложить"]});
      log(s,`Событие: ${title}`);
    }
  }
  broadcastRoom(room);
  if(Date.now()-(room.lastSave||0)>15000){room.lastSave=Date.now();saveRoom(room).catch(()=>{});}
}
setInterval(()=>{for(const room of rooms.values())tickRoom(room)},2000);

(async()=>{
  await dbInit();
  await loadRooms();
  server.listen(PORT,"0.0.0.0",()=>console.log(`Iron Era v0.7 listening on ${PORT}`));
})();
