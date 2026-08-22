import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import crypto from "crypto";
import pg from "pg";

const { Pool } = pg;
const __dirname = new URL('.', import.meta.url).pathname;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
app.use(express.static(`${__dirname}/public`));

const PORT = Number(process.env.PORT || 10000);
const TICK_MS = 2000;

const terrain = {
  plains:{a:1,d:1,s:1}, forest:{a:.82,d:1.1,s:.82}, hills:{a:.84,d:1.14,s:.78},
  mountains:{a:.62,d:1.28,s:.55}, swamp:{a:.64,d:1.12,s:.56}, city:{a:.72,d:1.30,s:.62}, coast:{a:.92,d:1.02,s:.9}
};
const weather = {clear:{name:"Ясно",a:1,d:1,s:1},rain:{name:"Дождь",a:.9,d:.94,s:.88},snow:{name:"Снег",a:.78,d:.91,s:.74},storm:{name:"Шторм",a:.68,d:.84,s:.64}};
const templates = {
  infantry:{name:"Пехота",mp:10,cost:18,days:24,soft:12,hard:2,speed:3,supply:1},
  motorized:{name:"Мотопехота",mp:10,cost:26,days:28,soft:15,hard:4,speed:6,supply:1.3},
  armor:{name:"Бронетанковые",mp:12,cost:42,days:34,soft:20,hard:18,speed:7,supply:1.8},
  mountain:{name:"Горные",mp:9,cost:25,days:26,soft:14,hard:3,speed:4,supply:1.1},
  garrison:{name:"Гарнизон",mp:8,cost:15,days:18,soft:10,hard:1,speed:2,supply:.7}
};

const countries = [
  {id:"aurora",tag:"AUR",name:"Аурория",color:"#4d83e8",capital:"aur_cap",ideology:"Авторитаризм",mp:220,ic:52,energy:78,metal:56,rare:30,oil:24,money:64,stability:78,warSupport:28,aggression:48,ai:false},
  {id:"borealis",tag:"BOR",name:"Бореалия",color:"#b25560",capital:"bor_cap",ideology:"Военный режим",mp:270,ic:62,energy:70,metal:49,rare:25,oil:20,money:58,stability:68,warSupport:54,aggression:72,ai:true},
  {id:"centria",tag:"CEN",name:"Центрия",color:"#b69a4a",capital:"cen_cap",ideology:"Демократия",mp:190,ic:44,energy:66,metal:34,rare:34,oil:13,money:76,stability:84,warSupport:16,aggression:35,ai:true},
  {id:"doria",tag:"DOR",name:"Дория",color:"#4e9467",capital:"dor_cap",ideology:"Национализм",mp:175,ic:42,energy:58,metal:31,rare:20,oil:12,money:57,stability:70,warSupport:42,aggression:76,ai:true},
  {id:"elyria",tag:"ELY",name:"Элирия",color:"#815db0",capital:"ely_cap",ideology:"Демократия",mp:255,ic:58,energy:88,metal:38,rare:38,oil:21,money:82,stability:87,warSupport:22,aggression:44,ai:true},
  {id:"frontera",tag:"FRO",name:"Фронтера",color:"#b06c3e",capital:"fro_cap",ideology:"Республика",mp:150,ic:34,energy:52,metal:26,rare:22,oil:30,money:49,stability:66,warSupport:34,aggression:60,ai:true},
  {id:"gallia",tag:"GAL",name:"Галлия",color:"#6f92a8",capital:"gal_cap",ideology:"Республика",mp:205,ic:50,energy:72,metal:41,rare:29,oil:16,money:70,stability:80,warSupport:20,aggression:42,ai:true},
  {id:"hesperia",tag:"HES",name:"Гесперия",color:"#9d695d",capital:"hes_cap",ideology:"Монархия",mp:180,ic:39,energy:50,metal:28,rare:26,oil:25,money:52,stability:73,warSupport:40,aggression:56,ai:true},
  {id:"ionia",tag:"ION",name:"Иония",color:"#5a7f97",capital:"ion_cap",ideology:"Демократия",mp:135,ic:31,energy:47,metal:23,rare:27,oil:9,money:61,stability:78,warSupport:18,aggression:32,ai:true},
  {id:"kharak",tag:"KHA",name:"Кхарак",color:"#8a7048",capital:"kha_cap",ideology:"Военная хунта",mp:165,ic:37,energy:42,metal:44,rare:15,oil:34,money:44,stability:61,warSupport:60,aggression:80,ai:true},
  {id:"lydria",tag:"LYD",name:"Лидрия",color:"#6d8b5e",capital:"lyd_cap",ideology:"Социал-реформа",mp:160,ic:36,energy:61,metal:21,rare:31,oil:14,money:68,stability:75,warSupport:24,aggression:38,ai:true},
  {id:"meridia",tag:"MER",name:"Меридия",color:"#6d63a1",capital:"mer_cap",ideology:"Республика",mp:240,ic:54,energy:91,metal:36,rare:42,oil:28,money:86,stability:89,warSupport:15,aggression:40,ai:true}
];

const countriesMap = Object.fromEntries(countries.map(c=>[c.id,c]));
const landZones = [
  {country:"aurora",x:120,y:185,w:260,h:190}, {country:"borealis",x:380,y:120,w:300,h:180},
  {country:"centria",x:220,y:390,w:290,h:190}, {country:"doria",x:510,y:330,w:330,h:220},
  {country:"elyria",x:835,y:150,w:265,h:230}, {country:"frontera",x:60,y:510,w:255,h:205},
  {country:"gallia",x:340,y:595,w:265,h:180}, {country:"hesperia",x:625,y:575,w:270,h:205},
  {country:"ionia",x:915,y:390,w:230,h:180}, {country:"kharak",x:1090,y:485,w:270,h:210},
  {country:"lydria",x:1160,y:185,w:290,h:195}, {country:"meridia",x:1380,y:420,w:220,h:280}
];

function makeProvinces(){
  const out={}; const all=[];
  for(const z of landZones){
    const cols=3,rows=2,cw=z.w/cols,ch=z.h/rows;
    for(let r=0;r<rows;r++) for(let col=0;col<cols;col++){
      const pad=5; const x=z.x+col*cw+pad,y=z.y+r*ch+pad,w=cw-pad*2,h=ch-pad*2;
      const id=`${z.country}_${r}_${col}`;
      const isCap=(r===0&&col===1);
      const t=isCap?"city":(["plains","forest","hills","swamp","coast"][(r*cols+col+z.country.length)%5]);
      const p={id,name:isCap?countriesMap[z.country].name+" — столица":`${countriesMap[z.country].name} ${r*3+col+1}`,owner:z.country,controller:z.country,terrain:t,x:x+w/2,y:y+h/2,
        poly:[[x+8,y],[x+w-6,y+6],[x+w,y+h-10],[x+w-12,y+h],[x+8,y+h-6],[x,y+h*.55]],
        neighbors:[],industry:isCap?9:3+((r+col)%3),infrastructure:isCap?8:4+((r+col)%4),aa:isCap?3:0,port:t==="coast"?4:0,airfield:isCap?3:0,oil:((r+col+z.country.length)%7===0)?4:0,metal:2+((r+col)%4),rare:1+((r+col)%3),victory:isCap?10:2,resistance:0};
      out[id]=p;all.push({z:id,c:z.country,r,col});
    }
  }
  // internal neighbors by grid and border neighbors by nearest center distance
  for(const a of all){
    const pa=out[a.z];
    for(const b of all){
      if(a.z===b.z) continue;
      const pb=out[b.z];
      if(a.c===b.c && Math.abs(a.r-b.r)+Math.abs(a.col-b.col)===1){pa.neighbors.push(b.z);continue;}
      if(a.c!==b.c){
        const dx=pa.x-pb.x,dy=pa.y-pb.y,dist=Math.hypot(dx,dy);
        if(dist<155) pa.neighbors.push(b.z);
      }
    }
    pa.neighbors=[...new Set(pa.neighbors)];
  }
  return out;
}

const techDefs=[
  {id:"inf",name:"Пехотное оружие I",cost:90,group:"Армия",effects:"+2 мягкой атаки пехоты"},
  {id:"art",name:"Дивизионная артиллерия",cost:120,group:"Армия",effects:"+3 мягкой атаки пехоты"},
  {id:"motor",name:"Моторизация",cost:150,group:"Армия",effects:"+1 скорость моторизованных войск"},
  {id:"armor",name:"Средние танки",cost:180,group:"Броня",effects:"+5 бронебойности и +3 атаки танков"},
  {id:"logistics",name:"Логистика",cost:140,group:"Промышленность",effects:"+12 транспортной ёмкости"},
  {id:"industry",name:"Эффективность производства",cost:110,group:"Промышленность",effects:"+8% промышленности"},
  {id:"radar",name:"Радар",cost:145,group:"Авиация",effects:"+8 ПВО/разведки"},
  {id:"fighter",name:"Истребители I",cost:170,group:"Авиация",effects:"+8 силы ВВС"},
  {id:"naval",name:"Морская доктрина",cost:155,group:"Флот",effects:"+8 силы флота"},
  {id:"sub",name:"Подводная война",cost:150,group:"Флот",effects:"+10 атаки конвоев"},
  {id:"doctrine",name:"Оперативное планирование",cost:200,group:"Доктрина",effects:"+6 максимальной организации"}
];

const eventDefs=[
  {id:"aurora_rearm",country:"aurora",y:1936,m:2,d:12,title:"Тихая мобилизация",text:"Военное ведомство предлагает ускорить перевооружение. Это нарушит старые бюджеты, но даст стране более сильную армию.",choices:[
    {id:"approve",title:"Одобрить программу",desc:"+10% военной поддержки, +5 полит. очков, +1 промышленность.",effects:{warSupport:10,politicalPoints:5,ic:1}},
    {id:"delay",title:"Отложить решение",desc:"+4 стабильности, +10 денег.",effects:{stability:4,money:10}}
  ]},
  {id:"borealis_border",country:"borealis",y:1936,m:3,d:7,title:"Пограничный инцидент",text:"На границе произошла серия перестрелок. Генералы требуют решительного ответа.",choices:[
    {id:"firm",title:"Жёсткий ответ",desc:"+12 военной поддержки, отношения с соседями ухудшаются.",effects:{warSupport:12,relations:-10}},
    {id:"diplomacy",title:"Дипломатия",desc:"+8 стабильности, +5 денег.",effects:{stability:8,money:5}}
  ]},
  {id:"centria_workers",country:"centria",y:1936,m:3,d:20,title:"Закон о труде",text:"Профсоюзы требуют реформы условий труда, а промышленники предупреждают о возможном падении эффективности.",choices:[
    {id:"reform",title:"Принять реформу",desc:"+8 стабильности, -1 промышленность.",effects:{stability:8,ic:-1}},
    {id:"industry",title:"Сохранить старый порядок",desc:"+2 промышленность, -6 стабильности.",effects:{ic:2,stability:-6}}
  ]},
  {id:"doria_mediterranean",country:"doria",y:1936,m:5,d:8,title:"Средиземноморский вопрос",text:"Торговый путь становится предметом спора. Военные считают, что контроль проливов изменит баланс сил.",choices:[
    {id:"fleet",title:"Усилить флот",desc:"+1 корабль, -6 денег.",effects:{money:-6,navy:1}},
    {id:"trade",title:"Сделать ставку на торговлю",desc:"+12 денег, +5 стабильности.",effects:{money:12,stability:5}}
  ]},
  {id:"elyria_trade",country:"elyria",y:1936,m:6,d:16,title:"Имперская торговая инициатива",text:"Крупные торговые дома предлагают расширить договоры на редкие материалы.",choices:[
    {id:"open",title:"Открыть рынки",desc:"+12 редких материалов, +5 денег.",effects:{rare:12,money:5}},
    {id:"guard",title:"Защитить внутренний рынок",desc:"+7 стабильности, +2 промышленности.",effects:{stability:7,ic:2}}
  ]},
  {id:"frontera_fuel",country:"frontera",y:1936,m:7,d:10,title:"Нефтяной рывок",text:"Разведка сообщает о богатом месторождении на спорной территории.",choices:[
    {id:"drill",title:"Немедленно начать добычу",desc:"+6 нефти, +3 полит. очка.",effects:{oil:6,politicalPoints:3}},
    {id:"survey",title:"Провести геологическую разведку",desc:"+4 стабильности, +8 денег.",effects:{stability:4,money:8}}
  ]},
  {id:"gallia_election",country:"gallia",y:1936,m:8,d:12,title:"Досрочные выборы",text:"Парламент требует досрочного голосования. От этого зависит направление внутренней политики.",choices:[
    {id:"reform",title:"Курс на реформы",desc:"+8 стабильности, сдвиг политики влево.",effects:{stability:8,politicalLeft:8}},
    {id:"conservative",title:"Курс на порядок",desc:"+6 военной поддержки, сдвиг политики вправо.",effects:{warSupport:6,politicalLeft:-8}}
  ]},
  {id:"hesperia_army",country:"hesperia",y:1936,m:9,d:4,title:"Военная реформа",text:"Армейская комиссия требует модернизации штаба и увеличения бюджета учений.",choices:[
    {id:"yes",title:"Увеличить финансирование",desc:"+1 промышленность, +6 военной поддержки.",effects:{ic:1,warSupport:6}},
    {id:"no",title:"Сохранить расходы",desc:"+7 денег, +3 стабильности.",effects:{money:7,stability:3}}
  ]},
  {id:"ionia_crisis",country:"ionia",y:1936,m:10,d:2,title:"Кризис кабинета",text:"Министры спорят о внешней политике. Любое решение изменит общественное мнение.",choices:[
    {id:"hawk",title:"Усилить оборону",desc:"+10 военной поддержки, -4 стабильности.",effects:{warSupport:10,stability:-4}},
    {id:"dove",title:"Искать компромисс",desc:"+8 стабильности, +6 денег.",effects:{stability:8,money:6}}
  ]},
  {id:"kharak_oil",country:"kharak",y:1936,m:11,d:11,title:"Нефтяной коридор",text:"Военные настаивают на контроле нового нефтяного маршрута.",choices:[
    {id:"secure",title:"Ввести гарнизоны",desc:"+8 военной поддержки, +2 промышленность.",effects:{warSupport:8,ic:2}},
    {id:"market",title:"Продать нефть",desc:"+20 денег, +4 стабильности.",effects:{money:20,stability:4}}
  ]},
  {id:"lydria_reform",country:"lydria",y:1936,m:12,d:6,title:"Социальный пакт",text:"Правительство готово расширить социальные программы ценой части промышленного бюджета.",choices:[
    {id:"social",title:"Расширить программу",desc:"+10 стабильности, -2 промышленность.",effects:{stability:10,ic:-2}},
    {id:"industry",title:"Сосредоточиться на заводах",desc:"+3 промышленность, -7 стабильности.",effects:{ic:3,stability:-7}}
  ]},
  {id:"meridia_air",country:"meridia",y:1937,m:2,d:14,title:"Небо над Меридией",text:"Генеральный штаб предлагает ускорить программу истребительной авиации.",choices:[
    {id:"air",title:"Ускорить программу",desc:"+10 силы ВВС, -8 денег.",effects:{air:10,money:-8}},
    {id:"industry",title:"Отложить",desc:"+5 денег, +4 стабильности.",effects:{money:5,stability:4}}
  ]}
];

function seedCountry(c){
  return {...c,mp:c.mp,money:c.money,supplies:100,rare:c.rare,energy:c.energy,metal:c.metal,oil:c.oil,baseIc:c.ic,icEff:1,
    politicalPoints:25,leadership:4,research:2,tc:Math.round(c.ic*1.8),politicalLeft:50,economyLaw:50,conscription:35,
    researchSlots:[null,null,null],researched:[],production:[],units:[],air:{power:20,interceptors:8,bombers:4},navy:{power:20,destroyers:6,capital:1,submarines:4,convoys:20},
    spies:{domestic:3,foreign:2},spyNetworks:{},relations:{},faction:null,casualties:0,victories:0,pendingEvent:null,eventFlags:[],ministers:["Глава правительства","Министр экономики","Начальник штаба"]};
}
const world={year:1936,month:1,day:1,turn:1,speed:1,paused:false,weather:"clear",countries:Object.fromEntries(countries.map(c=>[c.id,seedCountry(c)])),provinces:makeProvinces(),wars:[],players:[],factions:[],log:["1936. Новая эра начинается. История ещё не написана."],events:[],eventQueue:[],rules:{maxPlayers:40}};

function unit(id,name,type,province,strength=1){return {id,name,type,province,strength,maxStrength:strength,org:80,maxOrg:80,exp:10,order:null,planning:0,commander:["Орлов","Коваль","Рейн","Марен","Фогель"][Math.floor(Math.random()*5)]};}
function seedUnits(){
  const starts={aurora:[["1-я Берлинская","infantry","aurora_0_1",10],["2-я Бронетанковая","armor","aurora_1_1",4]],borealis:[["1-я Варшавская","infantry","borealis_0_1",10],["Северный корпус","motorized","borealis_1_0",6]],centria:[["Парижская армия","infantry","centria_0_1",8],["Альпийский корпус","mountain","centria_1_1",5]],doria:[["Северная армия","infantry","doria_0_1",7],["Бронегруппа","armor","doria_0_0",4]],elyria:[["Экспедиционный корпус","motorized","elyria_0_1",7],["Шотландская дивизия","infantry","elyria_1_1",6]],frontera:[["Пустынный корпус","motorized","frontera_0_1",6]],gallia:[["Западная армия","infantry","gallia_0_1",8]],hesperia:[["Южная армия","infantry","hesperia_0_1",7]],ionia:[["Эгейский корпус","mountain","ionia_1_1",4]],kharak:[["Нефтяная армия","armor","kharak_0_1",4]],lydria:[["Центральная армия","infantry","lydria_0_1",7]],meridia:[["Федеральный корпус","motorized","meridia_0_1",8]]};
  for(const [cid,list] of Object.entries(starts)) world.countries[cid].units=list.map(([n,t,p,s],i)=>unit(`${cid}-${i+1}`,n,t,p,s));
}
seedUnits();

const clients=new Map();
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}):null;
async function ensureDb(){if(!pool)return;await pool.query(`CREATE TABLE IF NOT EXISTS iron_world(id integer primary key,payload jsonb not null,updated_at timestamptz default now())`);}
async function loadDb(){if(!pool)return;try{await ensureDb();const r=await pool.query(`SELECT payload FROM iron_world WHERE id=1`);if(r.rows[0]?.payload){const saved=r.rows[0].payload;Object.assign(world,saved); world.players=[]; for (const c of Object.values(world.countries)) { c.ai=true; c.pendingEvent=null; } console.log("Loaded saved world");}}catch(e){console.error("DB load:",e.message)}}
async function saveDb(){if(!pool)return;try{await ensureDb();await pool.query(`INSERT INTO iron_world(id,payload,updated_at) VALUES(1,$1,now()) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=now()`,[JSON.stringify(world)]);}catch(e){console.error("DB save:",e.message)}}

function log(x){world.log.unshift(x);world.log=world.log.slice(0,30);}
function relation(a,b,d){world.countries[a].relations[b]=(world.countries[a].relations[b]||0)+d;world.countries[b].relations[a]=(world.countries[b].relations[a]||0)+d;}
function atWar(a,b){return world.wars.some(w=>(w.a===a&&w.b===b)||(w.a===b&&w.b===a));}
function war(a,b){if(a===b||!world.countries[b]||atWar(a,b))return false;if(world.countries[a].warSupport<10)return false;world.wars.push({a,b,year:world.year,month:world.month,day:world.day});world.countries[a].warSupport=Math.max(0,world.countries[a].warSupport-10);log(`${world.countries[a].name} объявляет войну ${world.countries[b].name}.`);return true;}

function publicState(forPlayerId=null){
  const players=world.players.map(p=>({id:p.id,nick:p.nick,country:p.country,host:p.host,ready:p.ready}));
  const countriesPublic=Object.fromEntries(Object.entries(world.countries).map(([id,c])=>[id,{...c,relations:c.relations,spyNetworks:c.spyNetworks,pendingEvent:forPlayerId&&world.players.find(p=>p.id===forPlayerId)?.country===id?c.pendingEvent:null}]));
  return {year:world.year,month:world.month,day:world.day,turn:world.turn,speed:world.speed,paused:world.paused,weather:world.weather,countries:countriesPublic,provinces:world.provinces,wars:world.wars,players,factions:world.factions,log:world.log,events:world.events.slice(-12),techDefs,eventDefs:eventDefs.map(e=>({id:e.id,country:e.country,title:e.title})),rules:world.rules};
}
function sendState(ws){if(ws.readyState===1){const p=clients.get(ws);ws.send(JSON.stringify({type:"state",state:publicState(p?.id||null)}));}}
function broadcast(){for(const ws of clients.keys())sendState(ws);}
function msg(ws,type,data={}){if(ws.readyState===1)ws.send(JSON.stringify({type,...data}));}

function occupied(id,except=null){return world.players.some(p=>p.country===id&&p.id!==except);}
function pickEvent(c){
  const candidates=eventDefs.filter(e=>e.country===c.id&&!c.eventFlags.includes(e.id)&&e.y===world.year&&e.m===world.month&&e.d===world.day);
  if(!candidates.length)return;
  const ev=candidates[Math.floor(Math.random()*candidates.length)];
  c.pendingEvent={id:ev.id,title:ev.title,text:ev.text,choices:ev.choices};
  log(`${c.name}: национальное событие — «${ev.title}».`);
  if(c.ai){const choice=ev.choices[Math.floor(Math.random()*ev.choices.length)];applyEventChoice(c,ev,choice,true);}
}
function applyEventChoice(c,ev,choice,ai=false){
  const ef=choice.effects||{};
  for(const [k,v] of Object.entries(ef)){
    if(k==="ic") c.baseIc=Math.max(1,c.baseIc+v);
    else if(k==="politicalPoints") c.politicalPoints=Math.max(0,c.politicalPoints+v);
    else if(k==="relations") for(const x of Object.keys(world.countries)) if(x!==c.id) relation(c.id,x,v);
    else if(k==="navy") c.navy.power=Math.max(0,c.navy.power+v*6);
    else if(k==="air") c.air.power=Math.max(0,c.air.power+v);
    else if(k==="politicalLeft") c.politicalLeft=Math.max(0,Math.min(100,c.politicalLeft+v));
    else if(k in c) c[k]=Math.max(0,c[k]+v);
  }
  c.eventFlags.push(ev.id);c.pendingEvent=null;world.events.push(`${c.name}: ${ev.title} → ${choice.title}`);log(`${c.name}: ${choice.title}.`);
}

function production(c){
  const ic=Math.max(1,Math.floor(c.baseIc*c.icEff));
  c.politicalPoints+=.45;c.leadership+=.015;c.research+=.18;c.supplies=Math.min(200,c.supplies+Math.floor(ic*.45));c.money+=Math.floor(ic*.05);
  if(c.production.length){let q=c.production[0];q.remaining-=Math.max(1,ic*.25);if(q.remaining<=0){const t=templates[q.type];if(c.mp>=t.mp){c.mp-=t.mp;c.units.push(unit(`${c.tag}-${crypto.randomUUID().slice(0,5)}`,`${t.name} ${c.units.length+1}`,q.type,c.capital,1));log(`${c.name}: завершено производство — ${t.name}.`);}c.production.shift();}}
}
function research(c){for(let i=0;i<c.researchSlots.length;i++){const id=c.researchSlots[i];if(!id)continue;const t=techDefs.find(x=>x.id===id);if(!t)continue;c.research-=.25;if(c.research<0){c.research=0;break;}const key=`tech_${id}`;c[key]=(c[key]||0)+.25;if(c[key]>=t.cost){c.researched.push(id);c.researchSlots[i]=null;delete c[key];applyTech(c,id);log(`${c.name}: исследование завершено — ${t.name}.`)}}}
function applyTech(c,id){if(id==="industry")c.icEff+=.08;if(id==="logistics")c.tc+=12;if(id==="inf")for(const u of c.units)if(u.type==="infantry")u._soft=(u._soft||0)+2;if(id==="art")for(const u of c.units)if(u.type==="infantry")u._soft=(u._soft||0)+3;if(id==="motor")c._motor=(c._motor||0)+1;if(id==="armor")c._armor=(c._armor||0)+5;c.air.power+=id==="fighter"?8:0;c.navy.power+=id==="naval"?8:0;if(id==="radar")c.air.power+=4;}
function power(c,u){const t=templates[u.type];return (t.soft+(u._soft||0)+(u.type==="armor"?(c._armor||0):0))*u.strength*(u.org/80)*(1+u.exp/100);}
function moveAndFight(){
  for(const c of Object.values(world.countries))for(const u of c.units){
    if(!u.order){u.org=Math.min(u.maxOrg,u.org+.8);continue;}
    const target=world.provinces[u.order.target];if(!target){u.order=null;continue;}
    const cur=world.provinces[u.province];if(!target.neighbors.includes(cur.id)){u.order=null;continue;}
    if(u.order.type==="move"&&target.controller===c.id){u.province=target.id;u.order=null;continue;}
    if(u.order.type==="attack"&&target.controller!==c.id){
      if(!atWar(c.id,target.controller)){u.order=null;continue;}
      const def=world.countries[target.controller];const tm=terrain[target.terrain]||terrain.plains,wm=weather[world.weather];
      const defenders=def.units.filter(x=>x.province===target.id);const atk=power(c,u)*tm.a*wm.a;const dp=Math.max(1,defenders.reduce((s,x)=>s+power(def,x),0)*tm.d*wm.d);
      u.org=Math.max(0,u.org-(atk>dp?1.8:3.2));u.strength=Math.max(0,u.strength-(atk>dp?.015:.03));
      for(const d of defenders){d.org=Math.max(0,d.org-(atk>dp?3.2:1.4));d.strength=Math.max(0,d.strength-(atk>dp?.03:.01));}
      if(atk>dp*1.25){for(const d of defenders)d.order=null;target.controller=c.id;u.province=target.id;u.order=null;u.planning=0;c.victories++;log(`${c.name} захватывает ${target.name}.`);}
      else if(atk<dp*.72)u.order=null;
    }
  }
}
function aiThink(){for(const c of Object.values(world.countries).filter(x=>x.ai)){
  if(c.baseIc>0&&c.production.length<2){const type=c.aggression>65&&Math.random()<.45?"armor":"infantry";const t=templates[type];c.production.push({type,remaining:t.days,total:t.days});}
  if(c.researchSlots.some(x=>!x)){const free=c.researchSlots.findIndex(x=>!x);const choices=techDefs.filter(t=>!c.researched.includes(t.id)&&!c.researchSlots.includes(t.id));if(free>=0&&choices.length)c.researchSlots[free]=choices[Math.floor(Math.random()*choices.length)].id;}
  if(c.warSupport>55&&Math.random()<.02){const targets=Object.values(world.countries).filter(t=>t.id!==c.id&&!atWar(c.id,t.id));const t=targets[Math.floor(Math.random()*targets.length)];if(t)war(c.id,t.id);}
  if(Math.random()<.18&&c.units.length){const enemy=Object.values(world.countries).find(t=>t.id!==c.id&&atWar(c.id,t.id));if(enemy){const ps=Object.values(world.provinces).filter(p=>p.controller===enemy.id);const tp=ps[Math.floor(Math.random()*ps.length)];if(tp){const u=c.units.find(x=>tp.neighbors.includes(x.province)&&!x.order);if(u)u.order={type:"attack",target:tp.id};}}}
}}
function daily(){
  for(const c of Object.values(world.countries)){production(c);research(c);c.stability=Math.max(0,Math.min(100,c.stability+(c.stability<50?-0.08:.03)));c.mp=Math.max(0,c.mp+Math.floor(c.mp*.004));c.warSupport=Math.max(0,Math.min(100,c.warSupport+(c.aggression>60?.03:.01)));pickEvent(c);}
  aiThink();moveAndFight();
}
function tick(){if(world.paused)return;world.day++;if(world.day>30){world.day=1;world.month++;if(world.month>12){world.month=1;world.year++;}}world.turn++;if(world.turn%60===0)saveDb();daily();broadcast();}

function handle(ws,m){
  let p=clients.get(ws);
  if(m.type==="join"){
    if(p)return;
    const nick=String(m.nick||"").trim().replace(/[<>]/g,"").slice(0,20);
    const cid=String(m.country||"");
    if(!nick){msg(ws,"error",{message:"Введи никнейм."});return;}
    if(!cid||!world.countries[cid]){msg(ws,"error",{message:"Обязательно выбери страну."});return;}
    if(occupied(cid)){msg(ws,"error",{message:"Эта страна уже занята другим игроком."});return;}
    const id=crypto.randomUUID();p={id,nick,country:cid,host:world.players.length===0,ready:true};clients.set(ws,p);world.players.push(p);world.countries[cid].ai=false;log(`${nick} вступил в кампанию за ${world.countries[cid].name}.`);msg(ws,"joined",{id,country:cid});broadcast();return;
  }
  if(!p){msg(ws,"error",{message:"Сначала выбери страну и войди в кампанию."});return;}
  const c=world.countries[p.country];
  if(m.type==="chat"){const text=String(m.text||"").trim().slice(0,180);if(text)for(const ws2 of clients.keys())msg(ws2,"chat",{from:p.nick,text});return;}
  if(m.type==="pause"){if(!p.host){msg(ws,"error",{message:"Пауза доступна хосту."});return;}world.paused=!!m.value;log(`${p.nick} ${world.paused?"поставил игру на паузу":"снял игру с паузы"}.`);broadcast();return;}
  if(m.type==="speed"){if(!p.host)return;world.speed=Math.max(.5,Math.min(4,Number(m.value)||1));broadcast();return;}
  if(m.type==="event_choice"){const ev=c.pendingEvent;if(!ev||!ev.choices.some(x=>x.id===m.choice))return;const def=eventDefs.find(x=>x.id===ev.id);const choice=def.choices.find(x=>x.id===m.choice);applyEventChoice(c,def,choice);broadcast();return;}
  if(m.type==="action"){
    if(m.action==="factory"){if(c.metal<7){msg(ws,"error",{message:"Недостаточно металла."});return;}c.metal-=7;c.baseIc++;}
    else if(m.action==="produce"){const type=templates[m.template]?m.template:"infantry";if(c.production.length>=5){msg(ws,"error",{message:"Очередь производства заполнена."});return;}c.production.push({type,remaining:templates[type].days,total:templates[type].days});}
    else if(m.action==="research"){const slot=c.researchSlots.findIndex(x=>!x);const t=techDefs.find(x=>x.id===m.tech);if(!t||slot<0||c.researched.includes(t.id)){msg(ws,"error",{message:"Технология недоступна."});return;}c.researchSlots[slot]=t.id;}
    else if(m.action==="move"||m.action==="attack"){const u=c.units.find(x=>x.id===m.unit),target=world.provinces[m.target];if(!u||!target){msg(ws,"error",{message:"Неверная дивизия или провинция."});return;}if(!target.neighbors.includes(u.province)){msg(ws,"error",{message:"Провинция не соседняя."});return;}if(m.action==="attack"&&target.controller===c.id){msg(ws,"error",{message:"Это ваша территория."});return;}u.order={type:m.action,target:target.id};}
    else if(m.action==="war"){if(!war(c.id,m.target)){msg(ws,"error",{message:"Нельзя объявить эту войну."});return;}}
    else if(m.action==="relation"){if(c.money<5||!world.countries[m.target])return;c.money-=5;relation(c.id,m.target,8);}
    else if(m.action==="alliance"){const t=world.countries[m.target];if(!t||c.money<10)return;c.money-=10;const f=world.factions.find(x=>x.members.includes(c.id)&&x.members.includes(t.id))||{id:crypto.randomUUID(),name:`${c.tag}-${t.tag}`,members:[]};if(!world.factions.includes(f))world.factions.push(f);if(!f.members.includes(c.id))f.members.push(c.id);if(!f.members.includes(t.id))f.members.push(t.id);c.faction=f.id;t.faction=f.id;}
    else if(m.action==="spy"){if(c.money<8||!world.countries[m.target])return;c.money-=8;c.spyNetworks[m.target]=(c.spyNetworks[m.target]||0)+10;}
    else if(m.action==="trade"){if(c.money<6||!world.countries[m.target])return;c.money-=6;c.metal+=4;c.oil+=2;relation(c.id,m.target,3);}
    else if(m.action==="policy"){const k=m.key;if(["politicalLeft","economyLaw","conscription"].includes(k))c[k]=Math.max(0,Math.min(100,Number(m.value)||0));}
    broadcast();
  }
}

wss.on("connection",ws=>{
  msg(ws,"hello",{state:publicState(null),countries:world.countries,capacity:world.rules.maxPlayers});
  ws.on("message",raw=>{try{handle(ws,JSON.parse(raw.toString()));}catch(e){msg(ws,"error",{message:"Ошибка обработки запроса."});}});
  ws.on("close",()=>{const p=clients.get(ws);if(!p)return;clients.delete(ws);const i=world.players.findIndex(x=>x.id===p.id);if(i>=0)world.players.splice(i,1);log(`${p.nick} покинул мир.`);broadcast();});
});
app.get('/health',(req,res)=>res.json({ok:true,players:world.players.length,year:world.year,day:world.day}));
await loadDb();
setInterval(tick,TICK_MS);
server.listen(PORT,'0.0.0.0',()=>console.log(`Iron Era v0.6 listening on ${PORT}`));
