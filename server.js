import express from 'express';
import http from 'http';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { WebSocketServer } from 'ws';
import pg from 'pg';

const { Pool } = pg;
const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = Number(process.env.PORT || 10000);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(new URL('./public', import.meta.url).pathname));

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

const sessions = new Map();
const sockets = new Map();
const rooms = new Map();

const COUNTRY_SEEDS = [
  ['aurora','AUR','Аурория','#4d7fd8','a1',false,54,240],
  ['borealis','BOR','Бореалия','#ae5660','b1',true,62,280],
  ['centria','CEN','Центрия','#b2964d','c1',true,46,190],
  ['doria','DOR','Дория','#4f966b','d1',true,44,200],
  ['elyria','ELY','Элирия','#8561b9','e1',true,58,260],
  ['iberia','IBE','Иберия','#a7684b','f1',true,34,175],
  ['gallia','GAL','Галлия','#6e96b8','g1',true,50,210],
  ['scandinavia','SCA','Скандинавия','#6f9990','h1',true,38,150],
  ['anatolia','ANA','Анатолия','#8d8d58','i1',true,42,230],
  ['persia','PER','Персия','#6d8d88','j1',true,36,220],
  ['india','IND','Индостан','#9d7760','k1',true,52,340],
  ['japania','JAP','Япония','#9c5f80','l1',true,54,260]
];

const PROVINCE_DEFS = [
  ['a1','Аурория — столица','aurora','city',120,135,['a2','a3']],
  ['a2','Аурория — север','aurora','plains',90,85,['a1','b1']],
  ['a3','Аурория — юг','aurora','forest',105,215,['a1','c1']],
  ['b1','Бореалия — столица','borealis','city',255,110,['b2','a2','c1','h1']],
  ['b2','Бореалия — восток','borealis','plains',345,95,['b1','d1']],
  ['b3','Бореалия — юг','borealis','hills',300,190,['b1','c2','d1']],
  ['c1','Центрия — столица','centria','city',220,235,['a3','b1','c2','f2']],
  ['c2','Центрия — восток','centria','plains',305,270,['b3','c1','d2','g2']],
  ['d1','Дория — столица','doria','city',425,165,['b2','b3','d2','e2']],
  ['d2','Дория — юг','doria','forest',405,255,['c2','d1','i1']],
  ['e1','Элирия — столица','elyria','city',510,225,['d1','d2','e2','i1']],
  ['e2','Элирия — север','elyria','plains',520,145,['d1','e1','l1']],
  ['f1','Иберия — столица','iberia','city',85,390,['f2','g1']],
  ['f2','Иберия — север','iberia','hills',140,325,['f1','c1','g1']],
  ['g1','Галлия — столица','gallia','city',235,395,['f1','f2','g2','h1']],
  ['g2','Галлия — север','gallia','plains',250,340,['g1','c2','h1']],
  ['h1','Скандинавия — столица','scandinavia','forest',165,285,['b1','g1','h2']],
  ['h2','Скандинавия — север','scandinavia','mountains',170,185,['h1']],
  ['i1','Анатолия — столица','anatolia','city',545,365,['d2','e1','i2','j1']],
  ['i2','Анатолия — восток','anatolia','mountains',620,335,['i1','j1']],
  ['j1','Персия — столица','persia','city',650,440,['i1','i2','k1']],
  ['k1','Индостан — столица','india','city',760,465,['j1','k2','l1']],
  ['k2','Индостан — восток','india','plains',820,430,['k1','l2']],
  ['l1','Япония — столица','japania','city',850,285,['l2']],
  ['l2','Япония — север','japania','mountains',820,225,['l1','k2']]
];

const TECHS = [
  ['infantry_weapons','Пехотное оружие','Сухопутные',100,'+2 мягкой атаки'],
  ['artillery','Дивизионная артиллерия','Сухопутные',125,'+3 мягкой атаки'],
  ['motorization','Моторизация','Сухопутные',150,'+1 скорость мотопехоты'],
  ['medium_tanks','Средние танки','Броня',180,'+5 твёрдой атаки танков'],
  ['logistics','Логистика','Промышленность',140,'+12 TC'],
  ['industry','Промышленная эффективность','Промышленность',120,'+8% IC'],
  ['radar','Радар','Авиация',150,'+8 ПВО'],
  ['fighters','Истребители','Авиация',170,'+8 воздушной атаки'],
  ['naval_doctrine','Морская доктрина','Флот',165,'+8 морской силы'],
  ['submarines','Подводные лодки','Флот',155,'+10 атаки конвоев'],
  ['grand_plan','Оперативное планирование','Доктрины',210,'+6 максимуму организации']
].map(([id,name,group,cost,effect]) => ({ id,name,group,cost,effect }));

const EVENT_POOL = [
  {id:'mobilization',title:'Мобилизационная дискуссия',text:'Военные требуют расширить резерв.',choices:[['Ускорить мобилизацию',{warSupport:5,stability:-2}],['Сохранить спокойствие',{stability:2,politicalPoints:4}]]},
  {id:'trade_boom',title:'Торговый бум',text:'На внешних рынках вырос спрос.',choices:[['Расширить торговлю',{money:12,rare:3}],['Сосредоточиться внутри страны',{metal:4,stability:1}]]},
  {id:'industry',title:'Промышленный рывок',text:'Инженеры предлагают новый производственный стандарт.',choices:[['Внедрить',{ic:2,metal:-4}],['Отложить',{politicalPoints:8}]]},
  {id:'army_reform',title:'Армейская реформа',text:'Штаб требует реорганизации войск.',choices:[['Принять реформу',{warSupport:3,politicalPoints:-4}],['Отложить',{stability:1}]]}
];

function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
function poly(x,y){return [[x-30,y-28],[x+29,y-25],[x+35,y+26],[x-7,y+34],[x-35,y+5]];}
function log(world,msg){world.log.unshift(msg);world.log=world.log.slice(0,40);}
function addEvent(world,countryId,eventId){
  const c=world.countries[countryId];
  if(!c || c.eventsSeen.includes(eventId)) return false;
  const ev=EVENT_POOL.find(x=>x.id===eventId); if(!ev)return false;
  c.activeEvent={id:ev.id,title:ev.title,text:ev.text,choices:ev.choices.map(x=>({text:x[0]}))};
  c.eventsSeen.push(eventId);
  log(world,`${c.name}: национальное событие — ${ev.title}.`);
  return true;
}
function makeWorld(){
  const countries={};
  for(const [id,tag,name,color,capital,ai,ic,manpower] of COUNTRY_SEEDS){
    countries[id]={
      id,tag,name,color,capital,ai,ideology:ai?'Авторитаризм':'Республика',ic,baseIc:ic,manpower,
      metal:60,oil:34,rare:28,energy:70,money:50,supplies:100,stability:70,warSupport:ai?45:28,tc:ic+35,politicalPoints:30,
      researched:[],researchSlots:[null,null,null],production:[],units:[],faction:null,relations:{},spyNetworks:{},casualties:0,
      air:{fighters:8,bombers:3},navy:{destroyers:5,cruisers:1,submarines:3,convoys:15},eventsSeen:[],activeEvent:null
    };
  }
  const provinces={};
  for(const [id,name,owner,terrain,x,y,neighbors] of PROVINCE_DEFS){
    provinces[id]={id,name,owner,controller:owner,terrain,x,y,poly:poly(x,y),neighbors,
      industry:terrain==='city'?7:5,infrastructure:terrain==='city'?8:5,victory:terrain==='city'?10:2,
      oil:Math.random()<0.18?4:0,metal:2+Math.floor(Math.random()*3),rare:1+Math.floor(Math.random()*2),port:0,resistance:0};
  }
  const world={year:1936,month:1,day:1,tick:0,paused:true,speed:1,weather:'clear',countries,provinces,wars:[],factions:[],players:[],events:[],log:['1936. Новая мировая кампания создана.']};
  for(const c of Object.values(countries)){
    const home=Object.values(provinces).find(p=>p.owner===c.id);
    c.units=[
      {id:crypto.randomUUID(),name:'1-я дивизия',type:'infantry',province:home.id,strength:10,max:10,org:80,exp:5,order:null,commander:'Генерал I'},
      {id:crypto.randomUUID(),name:'2-я дивизия',type:c.id==='aurora'?'armor':'infantry',province:home.id,strength:10,max:10,org:72,exp:5,order:null,commander:'Генерал II'}
    ];
    c.production.push({id:crypto.randomUUID(),type:'infantry',remaining:24,total:24});
  }
  return world;
}

function createRoom(name,hostUsername,maxPlayers=20){
  let id=crypto.randomBytes(4).toString('hex').toUpperCase();
  while(rooms.has(id)) id=crypto.randomBytes(4).toString('hex').toUpperCase();
  const room={id,name:String(name||'Новая кампания').slice(0,60),host:hostUsername,maxPlayers:Math.max(2,Math.min(40,Number(maxPlayers)||20)),status:'waiting',world:makeWorld(),clients:new Map(),lastSave:Date.now()};
  rooms.set(id,room);return room;
}
function roomState(room){
  const w=room.world;
  const players=w.players.map(p=>({id:p.id,nick:p.nick,country:p.country,ready:p.ready,host:p.host}));
  return {id:room.id,name:room.name,host:room.host,status:room.status,maxPlayers:room.maxPlayers,needsCountry:true,players,
    year:w.year,month:w.month,day:w.day,paused:w.paused,speed:w.speed,weather:w.weather,
    countries:w.countries,provinces:w.provinces,wars:w.wars,factions:w.factions,events:w.events.slice(-20),log:w.log,techs:TECHS};
}
function broadcast(room){
  const packet=JSON.stringify({type:'room_state',room:roomState(room)});
  for(const ws of room.clients.keys()) if(ws.readyState===1) ws.send(packet);
}
function userFromReq(req){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  return sessions.get(token)||null;
}
function publicUser(u){return u?{id:u.userId,username:u.username}:null;}
function authKey(username){return String(username||'').trim().toLowerCase();}
async function initDb(){
  if(!dbOnline)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS ie_users(id uuid PRIMARY KEY, username varchar(40) UNIQUE NOT NULL, password_hash text NOT NULL, created_at timestamptz DEFAULT now());`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ie_rooms(id varchar(24) PRIMARY KEY, name varchar(80) NOT NULL, payload jsonb NOT NULL, updated_at timestamptz DEFAULT now());`);
}
async function saveRoom(room){
  if(!dbOnline)return;
  await pool.query(`INSERT INTO ie_rooms(id,name,payload,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,payload=EXCLUDED.payload,updated_at=now()`,[room.id,room.name,JSON.stringify({host:room.host,maxPlayers:room.maxPlayers,status:room.status,world:room.world})]);
}
async function loadRooms(){
  if(!dbOnline)return;
  const r=await pool.query(`SELECT * FROM ie_rooms ORDER BY updated_at DESC LIMIT 30`);
  for(const row of r.rows){const p=row.payload;rooms.set(row.id,{id:row.id,name:row.name,host:p.host,maxPlayers:p.maxPlayers,status:p.status||'waiting',world:p.world||makeWorld(),clients:new Map(),lastSave:Date.now()});}
}
async function auth(username,password){
  username=String(username||'').trim();
  if(!/^[a-zA-Z0-9_]{3,20}$/.test(username))throw new Error('Логин: 3–20 символов, латиница, цифры и _.');
  if(String(password||'').length<4)throw new Error('Пароль минимум 4 символа.');
  if(!pool){
    const key=authKey(username); const old=[...sessions.values()].find(s=>s.username.toLowerCase()===key);
    if(old)return old;
    const s={userId:crypto.randomUUID(),username,token:crypto.randomBytes(24).toString('hex')};sessions.set(s.token,s);return s;
  }
  const q=await pool.query('SELECT * FROM ie_users WHERE username=$1',[username]);
  if(q.rows.length===0){const id=crypto.randomUUID();const hash=await bcrypt.hash(password,10);await pool.query('INSERT INTO ie_users(id,username,password_hash) VALUES($1,$2,$3)',[id,username,hash]);const s={userId:id,username,token:crypto.randomBytes(24).toString('hex')};sessions.set(s.token,s);return s;}
  if(!(await bcrypt.compare(password,q.rows[0].password_hash)))throw new Error('Неверный логин или пароль.');
  const s={userId:q.rows[0].id,username:q.rows[0].username,token:crypto.randomBytes(24).toString('hex')};sessions.set(s.token,s);return s;
}

app.get('/',(_,res)=>res.sendFile(new URL('./public/index.html',import.meta.url).pathname));
app.get('/lobby',(_,res)=>res.sendFile(new URL('./public/pages/lobby.html',import.meta.url).pathname));
app.get('/game',(_,res)=>res.sendFile(new URL('./public/pages/game.html',import.meta.url).pathname));
app.get('/profile',(_,res)=>res.sendFile(new URL('./public/pages/profile.html',import.meta.url).pathname));
app.get('/api/me',(req,res)=>res.json({user:publicUser(userFromReq(req))}));
app.post('/api/auth/register',async(req,res)=>{try{const s=await auth(req.body.username,req.body.password);res.json({ok:true,token:s.token,user:publicUser(s)});}catch(e){res.status(400).json({ok:false,error:e.message});}});
app.post('/api/auth/login',async(req,res)=>{try{const s=await auth(req.body.username,req.body.password);res.json({ok:true,token:s.token,user:publicUser(s)});}catch(e){res.status(400).json({ok:false,error:e.message});}});
app.post('/api/auth/logout',(req,res)=>{const u=userFromReq(req);if(u)sessions.delete(u.token);res.json({ok:true});});
app.get('/api/rooms',(_,res)=>res.json([...rooms.values()].map(r=>({id:r.id,name:r.name,status:r.status,host:r.host,maxPlayers:r.maxPlayers,players:r.world.players.length,date:`${r.world.year}.${String(r.world.month).padStart(2,'0')}.${String(r.world.day).padStart(2,'0')}`}))));
app.post('/api/rooms',async(req,res)=>{const u=userFromReq(req);if(!u)return res.status(401).json({ok:false,error:'Нужна авторизация.'});const room=createRoom(req.body.name||`${u.username} — кампания`,u.username,req.body.maxPlayers);await saveRoom(room);res.json({ok:true,roomId:room.id});});
app.get('/api/profile',(req,res)=>{const u=userFromReq(req);if(!u)return res.status(401).json({ok:false,error:'Нужна авторизация.'});const history=[...rooms.values()].filter(r=>r.world.players.some(p=>p.nick===u.username)).map(r=>({id:r.id,name:r.name,status:r.status,date:`${r.world.year}.${r.world.month}.${r.world.day}`}));res.json({ok:true,user:publicUser(u),history});});
app.get('/health',(_,res)=>res.json({ok:true,rooms:rooms.size,online:[...sockets.values()].filter(x=>x.roomId).length}));

wss.on('connection',ws=>{
  const ses={userId:null,username:null,roomId:null,country:null};sockets.set(ws,ses);ws.isAlive=true;ws.on('pong',()=>ws.isAlive=true);
  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw.toString())}catch{ws.send(JSON.stringify({type:'error',message:'Некорректный запрос.'}));return;}
    if(m.type==='auth'){
      const u=sessions.get(String(m.token||''));if(!u){ws.send(JSON.stringify({type:'error',message:'Сессия истекла. Войди снова.'}));return;}
      ses.userId=u.userId;ses.username=u.username;ws.send(JSON.stringify({type:'auth_ok',user:publicUser(u)}));return;
    }
    if(m.type==='join_room'){
      if(!ses.userId){ws.send(JSON.stringify({type:'error',message:'Сначала авторизуйся.'}));return;}
      const room=rooms.get(String(m.roomId||'').toUpperCase());if(!room){ws.send(JSON.stringify({type:'error',message:'Комната не найдена.'}));return;}
      room.clients.set(ws,{id:ses.userId,nick:ses.username});ses.roomId=room.id;
      const existing=room.world.players.find(p=>p.id===ses.userId);
      if(existing){ses.country=existing.country;ws.send(JSON.stringify({type:'joined',id:existing.id,country:existing.country,state:roomState(room)}));broadcast(room);return;}
      // Do not put player into the world until a country is explicitly chosen.
      ws.send(JSON.stringify({type:'room_state',room:roomState(room)}));
      ws.send(JSON.stringify({type:'choose_country_required'}));
      return;
    }
    if(m.type==='choose_country'){
      const room=rooms.get(ses.roomId);if(!room||!ses.userId)return;
      if(room.world.players.length>=room.maxPlayers){ws.send(JSON.stringify({type:'error',message:'Комната заполнена.'}));return;}
      const cid=String(m.country||'');if(!room.world.countries[cid]){ws.send(JSON.stringify({type:'error',message:'Выбери страну.'}));return;}
      if(room.world.players.some(p=>p.country===cid)){ws.send(JSON.stringify({type:'error',message:'Эта страна уже занята.'}));return;}
      const p={id:ses.userId,nick:ses.username,country:cid,ready:false,host:room.world.players.length===0};room.world.players.push(p);ses.country=cid;
      room.world.countries[cid].ai=false;if(!room.host)room.host=ses.username;
      log(room.world,`${p.nick} выбрал ${room.world.countries[cid].name}.`);
      ws.send(JSON.stringify({type:'joined',id:p.id,country:p.country,state:roomState(room)}));broadcast(room);saveRoom(room).catch(()=>{});return;
    }
    if(m.type==='rejoin_room'){
      const room=rooms.get(String(m.roomId||'').toUpperCase());if(!room||!ses.userId)return;
      const p=room.world.players.find(p=>p.id===ses.userId);if(!p){ws.send(JSON.stringify({type:'error',message:'Игрок не найден в комнате.'}));return;}
      room.clients.set(ws,{id:ses.userId,nick:ses.username});ses.roomId=room.id;ses.country=p.country;ws.send(JSON.stringify({type:'joined',id:p.id,country:p.country,state:roomState(room)}));broadcast(room);return;
    }
    const room=rooms.get(ses.roomId);if(!room)return;
    const player=room.world.players.find(p=>p.id===ses.userId);
    if(m.type==='ready'){
      if(!player){ws.send(JSON.stringify({type:'error',message:'Сначала выбери страну.'}));return;}
      player.ready=!!m.value;const allReady=room.world.players.length>0&&room.world.players.every(p=>p.ready);
      if(room.status==='waiting'&&allReady){room.status='running';room.world.paused=false;log(room.world,'Все игроки готовы. Кампания началась.');}
      broadcast(room);saveRoom(room);return;
    }
    if(m.type==='start'){
      if(!player||player.nick!==room.host){ws.send(JSON.stringify({type:'error',message:'Только хост может запустить кампанию.'}));return;}
      if(room.world.players.length===0||!room.world.players.every(p=>p.ready)){ws.send(JSON.stringify({type:'error',message:'Все игроки должны нажать «Готов».'}));return;}
      room.status='running';room.world.paused=false;log(room.world,`${player.nick} запустил кампанию.`);broadcast(room);saveRoom(room);return;
    }
    if(m.type==='chat'){
      if(!player)return;const text=String(m.text||'').replace(/[<>]/g,'').trim().slice(0,180);if(!text)return;
      for(const sock of room.clients.keys())if(sock.readyState===1)sock.send(JSON.stringify({type:'chat',from:player.nick,text}));return;
    }
    if(m.type==='action'){
      if(!player){ws.send(JSON.stringify({type:'error',message:'Сначала выбери страну.'}));return;}
      handleAction(room,player,m,ws);broadcast(room);saveRoom(room);return;
    }
  });
  ws.on('close',()=>{const ses=sockets.get(ws);sockets.delete(ws);if(ses?.roomId){const room=rooms.get(ses.roomId);room?.clients.delete(ws);}});
});

function handleAction(room,p,m,ws){
  const w=room.world,c=w.countries[p.country];if(!c)return;
  if(m.action==='build_factory'){if(c.metal<6){ws.send(JSON.stringify({type:'error',message:'Не хватает металла.'}));return;}c.metal-=6;c.ic+=2;c.baseIc+=2;log(w,`${c.name}: промышленность расширена.`);return;}
  if(m.action==='add_division'){const type=['infantry','motorized','armor'].includes(m.template)?m.template:'infantry';c.production.push({id:crypto.randomUUID(),type,remaining:24,total:24});return;}
  if(m.action==='research'){const t=TECHS.find(x=>x.id===m.tech);const slot=Number(m.slot);if(!t||slot<0||slot>=c.researchSlots.length||c.researchSlots[slot]||c.researched.includes(t.id)){ws.send(JSON.stringify({type:'error',message:'Нельзя начать это исследование.'}));return;}c.researchSlots[slot]=t.id;log(w,`${c.name}: начато исследование — ${t.name}.`);return;}
  if(m.action==='relation'){const t=w.countries[m.target];if(t&&t.id!==c.id&&c.money>=5){c.money-=5;c.relations[t.id]=(c.relations[t.id]||0)+10;log(w,`${c.name}: улучшены отношения с ${t.name}.`);}return;}
  if(m.action==='alliance'){const t=w.countries[m.target];if(!t||t.id===c.id||c.money<10)return;c.money-=10;let f=w.factions.find(x=>x.id===c.faction);if(!f){f={id:crypto.randomUUID(),name:`${c.tag} Alliance`,members:[]};w.factions.push(f);}if(!f.members.includes(c.id))f.members.push(c.id);if(!f.members.includes(t.id))f.members.push(t.id);c.faction=f.id;t.faction=f.id;log(w,`${c.name} и ${t.name} создали альянс.`);return;}
  if(m.action==='declare_war'){const t=w.countries[m.target];if(!t||t.id===c.id)return;if(w.wars.some(x=>(x.a===c.id&&x.b===t.id)||(x.a===t.id&&x.b===c.id)))return;w.wars.push({a:c.id,b:t.id,started:[w.year,w.month,w.day]});log(w,`${c.name} объявляет войну ${t.name}.`);return;}
  if(m.action==='move'){const u=c.units.find(x=>x.id===m.unit),t=w.provinces[m.target];if(u&&t&&t.neighbors.includes(u.province)&&t.controller===c.id){u.province=t.id;u.order=null;}return;}
  if(m.action==='attack'){const u=c.units.find(x=>x.id===m.unit),t=w.provinces[m.target];if(u&&t&&t.controller!==c.id&&t.neighbors.includes(u.province))u.order={type:'attack',target:t.id};return;}
  if(m.action==='event_choice'){applyEventChoice(w,c,m.choice);return;}
}
function applyEventChoice(world,c,choiceIndex){
  if(!c.activeEvent)return;const ev=EVENT_POOL.find(x=>x.id===c.activeEvent.id);const choice=ev?.choices?.[Number(choiceIndex)];if(!choice)return;
  for(const [k,v] of Object.entries(choice[1]))c[k]=(c[k]||0)+v;c.activeEvent=null;log(world,`${c.name}: решение события принято — ${choice[0]}.`);
}
function aiStep(room){
  const w=room.world;
  for(const c of Object.values(w.countries).filter(c=>c.ai)){
    if(!c.activeEvent&&!c.eventsSeen.includes('mobilization')&&Math.random()<0.02)addEvent(w,c.id,'mobilization');
    if(c.production.length<3&&c.manpower>20&&Math.random()<0.25)c.production.push({id:crypto.randomUUID(),type:Math.random()<0.2?'armor':'infantry',remaining:24,total:24});
    if(Math.random()<0.05){const slot=c.researchSlots.findIndex(x=>!x);const t=TECHS.find(t=>!c.researched.includes(t.id)&&!c.researchSlots.includes(t.id));if(slot>=0&&t)c.researchSlots[slot]=t.id;}
    if(c.warSupport>60&&Math.random()<0.015){const targets=Object.values(w.countries).filter(t=>t.id!==c.id&&!w.wars.some(x=>(x.a===c.id&&x.b===t.id)||(x.a===t.id&&x.b===c.id)));const t=targets[Math.floor(Math.random()*targets.length)];if(t){w.wars.push({a:c.id,b:t.id,started:[w.year,w.month,w.day]});log(w,`${c.name} (ИИ) начал войну с ${t.name}.`);}}
    if(c.activeEvent&&Math.random()<0.04)applyEventChoice(w,c,0);
  }
}
function tickRoom(room){
  const w=room.world;if(room.status!=='running'||w.paused)return;
  w.day++;if(w.day>30){w.day=1;w.month++;}if(w.month>12){w.month=1;w.year++;}w.tick++;
  for(const c of Object.values(w.countries)){
    c.money+=Math.floor(c.ic*.08);c.metal+=2;c.oil+=1;c.rare+=1;c.energy+=2;c.politicalPoints+=.5;c.manpower+=1;
    c.production.forEach(x=>x.remaining--);
    for(let i=c.production.length-1;i>=0;i--)if(c.production[i].remaining<=0){const prod=c.production[i];c.units.push({id:crypto.randomUUID(),name:`${c.name} ${c.units.length+1}-я дивизия`,type:prod.type,province:c.capital,strength:10,max:10,org:70,exp:0,order:null,commander:'Генерал'});c.production.splice(i,1);log(w,`${c.name}: завершено производство — ${prod.type}.`);}
    for(let i=0;i<c.researchSlots.length;i++){const tid=c.researchSlots[i];if(tid&&Math.random()<0.08){c.researched.push(tid);c.researchSlots[i]=null;log(w,`${c.name}: завершено исследование — ${TECHS.find(t=>t.id===tid)?.name||tid}.`);}}
    for(const u of c.units){u.org=Math.min(100,u.org+(c.supplies>0?1:.2));if(u.order?.type==='attack'){const target=w.provinces[u.order.target];if(target&&target.controller!==c.id){u.org-=.5;if(Math.random()<.08&&u.org>20){target.controller=c.id;u.province=target.id;u.order=null;log(w,`${c.name} захватывает ${target.name}.`);}}}}
  }
  aiStep(room);
  if(w.tick%10===0){for(const c of Object.values(w.countries)){if(!c.activeEvent&&Math.random()<0.2){const unseen=EVENT_POOL.filter(e=>!c.eventsSeen.includes(e.id));if(unseen.length)addEvent(w,c.id,unseen[Math.floor(Math.random()*unseen.length)].id);}}}
  broadcast(room);if(Date.now()-room.lastSave>10000){room.lastSave=Date.now();saveRoom(room).catch(()=>{});}
}
setInterval(()=>{for(const room of rooms.values())tickRoom(room)},2000);
setInterval(()=>{for(const ws of wss.clients){if(ws.isAlive===false){try{ws.terminate();}catch{}continue;}ws.isAlive=false;try{ws.ping();}catch{}}},25000);

try{
  await initDb();
  await loadRooms();
}catch(err){
  console.error("[IronEra] Startup database step failed:", err);
}
server.listen(PORT,'0.0.0.0',()=>console.log(`Iron Era Online v1.0 listening on ${PORT}`));
