import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import crypto from "crypto";

const __dirname = new URL(".", import.meta.url).pathname;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
app.use(express.static(`${__dirname}/public`));

const PORT = Number(process.env.PORT || 10000);
const TICK_MS = 2000;

/* ================= GAME DATA ================= */

const terrainMod = {
  plains: {attack:1.00, defense:1.00, speed:1.00},
  forest: {attack:0.82, defense:1.10, speed:0.82},
  hills: {attack:0.84, defense:1.16, speed:0.75},
  mountains: {attack:0.62, defense:1.28, speed:0.55},
  swamp: {attack:0.65, defense:1.12, speed:0.58},
  city: {attack:0.74, defense:1.30, speed:0.62},
  coast: {attack:0.90, defense:1.05, speed:0.90}
};

const weatherMod = {
  clear: {attack:1.00, defense:1.00, supply:1.00},
  rain: {attack:0.90, defense:0.94, supply:0.90},
  snow: {attack:0.78, defense:0.92, supply:0.78},
  storm: {attack:0.68, defense:0.85, supply:0.65}
};

const templates = {
  infantry: {label:"Пехота", manpower:10, ic:18, days:24, soft:12, hard:2, armor:0, speed:3, supply:1.0},
  motorized: {label:"Моторизованные", manpower:10, ic:26, days:28, soft:15, hard:4, armor:1, speed:6, supply:1.3},
  armor: {label:"Бронетанковые", manpower:12, ic:42, days:34, soft:20, hard:18, armor:7, speed:7, supply:1.8},
  mountain: {label:"Горные", manpower:9, ic:25, days:26, soft:14, hard:3, armor:0, speed:4, supply:1.1},
  garrison: {label:"Гарнизон", manpower:8, ic:15, days:18, soft:10, hard:1, armor:0, speed:2, supply:.7}
};

const techDefs = [
  {id:"inf_weapons", name:"Пехотное оружие I", group:"army", cost:100, effects:{inf_soft:2}},
  {id:"artillery", name:"Артиллерия", group:"army", cost:130, effects:{inf_soft:3}},
  {id:"motor", name:"Моторизация", group:"army", cost:160, effects:{motor_speed:1}},
  {id:"armor1", name:"Средние танки", group:"army", cost:190, effects:{armor_soft:3, armor_hard:5}},
  {id:"logistics", name:"Логистика", group:"industry", cost:150, effects:{supply_capacity:12}},
  {id:"industry1", name:"Промышленная эффективность", group:"industry", cost:120, effects:{ic_eff:.08}},
  {id:"synthetic", name:"Синтетическое топливо", group:"industry", cost:170, effects:{oil_prod:2}},
  {id:"radar", name:"Радар", group:"air", cost:150, effects:{air_def:8}},
  {id:"fighters", name:"Истребители I", group:"air", cost:180, effects:{air_attack:8}},
  {id:"naval", name:"Морская доктрина", group:"navy", cost:170, effects:{naval_power:8}},
  {id:"submarines", name:"Подводные лодки", group:"navy", cost:160, effects:{convoy_attack:10}},
  {id:"grand_plan", name:"Оперативное планирование", group:"doctrine", cost:220, effects:{org:6}}
];

const decisionDefs = [
  {id:"mobilize", name:"Всеобщая мобилизация", cost:20, desc:"+15 мобилизации, +30 людских резервов", apply:c=>{c.conscription=Math.min(100,c.conscription+15);c.manpower+=30;}},
  {id:"five_year_plan", name:"Пятилетний план", cost:30, desc:"+4 к базовой промышленности", apply:c=>{c.baseIc+=4;}},
  {id:"national_unity", name:"Кампания единства нации", cost:15, desc:"+10 единства", apply:c=>{c.unity=Math.min(100,c.unity+10);}},
  {id:"war_propaganda", name:"Военная пропаганда", cost:15, desc:"+12 военной поддержки", apply:c=>{c.warSupport=Math.min(100,c.warSupport+12);}},
  {id:"infrastructure", name:"Развитие инфраструктуры", cost:25, desc:"+15 TC/логистики", apply:c=>{c.tc+=15;}},
  {id:"secret_police", name:"Тайная полиция", cost:20, desc:"+12 стабильности", apply:c=>{c.stability=Math.min(100,c.stability+12);}}
];

const eventDefs = [
  {id:"boom", text:c=>`${c.name}: экономический бум — промышленность и казна растут.`, apply:c=>{c.baseIc+=1;c.money+=15;}},
  {id:"unrest", text:c=>`${c.name}: гражданские волнения снижают стабильность.`, apply:c=>{c.stability=Math.max(0,c.stability-6);c.unity=Math.max(0,c.unity-3);}},
  {id:"strike", text:c=>`${c.name}: забастовки на заводах замедляют производство.`, apply:c=>{c.icEff=Math.max(.5,c.icEff-.03);}},
  {id:"oilfield", text:c=>`${c.name}: геологи обнаружили новое месторождение нефти.`, apply:c=>{c.oil+=10;}},
  {id:"oreveins", text:c=>`${c.name}: найдены богатые залежи металла.`, apply:c=>{c.metal+=12;}},
  {id:"parade", text:c=>`${c.name}: военный парад поднимает боевой дух нации.`, apply:c=>{c.warSupport=Math.min(100,c.warSupport+5);}},
  {id:"scandal", text:c=>`${c.name}: политический скандал бьёт по единству нации.`, apply:c=>{c.unity=Math.max(0,c.unity-8);}},
  {id:"breakthrough", text:c=>`${c.name}: научный прорыв ускоряет исследования.`, apply:c=>{c.research+=8;}},
  {id:"harvest", text:c=>`${c.name}: удачный урожай улучшает снабжение армии.`, apply:c=>{c.supplies=Math.min(999,c.supplies+30);}},
  {id:"refugees", text:c=>`${c.name}: приток беженцев увеличивает людские резервы.`, apply:c=>{c.manpower+=15;}},
  {id:"corruption", text:c=>`${c.name}: коррупционный скандал сокращает казну.`, apply:c=>{c.money=Math.max(0,c.money-20);}},
  {id:"spydiscover", text:c=>`${c.name}: контрразведка раскрыла иностранную шпионскую сеть.`, apply:c=>{c.spies.domestic+=1;}}
];

const globalEventDefs = [
  {id:"depression", text:()=>"Мировой экономический кризис ударил по всем державам.", apply:w=>{for(const c of Object.values(w.countries)){c.money=Math.max(0,c.money-10);c.stability=Math.max(0,c.stability-3);}}},
  {id:"peaceconf", text:()=>"Международная конференция снижает напряжённость в мире.", apply:w=>{for(const c of Object.values(w.countries)) c.warSupport=Math.max(0,c.warSupport-4);}},
  {id:"armsrace", text:()=>"Гонка вооружений охватывает великие державы.", apply:w=>{for(const c of Object.values(w.countries)) c.warSupport=Math.min(100,c.warSupport+3);}}
];

const provinceDefs = [
  ["ber", "Берлин", "aurora", "city", 190, 110, [["120,70","205,45","285,70","275,130","205,155","130,140"]], ["muc"]],
  ["muc", "Мюнхен", "aurora", "plains", 210, 205, [["125,150","205,155","275,130","310,205","260,255","170,250","120,205"]], ["ber","prg","vie"]],
  ["ham", "Гамбург", "aurora", "plains", 90, 85, [["55,65","125,55","130,140","95,170","50,145"]], ["ber"]],
  ["cologne", "Кёльн", "aurora", "city", 95, 245, [["35,190","120,205","170,250","125,305","55,290"]], ["muc","bru"]],
  ["war", "Варшава", "borealis", "city", 430, 120, [["400,70","485,55","545,95","520,160","450,175","390,135"]], ["prg","min"]],
  ["prg", "Прага", "borealis", "hills", 345, 190, [["275,130","345,150","390,135","450,175","410,235","330,245","280,205"]], ["muc","war","vie"]],
  ["min", "Минск", "borealis", "plains", 520, 235, [["480,175","545,165","595,220","585,295","515,315","455,270"]], ["war","mos"]],
  ["mos", "Москва", "borealis", "city", 620, 120, [["555,70","635,45","700,80","695,155","635,185","585,140"]], ["min"]],
  ["par", "Париж", "centria", "city", 65, 420, [["30,350","115,340","155,400","125,465","55,480","20,420"]], ["bru","lyo"]],
  ["bru", "Брюссель", "centria", "plains", 125, 330, [["80,300","145,300","170,355","155,400","115,340","55,350"]], ["cologne","par","amst"]],
  ["lyo", "Лион", "centria", "hills", 175, 470, [["125,410","195,405","235,455","210,520","145,535","110,480"]], ["par","mar"]],
  ["mar", "Марсель", "centria", "coast", 205, 555, [["145,525","210,515","260,545","245,600","170,600"]], ["lyo"]],
  ["rom", "Рим", "doria", "city", 430, 470, [["385,410","455,410","500,450","480,520","415,525","380,485"]], ["vie","mil"]],
  ["mil", "Милан", "doria", "plains", 385, 350, [["335,300","410,300","455,345","435,400","385,410","320,365"]], ["vie","rom"]],
  ["vie", "Вена", "doria", "city", 315, 290, [["275,250","345,245","385,295","360,345","305,340","275,300"]], ["prg","muc","mil","rom"]],
  ["ath", "Афины", "doria", "hills", 520, 550, [["480,490","545,485","590,530","575,585","500,600","460,550"]], ["rom"]],
  ["lon", "Лондон", "elyria", "city", 20, 540, [["10,490","75,485","105,525","90,585","20,600","0,545"]], []],
  ["liverpool", "Ливерпуль", "elyria", "plains", 55, 435, [["10,385","80,385","105,430","75,485","20,490"]], ["lon"]],
  ["edn", "Эдинбург", "elyria", "hills", 90, 335, [["35,290","100,280","125,330","80,385","25,360"]], ["liverpool"]],
  ["lima", "Лима", "elyria", "plains", 735, 415, [["690,350","760,330","815,390","790,460","715,475","680,415"]], []]
];

const makeProvince = d => ({
  id:d[0], name:d[1], owner:d[2], controller:d[2], terrain:d[3], x:d[4], y:d[5],
  poly:d[6][0].map(s=>s.split(",").map(Number)), neighbors:d[7],
  infrastructure: d[3] === "city" ? 8 : 5,
  industry: d[3] === "city" ? 10 : 4,
  aa: d[3] === "city" ? 2 : 0,
  airfield: d[3] === "city" ? 2 : 0,
  port: d[3] === "coast" || d[0] === "lon" ? 4 : 0,
  oil: Math.random() < .25 ? 4 : 0,
  metal: Math.floor(Math.random()*4),
  rare: Math.floor(Math.random()*3),
  victory: d[3] === "city" ? 10 : 2,
  resistance: d[2] === "aurora" ? 0 : 4
});

const initialCountries = [
  {id:"aurora", tag:"AUR", name:"Аурория", color:"#5d79b9", capital:"ber", ideology:"авторитаризм", manpower:220, baseIc:48, energy:75, metal:52, rare:28, oil:24, supplies:100, money:60, unity:78, stability:74, warSupport:28, tc:90, techTeams:3, aggression:52, ai:false},
  {id:"borealis", tag:"BOR", name:"Бореалия", color:"#a6545b", capital:"war", ideology:"военный режим", manpower:260, baseIc:58, energy:72, metal:46, rare:22, oil:18, supplies:100, money:58, unity:76, stability:68, warSupport:50, tc:105, techTeams:3, aggression:72, ai:true},
  {id:"centria", tag:"CEN", name:"Центрия", color:"#b39452", capital:"par", ideology:"демократия", manpower:190, baseIc:42, energy:64, metal:30, rare:32, oil:12, supplies:100, money:72, unity:84, stability:82, warSupport:18, tc:80, techTeams:3, aggression:38, ai:true},
  {id:"doria", tag:"DOR", name:"Дория", color:"#4e8b68", capital:"rom", ideology:"национализм", manpower:170, baseIc:38, energy:54, metal:28, rare:18, oil:10, supplies:100, money:55, unity:80, stability:70, warSupport:40, tc:75, techTeams:3, aggression:76, ai:true},
  {id:"elyria", tag:"ELY", name:"Элирия", color:"#7357a5", capital:"lon", ideology:"демократия", manpower:250, baseIc:55, energy:86, metal:35, rare:35, oil:20, supplies:100, money:78, unity:88, stability:86, warSupport:22, tc:110, techTeams:3, aggression:45, ai:true}
];

function seedCountry(c){
  return {
    ...c,
    leadership:4, research:2, icEff:1,
    politicalLeft:50, economyLaw:50, conscription:35,
    ministers:["Экономист","Организатор","Штабист"],
    faction:null, relations:{}, tech:{},
    researchSlots:Array(c.techTeams).fill(null),
    researched:[],
    production:[{id:crypto.randomUUID(), type:"infantry", remaining:50, total:50, serial:1}],
    units:[],
    air:{fighters:8,bombers:4,transport:1},
    navy:{destroyers:6,cruisers:2,capital:1,submarines:4,convoys:18},
    spies:{domestic:3, foreign:2},
    spyNetworks:{},
    politicalPoints:25,
    lendLease:0,
    tradeDeals:[],
    casualties:0,
    victories:0,
    decisions:{}
  };
}

function unit(id,name,type,province,strength){
  return {
    id,name,type,province,strength,maxStrength:strength,org:80,maxOrg:80,exp:10,
    commander: commanderFor(type), planning:0, entrenched:0, order:null
  };
}
function commanderFor(type){
  const pool = {
    infantry:["Ген. Соколов","Ген. Ветров","Ген. Марен"],
    motorized:["Ген. Коллинз","Ген. Орлов"],
    armor:["Ген. Рейн","Ген. Ковалев"],
    mountain:["Ген. Фогель","Ген. Тарек"],
    garrison:["Ген. Харт"]
  }[type];
  return pool[Math.floor(Math.random()*pool.length)];
}

function startingUnits(countries){
  countries.aurora.units=[unit("AUR-1","1-я Берлинская","infantry","ber",8),unit("AUR-2","2-й Панцер","armor","muc",4)];
  countries.borealis.units=[unit("BOR-1","1-я Варшавская","infantry","war",9),unit("BOR-2","Северная группа","motorized","min",6),unit("BOR-3","Московский корпус","infantry","mos",7)];
  countries.centria.units=[unit("CEN-1","Парижская армия","infantry","par",8),unit("CEN-2","Альпийский корпус","mountain","lyo",5)];
  countries.doria.units=[unit("DOR-1","Северная армия","infantry","mil",7),unit("DOR-2","Бронетанковая группа","armor","rom",4)];
  countries.elyria.units=[unit("ELY-1","Экспедиционный корпус","motorized","lon",7),unit("ELY-2","Шотландская дивизия","infantry","edn",6)];
}

/* ================= ROOM / WORLD FACTORY ================= */

function createWorldState(){
  const provinces = Object.fromEntries(provinceDefs.map(d=>{const p=makeProvince(d);return [p.id,p];}));
  const countries = Object.fromEntries(initialCountries.map(c=>{const s=seedCountry(c);return [s.id,s];}));
  startingUnits(countries);
  return {
    phase:"running",
    year:1936, month:1, day:1, turn:1, speed:1, paused:false, weather:"clear",
    countries, provinces, wars:[], factions:[], players:[],
    log:["1936. Новая эпоха началась. История больше не предопределена."],
    globalEvents:[]
  };
}

function makeRoomId(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id;
  do{ id=Array.from({length:5},()=>chars[Math.floor(Math.random()*chars.length)]).join(""); }
  while(rooms.has(id));
  return id;
}

const rooms = new Map(); // id -> room
const wsRoom = new Map(); // ws -> roomId

function createRoom({name,mode,maxPlayers,speed}){
  const id = makeRoomId();
  const room = {
    id,
    name: String(name||"Кампания").replace(/[<>]/g,"").trim().slice(0,30) || "Кампания",
    mode: mode==="solo" ? "solo" : "online",
    maxPlayers: mode==="solo" ? 1 : Math.max(2,Math.min(20,Number(maxPlayers)||8)),
    createdAt: Date.now(),
    conn: new Set(),
    clients: new Map(), // ws -> player
    world: createWorldState()
  };
  room.world.speed = Math.max(0.5,Math.min(4,Number(speed)||1));
  rooms.set(id, room);
  return room;
}

function listRoomsSummary(){
  return Array.from(rooms.values()).map(r=>({
    id:r.id, name:r.name, mode:r.mode,
    players:r.world.players.length, maxPlayers:r.maxPlayers,
    year:r.world.year, month:r.world.month, day:r.world.day,
    paused:r.world.paused
  })).sort((a,b)=>b.players-a.players);
}

function cleanupRoomIfEmpty(room){
  if(room.conn.size===0){ rooms.delete(room.id); }
}

/* ================= WORLD LOGIC (per room) ================= */

function log(world,msg){
  world.log.unshift(msg);
  world.log = world.log.slice(0,28);
}
function pushEvent(world,text){
  world.globalEvents.push(`[${world.year}.${String(world.month).padStart(2,"0")}.${String(world.day).padStart(2,"0")}] ${text}`);
  world.globalEvents = world.globalEvents.slice(-60);
  log(world,text);
}
function publicState(room){
  const world = room.world;
  const units={};
  for(const c of Object.values(world.countries)) units[c.id]=c.units.map(u=>({...u}));
  return {
    roomId:room.id, roomName:room.name, roomMode:room.mode, maxPlayers:room.maxPlayers,
    phase:world.phase, year:world.year, month:world.month, day:world.day, turn:world.turn,
    speed:world.speed, paused:world.paused, weather:world.weather,
    countries:Object.fromEntries(Object.entries(world.countries).map(([id,c])=>[id,{
      id,tag:c.tag,name:c.name,color:c.color,capital:c.capital,ideology:c.ideology,manpower:c.manpower,
      baseIc:c.baseIc,energy:c.energy,metal:c.metal,rare:c.rare,oil:c.oil,supplies:c.supplies,money:c.money,
      unity:c.unity,stability:c.stability,warSupport:c.warSupport,tc:c.tc,leadership:c.leadership,
      research:c.research,icEff:c.icEff,politicalLeft:c.politicalLeft,economyLaw:c.economyLaw,conscription:c.conscription,
      ministers:c.ministers,researchSlots:c.researchSlots,researched:c.researched,production:c.production,
      air:c.air,navy:c.navy,spies:c.spies,spyNetworks:c.spyNetworks,politicalPoints:c.politicalPoints,
      faction:c.faction,casualties:c.casualties,victories:c.victories,tradeDeals:c.tradeDeals,
      relations:c.relations, ai:c.ai, decisions:c.decisions
    }])),
    provinces:world.provinces,
    units,
    wars:world.wars,
    factions:world.factions,
    players:world.players.map(p=>({id:p.id,nick:p.nick,country:p.country,ready:p.ready,host:p.host})),
    log:world.log,
    events:world.globalEvents.slice(-20),
    techDefs, decisionDefs
  };
}
function broadcast(room){
  const packet=JSON.stringify({type:"state",state:publicState(room)});
  for(const ws of room.conn) if(ws.readyState===1) ws.send(packet);
}
function reply(ws,type,data={}){ if(ws.readyState===1) ws.send(JSON.stringify({type,...data})); }

function ctxOf(ws){
  const roomId = wsRoom.get(ws);
  if(!roomId) return null;
  const room = rooms.get(roomId);
  if(!room) return null;
  const player = room.clients.get(ws) || null;
  return { room, world: room.world, player };
}
function ownProvince(world,countryId,provinceId){
  const p=world.provinces[provinceId];
  return p && p.controller===countryId;
}
function areAtWar(world,a,b){
  return world.wars.some(w=>(w.a===a&&w.b===b)||(w.a===b&&w.b===a));
}
function startWar(world,a,b){
  if(a===b || !world.countries[b] || areAtWar(world,a,b)) return false;
  const ca=world.countries[a], cb=world.countries[b];
  if(!ca||!cb) return false;
  if(ca.warSupport<10) return false;
  world.wars.push({a,b,started:{year:world.year,month:world.month,day:world.day}});
  ca.warSupport=Math.max(0,ca.warSupport-10);
  cb.warSupport=Math.min(100,cb.warSupport+12);
  log(world,`${ca.name} объявляет войну ${cb.name}.`);
  return true;
}
function addRelation(world,a,b,delta){
  const ca=world.countries[a], cb=world.countries[b];
  ca.relations[b]=(ca.relations[b]||0)+delta;
  cb.relations[a]=(cb.relations[a]||0)+delta;
}
function produce(c){
  const effectiveIc=Math.max(1,Math.floor(c.baseIc*c.icEff));
  let ic=effectiveIc;
  c.supplies += Math.floor(effectiveIc*.7);
  c.money += Math.max(0, Math.floor(effectiveIc*(c.economyLaw/180)));
  c.politicalPoints += .7;
  c.leadership += .02;
  c.research += .08;
  for(const q of c.production){
    if(ic<=0) break;
    const spend=Math.min(ic,Math.max(1,Math.ceil(effectiveIc/Math.max(1,c.production.length))));
    q.remaining-=spend*0.55;
    ic-=spend;
  }
  for(let i=c.production.length-1;i>=0;i--){
    const q=c.production[i];
    if(q.remaining<=0){
      const t=templates[q.type];
      c.manpower=Math.max(0,c.manpower-t.manpower);
      c.units.push(unit(`${c.tag}-${crypto.randomUUID().slice(0,5)}`,`${t.label} ${c.units.length+1}`,q.type,c.capital,1));
      c.production.splice(i,1);
    }
  }
}
function researchTick(world,c){
  for(let i=0;i<c.researchSlots.length;i++){
    const id=c.researchSlots[i];
    if(!id) continue;
    const def=techDefs.find(t=>t.id===id);
    if(!def) continue;
    c.research -= .35;
    if(c.research<=0){ c.research=0; break; }
    const current=c[`_tech_${id}`] ?? 0;
    c[`_tech_${id}`]=current + .35;
    if(c[`_tech_${id}`]>=def.cost){
      c.researched.push(id);
      c.researchSlots[i]=null;
      delete c[`_tech_${id}`];
      applyTech(c,def);
      log(world,`${c.name}: исследование завершено — ${def.name}.`);
    }
  }
}
function applyTech(c,def){
  for(const [k,v] of Object.entries(def.effects)){
    if(k==="inf_soft") c._infSoft=(c._infSoft||0)+v;
    if(k==="ic_eff") c.icEff += v;
    if(k==="motor_speed") c._motorSpeed=(c._motorSpeed||0)+v;
    if(k==="armor_soft") c._armorSoft=(c._armorSoft||0)+v;
    if(k==="armor_hard") c._armorHard=(c._armorHard||0)+v;
    if(k==="supply_capacity") c.tc += v;
    if(k==="air_def") c._airDef=(c._airDef||0)+v;
    if(k==="air_attack") c._airAttack=(c._airAttack||0)+v;
    if(k==="naval_power") c._navalPower=(c._navalPower||0)+v;
    if(k==="convoy_attack") c._convoyAttack=(c._convoyAttack||0)+v;
    if(k==="org") for(const u of c.units) u.maxOrg+=v;
    if(k==="oil_prod") c.oil+=v;
  }
}
function unitPower(c,u){
  const t=templates[u.type];
  return (t.soft + (c._infSoft||0)*(u.type==="infantry"?1:0) + (u.type==="armor"?(c._armorSoft||0):0)) *
    (0.7 + u.strength*.1) * (u.org/80) * (1+u.exp/100);
}
function battleStep(world,att,def,provinceId){
  const p=world.provinces[provinceId];
  const attacker=world.countries[att], defender=world.countries[def];
  const atkUnits=attacker.units.filter(u=>u.order?.type==="attack"&&u.order.target===provinceId && u.province!==provinceId);
  const defUnits=defender.units.filter(u=>u.province===provinceId);
  if(!atkUnits.length || !defUnits.length) return;
  const tm=terrainMod[p.terrain]||terrainMod.plains, wm=weatherMod[world.weather]||weatherMod.clear;
  let atk=atkUnits.reduce((s,u)=>s+unitPower(attacker,u),0)*tm.attack*wm.attack;
  let dp=defUnits.reduce((s,u)=>s+unitPower(defender,u),0)*tm.defense*wm.defense;
  if(defUnits.some(u=>u.entrenched>0)) dp*=1.12;
  const ratio=atk/Math.max(1,dp);
  for(const u of atkUnits){ u.org=Math.max(0,u.org-(ratio<1?4:2));u.strength=Math.max(0,u.strength-(ratio<1?.04:.02));u.planning=Math.min(100,u.planning+2); }
  for(const u of defUnits){ u.org=Math.max(0,u.org-(ratio>1?4:2));u.strength=Math.max(0,u.strength-(ratio>1?.04:.02)); }
  if(ratio>1.18){
    for(const u of atkUnits){ u.province=provinceId;u.order=null;u.entrenched=0;u.planning=0; }
    p.controller=attacker.id;
    attacker.victories += 1;
    log(world,`${attacker.name} захватывает ${p.name}.`);
  } else if(ratio<.72){
    for(const u of atkUnits) u.order=null;
    log(world,`${attacker.name} терпит неудачу у ${p.name}.`);
  }
}
function aiBrain(world){
  for(const c of Object.values(world.countries).filter(x=>x.ai)){
    if(c.warSupport>60 && Math.random()<.035){
      const targets=Object.values(world.countries).filter(t=>t.id!==c.id && !areAtWar(world,c.id,t.id));
      const t=targets[Math.floor(Math.random()*targets.length)];
      if(t) startWar(world,c.id,t.id);
    }
    if(c.baseIc>0 && c.production.length<4){
      const choices=c.aggression>60?["armor","infantry","motorized"]:["infantry","infantry","mountain"];
      const type=choices[Math.floor(Math.random()*choices.length)];
      const tm=templates[type];
      if(c.manpower>=tm.manpower*2) c.production.push({id:crypto.randomUUID(),type,remaining:tm.days,total:tm.days,serial:1});
    }
    for(let i=0;i<c.researchSlots.length;i++){
      if(!c.researchSlots[i]){
        const remaining=techDefs.filter(t=>!c.researched.includes(t.id));
        if(remaining.length) c.researchSlots[i]=remaining[Math.floor(Math.random()*remaining.length)].id;
      }
    }
    const enemyCountries=Object.values(world.countries).filter(e=>e.id!==c.id && areAtWar(world,c.id,e.id));
    if(enemyCountries.length){
      const targetCountry=enemyCountries[0];
      const targetProvs=Object.values(world.provinces).filter(p=>p.controller===targetCountry.id);
      if(targetProvs.length){
        const target=targetProvs[Math.floor(Math.random()*targetProvs.length)];
        const movable=c.units.filter(u=>u.strength>0.4 && !u.order);
        if(movable.length) movable.slice(0,Math.max(1,Math.floor(movable.length/2))).forEach(u=>u.order={type:"attack",target:target.id});
      }
    }
  }
}
function unitMovement(world){
  for(const c of Object.values(world.countries)){
    for(const u of c.units){
      if(!u.order) { u.entrenched=Math.min(100,u.entrenched+1); continue; }
      if(u.order.type==="move"){
        const target=world.provinces[u.order.target], current=world.provinces[u.province];
        if(target && target.neighbors.includes(current.id)){ u.province=target.id;u.order=null;u.planning=0; }
      }
      if(u.order.type==="attack"){
        const target=world.provinces[u.order.target];
        if(!target){ u.order=null; continue; }
        if(target.controller===c.id){ u.province=target.id;u.order=null;continue; }
        const current=world.provinces[u.province];
        if(target.neighbors.includes(current.id)) battleStep(world,c.id,target.controller,target.id);
        else {
          const next=target.neighbors.find(n=>world.provinces[n]?.controller===c.id);
          if(next) u.province=next;
        }
      }
    }
  }
}
function randomWeather(world){
  const arr=["clear","clear","clear","rain","snow","storm"];
  world.weather=arr[Math.floor(Math.random()*arr.length)];
}
function triggerEvents(world){
  for(const c of Object.values(world.countries)){
    if(Math.random()<0.22){
      const def=eventDefs[Math.floor(Math.random()*eventDefs.length)];
      def.apply(c);
      pushEvent(world,def.text(c));
    }
  }
  if(Math.random()<0.08){
    const def=globalEventDefs[Math.floor(Math.random()*globalEventDefs.length)];
    def.apply(world);
    pushEvent(world,def.text());
  }
}
function monthly(world){
  for(const c of Object.values(world.countries)){
    c.manpower = Math.max(0,c.manpower + Math.floor(c.manpower*.01));
    c.energy += 5; c.metal += 3; c.rare += 2; c.oil += 2;
    c.supplies=Math.max(0,c.supplies-10);
    if(c.stability<35) c.unity=Math.max(0,c.unity-1);
  }
  randomWeather(world);
  triggerEvents(world);
}
function tick(room){
  const world = room.world;
  if(world.paused) return;
  world.day++;
  if(world.day>30){world.day=1;world.month++;monthly(world);}
  if(world.month>12){world.month=1;world.year++;}
  world.turn++;
  for(const c of Object.values(world.countries)){
    produce(c);researchTick(world,c);
    const supplyRatio=Math.min(1,c.supplies/Math.max(1,c.tc));
    for(const u of c.units){
      u.org=Math.min(u.maxOrg,u.org+(supplyRatio>0.6?2:0.6));
      u.strength=Math.min(u.maxStrength,u.strength+0.002*(c.manpower>5?1:0));
      if(u.order?.type==="attack") u.planning=Math.min(100,u.planning+1);
    }
  }
  aiBrain(world);
  unitMovement(world);
  broadcast(room);
}

/* ================= MESSAGE HANDLING ================= */

function handle(ws,m){
  if(m.type==="list_rooms"){
    reply(ws,"rooms",{rooms:listRoomsSummary()});
    return;
  }

  if(m.type==="create_room"){
    const room=createRoom({name:m.name,mode:m.mode,maxPlayers:m.maxPlayers,speed:m.speed});
    room.conn.add(ws);
    wsRoom.set(ws,room.id);
    const snapshot=publicState(room); reply(ws,"room_ready",{roomId:room.id, state:snapshot}); reply(ws,"state",{state:snapshot});
    return;
  }

  if(m.type==="join_room"){
    const room=rooms.get(String(m.roomId||"").toUpperCase());
    if(!room){ reply(ws,"error",{message:"Комната не найдена."}); return; }
    if(room.world.players.length>=room.maxPlayers){ reply(ws,"error",{message:"Комната заполнена."}); return; }
    room.conn.add(ws);
    wsRoom.set(ws,room.id);
    const snapshot=publicState(room); reply(ws,"room_ready",{roomId:room.id, state:snapshot}); reply(ws,"state",{state:snapshot});
    return;
  }

  if(m.type==="leave_lobby"){
    const roomId=wsRoom.get(ws);
    if(roomId){
      const room=rooms.get(roomId);
      if(room){
        const p=room.clients.get(ws);
        if(p){
          room.clients.delete(ws);
          const i=room.world.players.findIndex(x=>x.id===p.id);
          if(i>=0) room.world.players.splice(i,1);
          log(room.world,`${p.nick} покинул кампанию.`);
          broadcast(room);
        }
        room.conn.delete(ws);
        cleanupRoomIfEmpty(room);
      }
      wsRoom.delete(ws);
    }
    reply(ws,"rooms",{rooms:listRoomsSummary()});
    return;
  }

  const ctx=ctxOf(ws);

  if(m.type==="rejoin"){
    const room=rooms.get(String(m.roomId||"").toUpperCase());
    if(!room){ reply(ws,"error",{message:"Комната больше не существует."}); return; }
    const nick=String(m.nick||"").replace(/[<>]/g,"").trim().slice(0,20);
    const cid=String(m.country||"");
    const oldId=String(m.id||"");
    let existing=room.world.players.find(p=>p.id===oldId && p.nick===nick);
    if(!existing){
      existing=room.world.players.find(p=>p.nick===nick && p.country===cid);
    }
    if(existing && room.world.countries[cid]){
      const other=room.clients;
      // Detach any stale socket associated with this player.
      for(const [sock,pl] of other){
        if(pl.id===existing.id && sock!==ws){
          try{sock.close();}catch{}
          other.delete(sock);
          wsRoom.delete(sock);
          room.conn.delete(sock);
        }
      }
      room.conn.add(ws);
      room.clients.set(ws,existing);
      wsRoom.set(ws,room.id);
      const snapshot=publicState(room);
      reply(ws,"joined",{id:existing.id,country:existing.country,roomId:room.id,state:snapshot});
      reply(ws,"state",{state:snapshot});
      broadcast(room);
      return;
    }
    reply(ws,"error",{message:"Не удалось восстановить подключение. Войди в комнату заново."});
    return;
  }

  if(m.type==="join"){
    if(!ctx){ reply(ws,"error",{message:"Сначала выберите комнату."}); return; }
    const { room, world, player } = ctx;
    if(player) return;
    if(world.players.length>=room.maxPlayers){ reply(ws,"error",{message:"Комната заполнена."}); return; }

    const nick=String(m.nick||"").replace(/[<>]/g,"").trim().slice(0,20);
    if(nick.length<2){
      reply(ws,"error",{message:"Введи никнейм минимум из 2 символов."});
      return;
    }

    const cid=String(m.country||"");
    if(!cid || !world.countries[cid]){
      reply(ws,"error",{message:"Выбери страну перед входом."});
      return;
    }
    if(world.players.some(x=>x.country===cid)){
      reply(ws,"error",{message:"Эта страна уже занята другим игроком."});
      return;
    }

    const id=crypto.randomUUID();
    const player2={id,nick,country:cid,ready:false,host:world.players.length===0};
    room.clients.set(ws,player2);
    world.players.push(player2);
    world.countries[cid].ai=false;
    log(world,`${nick} вошёл в кампанию за ${world.countries[cid].name}.`);

    // Send the state directly to this socket before the broadcast.
    // This removes the blank-screen/race-condition seen after joining.
    const snapshot=publicState(room);
    reply(ws,"joined",{id,country:cid,roomId:room.id,state:snapshot});
    reply(ws,"state",{state:snapshot});
    broadcast(room);
    return;
  }

  if(!ctx || !ctx.player){ reply(ws,"error",{message:"Сначала войдите в кампанию."}); return; }
  const { room, world, player: p } = ctx;
  const c=world.countries[p.country];

  if(m.type==="change_country"){
    const target=world.countries[m.country];
    if(!target){ reply(ws,"error",{message:"Страна не найдена."}); return; }
    if(world.players.some(x=>x.country===target.id && x.id!==p.id)){ reply(ws,"error",{message:"Эта страна уже занята."}); return; }
    p.country=target.id; target.ai=false;
    log(world,`${p.nick} теперь управляет ${target.name}.`); broadcast(room); return;
  }

  if(m.type==="set_pause"){
    if(!p.host){ reply(ws,"error",{message:"Поставить мир на паузу может только хост."}); return; }
    world.paused=Boolean(m.value); log(world,`${p.nick} ${world.paused?"поставил игру на паузу":"снял игру с паузы"}.`); broadcast(room); return;
  }
  if(m.type==="set_speed"){
    if(!p.host){ reply(ws,"error",{message:"Скорость мира меняет только хост."}); return; }
    world.speed=Math.max(0.5,Math.min(4,Number(m.value)||1));
    log(world,`${p.nick} изменил скорость игры на ${world.speed}x.`);
    broadcast(room); return;
  }
  if(m.type==="chat"){
    const text=String(m.text||"").trim().slice(0,180);
    if(text){ for(const ws2 of room.conn) reply(ws2,"chat",{channel:m.channel||"world",from:p.nick,text}); }
    return;
  }

  if(m.type==="action"){
    switch(m.action){
      case "factory":
        if(c.metal>=6 && c.baseIc<120){c.metal-=6;c.baseIc+=2;log(world,`${p.nick}: построена фабрика в национальной промышленности ${c.name}.`);}
        else {reply(ws,"error",{message:"Недостаточно металла или достигнут предел промышленности."});return;}
        break;
      case "division":{
        const type=templates[m.template||"infantry"]?m.template:"infantry";
        const t=templates[type];
        if(c.manpower<t.manpower || c.production.length>=8){reply(ws,"error",{message:"Невозможно поставить производство."});return;}
        c.production.push({id:crypto.randomUUID(),type,remaining:t.days,total:t.days,serial:1});
        log(world,`${p.nick}: заказал производство — ${t.label}.`);
        break;
      }
      case "move":{
        const u=c.units.find(x=>x.id===m.unit);
        if(!u || !ownProvince(world,c.id,u.province)){reply(ws,"error",{message:"Дивизия не найдена."});return;}
        const target=world.provinces[m.target];
        if(!target || !target.neighbors.includes(u.province)){reply(ws,"error",{message:"Нельзя переместить дивизию в эту провинцию."});return;}
        u.order={type:"move",target:target.id};u.planning=0;
        break;
      }
      case "attack":{
        const u=c.units.find(x=>x.id===m.unit);
        if(!u){reply(ws,"error",{message:"Дивизия не найдена."});return;}
        const target=world.provinces[m.target];
        if(!target || target.controller===c.id){reply(ws,"error",{message:"Неверная цель атаки."});return;}
        u.order={type:"attack",target:target.id};u.planning=Math.min(100,u.planning+5);
        break;
      }
      case "war":
        if(c.warSupport<10){reply(ws,"error",{message:"Недостаточно военной поддержки."});return;}
        if(!startWar(world,c.id,m.target)){reply(ws,"error",{message:"Нельзя начать эту войну."});return;}
        break;
      case "relation":
        if(c.money<5){reply(ws,"error",{message:"Нужно 5 денег."});return;}
        if(!world.countries[m.target]) return;
        c.money-=5; addRelation(world,c.id,m.target,10);log(world,`${p.nick}: дипломатическая миссия улучшила отношения с ${world.countries[m.target].name}.`);break;
      case "alliance":{
        if(c.money<10 || !world.countries[m.target]){reply(ws,"error",{message:"Недостаточно средств."});return;}
        c.money-=10;
        const other=world.countries[m.target];
        if(c.faction && other.faction && c.faction===other.faction) break;
        const f=world.factions.find(x=>x.name===`${c.tag}-${other.tag}`)||{id:crypto.randomUUID(),name:`${c.tag}-${other.tag}`,members:[]};
        if(!world.factions.includes(f)) world.factions.push(f);
        if(!f.members.includes(c.id)) f.members.push(c.id);
        if(!f.members.includes(other.id)) f.members.push(other.id);
        c.faction=f.id;other.faction=f.id;log(world,`${c.name} и ${other.name} создали военный альянс ${f.name}.`);break;
      }
      case "research_start":{
        const def=techDefs.find(x=>x.id===m.tech);
        const slot=Number(m.slot);
        if(!def || slot<0 || slot>=c.researchSlots.length){reply(ws,"error",{message:"Неверная технология."});return;}
        if(c.researched.includes(def.id)){reply(ws,"error",{message:"Технология уже исследована."});return;}
        if(c.researchSlots[slot]){reply(ws,"error",{message:"Слот уже занят."});return;}
        c.researchSlots[slot]=def.id;log(world,`${c.name}: начато исследование ${def.name}.`);break;
      }
      case "decision":{
        const def=decisionDefs.find(x=>x.id===m.decision);
        if(!def){reply(ws,"error",{message:"Неизвестное решение."});return;}
        if(c.decisions[def.id]){reply(ws,"error",{message:"Решение уже принято."});return;}
        if(c.politicalPoints<def.cost){reply(ws,"error",{message:"Недостаточно политических очков."});return;}
        c.politicalPoints-=def.cost; c.decisions[def.id]=true; def.apply(c);
        log(world,`${c.name}: принято решение — ${def.name}.`);
        break;
      }
      case "slider":{
        const key=m.key, val=Math.max(0,Math.min(100,Number(m.value)||0));
        if(["politicalLeft","economyLaw","conscription"].includes(key)) c[key]=val;
        break;
      }
      case "spy":{
        if(c.money<8){reply(ws,"error",{message:"Нужно 8 денег."});return;}
        if(!world.countries[m.target]||m.target===c.id)return;
        c.money-=8;c.spyNetworks[m.target]=(c.spyNetworks[m.target]||0)+10;
        log(world,`${c.name}: разведсеть усилилась в стране ${world.countries[m.target].name}.`);break;
      }
      case "trade":{
        if(c.money<5 || !world.countries[m.target]){reply(ws,"error",{message:"Недостаточно денег."});return;}
        c.money-=5;c.tradeDeals.push({with:m.target,metal:5,oil:3});
        c.metal+=5;c.oil+=3;
        log(world,`${c.name}: заключена торговая сделка с ${world.countries[m.target].name}.`);break;
      }
      default:
        reply(ws,"error",{message:"Неизвестное действие."});return;
    }
    broadcast(room); return;
  }
}

wss.on("connection",ws=>{
  ws.on("message",raw=>{ try{ handle(ws,JSON.parse(raw.toString())); }catch(e){ reply(ws,"error",{message:"Ошибка сервера запроса."}); } });
  ws.on("close",()=>{
    const roomId=wsRoom.get(ws);
    if(roomId){
      const room=rooms.get(roomId);
      if(room){
        const p=room.clients.get(ws);
        if(p){
          room.clients.delete(ws);
          const i=room.world.players.findIndex(x=>x.id===p.id);
          if(i>=0) room.world.players.splice(i,1);
          log(room.world,`${p.nick} покинул кампанию.`);
          broadcast(room);
        }
        room.conn.delete(ws);
        cleanupRoomIfEmpty(room);
      }
      wsRoom.delete(ws);
    }
  });
  reply(ws,"hello",{message:"Iron Era server ready"});
});

app.get("/health",(req,res)=>res.json({ok:true,rooms:rooms.size}));

setInterval(()=>{
  for(const room of rooms.values()){
    if(room.world.speed>=1){ for(let i=0;i<Math.floor(room.world.speed);i++) tick(room); }
    else if(Math.random()<room.world.speed) tick(room);
  }
}, TICK_MS);

server.listen(PORT,"0.0.0.0",()=>console.log(`Iron Era Online v0.6 on ${PORT}`));
