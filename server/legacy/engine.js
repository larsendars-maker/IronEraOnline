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
const PUBLIC_DIR = new URL('../../public', import.meta.url).pathname;
app.use(express.static(PUBLIC_DIR));

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

let dbOnline = Boolean(pool);

const sessions = new Map();
const sockets = new Map();
const rooms = new Map();

const COUNTRY_SEEDS = [
  ['usa','USA','Соединённые Штаты','#557fbd','a1',false,68,360],
  ['ussr','SOV','Советский Союз','#a3535b','b1',true,88,620],
  ['germany','GER','Германия','#575b63','c1',true,60,210],
  ['france','FRA','Франция','#456fa3','d1',true,54,190],
  ['britain','ENG','Великобритания','#8665a8','e1',true,56,225],
  ['italy','ITA','Италия','#6d9a5d','f1',true,42,165],
  ['spain','SPA','Испания','#b1764d','g1',true,36,145],
  ['poland','POL','Польша','#aa75a6','h1',true,30,160],
  ['scandinavia','SCA','Скандинавия','#628f83','i1',true,38,150],
  ['turkey','TUR','Турция','#9d7656','j1',true,34,180],
  ['iran','IRA','Иран','#6c8e83','k1',true,34,200],
  ['india','IND','Индия','#b16d58','l1',true,52,410]
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
const FOCUSES = [
  {id:'industrial_push',name:'Промышленный рывок',days:70,cost:10,fx:{ic:4,stability:2}},
  {id:'military_reform',name:'Военная реформа',days:70,cost:10,fx:{warSupport:7,politicalPoints:6}},
  {id:'infrastructure',name:'Национальная инфраструктура',days:70,cost:10,fx:{ic:2,tc:10}},
  {id:'air_rearmament',name:'Перевооружение ВВС',days:70,cost:10,fx:{air_fighters:4}},
  {id:'naval_program',name:'Морская программа',days:70,cost:10,fx:{navy_destroyers:2,navy_subs:2}},
  {id:'scientific_institute',name:'Научный институт',days:70,cost:10,fx:{researchSpeed:0.05}}
];

const DECISIONS = [
  {id:'emergency_funds',name:'Чрезвычайное финансирование',cost:25,fx:{money:30,stability:-2}},
  {id:'war_bonds',name:'Военные облигации',cost:30,fx:{warSupport:8,money:25}},
  {id:'rationing',name:'Нормирование снабжения',cost:20,fx:{supplies:30,stability:-1}},
  {id:'civil_defence',name:'Гражданская оборона',cost:20,fx:{stability:4,tc:6}}
];

const BUILDINGS = [
  {id:'factory',name:'Военный завод',cost:8,days:90},
  {id:'infrastructure',name:'Инфраструктура',cost:5,days:65},
  {id:'airbase',name:'Авиабаза',cost:7,days:80},
  {id:'radar',name:'Радар',cost:6,days:75},
  {id:'fort',name:'Укрепления',cost:6,days:70}
];


const EQUIPMENT = {
  infantry_equipment:{name:"Стрелковое оружие",cost:1},
  artillery_equipment:{name:"Артиллерия",cost:3},
  trucks:{name:"Грузовики",cost:2},
  support_equipment:{name:"Снабжение",cost:2},
  tanks:{name:"Танки",cost:6},
  aircraft:{name:"Самолёты",cost:5}
};
const DOCTRINES = [
  {id:"mobile_warfare",name:"Мобильная война",fx:{breakthrough:0.10,speed:0.08}},
  {id:"superior_firepower",name:"Превосходство огня",fx:{soft:0.10,defense:0.06}},
  {id:"grand_battleplan",name:"Большая битва",fx:{planning:0.12,defense:0.08}},
  {id:"mass_assault",name:"Массированный штурм",fx:{manpower:0.10,soft:0.07}}
];
const OCCUPATION = [
  {id:"civilian",name:"Гражданская",resistance:-.8,industry:.90},
  {id:"harsh",name:"Жёсткая",resistance:-1.5,industry:.70,stability:-1},
  {id:"martial",name:"Военное управление",resistance:-2.0,industry:.55,manpower:.15}
];


const MAP_MODES = ["political","industry","supply","resources","terrain","air","naval","resistance"];

const RANKS = [
  {id:"field_marshal",name:"Фельдмаршал",limit:24},
  {id:"general",name:"Генерал",limit:12},
  {id:"lt_general",name:"Генерал-лейтенант",limit:6}
];
const TRAITS = [
  {id:"panzer_leader",name:"Танковый командир",fx:{tank:.12}},
  {id:"defensive_doctrine",name:"Оборонительный специалист",fx:{defense:.10}},
  {id:"offensive_doctrine",name:"Наступательный специалист",fx:{attack:.10}},
  {id:"logistics_wizard",name:"Мастер логистики",fx:{supply:.15}},
  {id:"winter_specialist",name:"Специалист по зиме",fx:{snow:.18}}
];
const NATIONAL_FOCUS_TREE = {
  generic:[
    {id:"national_industry",name:"Национальная промышленность",days:70,requires:[],fx:{ic:3}},
    {id:"army_reform",name:"Армейская реформа",days:70,requires:["national_industry"],fx:{armyXP:15}},
    {id:"air_program",name:"Программа ВВС",days:70,requires:["national_industry"],fx:{fighters:6}},
    {id:"naval_program",name:"Морская программа",days:70,requires:["national_industry"],fx:{destroyers:2,submarines:1}},
    {id:"war_preparation",name:"Подготовка к войне",days:70,requires:["army_reform"],fx:{warSupport:8}}
  ]
};
const MAP_LAYERS = ["political","industry","resources","supply","resistance","air","naval","terrain","weather","victory"];
const SCENARIOS = [
  {id:"1936",name:"Мир на грани",year:1936,month:1,day:1},
  {id:"1939",name:"Тень мировой войны",year:1939,month:9,day:1},
  {id:"1941",name:"Глобальный конфликт",year:1941,month:6,day:1}
];

const WEATHER = [
  {id:"clear",name:"Ясно",attack:1.00,supply:1.00},
  {id:"rain",name:"Дождь",attack:.90,supply:.88},
  {id:"snow",name:"Снег",attack:.80,supply:.76},
  {id:"storm",name:"Шторм",attack:.70,supply:.65}
];
const NATIONAL_GOALS = [
  {id:"industrialization",name:"Большая индустриализация",type:"economy",score:10},
  {id:"armament",name:"Вооружение",type:"military",score:10},
  {id:"great_power",name:"Стать великой державой",type:"power",score:20},
  {id:"dominate_region",name:"Доминирование в регионе",type:"territory",score:25}
];
const VICTORY = {
  military:{name:"Военная победа",need:80},
  industry:{name:"Промышленная победа",need:140},
  diplomacy:{name:"Дипломатическая победа",need:6}
};

const UNIT_TYPES = {
  infantry:{name:"Пехота",mp:10,ic:18,days:24,soft:12,hard:2,def:16,breakthrough:4,speed:4,supply:1.0},
  motorized:{name:"Моторизованные",mp:10,ic:26,days:28,soft:15,hard:4,def:12,breakthrough:10,speed:7,supply:1.4},
  mechanized:{name:"Механизированные",mp:11,ic:34,days:31,soft:17,hard:8,def:14,breakthrough:13,speed:6,supply:1.6},
  artillery:{name:"Пехотная артиллерия",mp:9,ic:28,days:27,soft:22,hard:4,def:11,breakthrough:6,speed:3,supply:1.3},
  tank:{name:"Средние танки",mp:12,ic:44,days:36,soft:20,hard:22,def:18,breakthrough:25,speed:8,supply:1.9},
  mountain:{name:"Горные",mp:9,ic:25,days:26,soft:14,hard:3,def:18,breakthrough:6,speed:4,supply:1.1},
  marine:{name:"Морская пехота",mp:9,ic:27,days:27,soft:15,hard:3,def:13,breakthrough:8,speed:4,supply:1.2},
  paratrooper:{name:"Десант",mp:9,ic:32,days:30,soft:14,hard:4,def:12,breakthrough:8,speed:4,supply:1.2},
  garrison:{name:"Гарнизон",mp:8,ic:16,days:18,soft:10,hard:1,def:20,breakthrough:1,speed:2,supply:.7}
};

const DIVISION_TEMPLATES = {
  line_infantry:{name:"Линейная пехота 7/2",type:"infantry",width:20,soft:1.10,def:1.15,supply:1.0},
  armored_spearhead:{name:"Бронетанковое копьё",type:"tank",width:30,soft:1.25,breakthrough:1.35,supply:1.35},
  motor_assault:{name:"Моторизованный корпус",type:"motorized",width:20,speed:1.18,soft:1.08,supply:1.18},
  mountain_corps:{name:"Горный корпус",type:"mountain",width:20,def:1.20,soft:1.05,supply:1.08},
  marine_corps:{name:"Морская пехота",type:"marine",width:20,soft:1.05,def:1.08,supply:1.10}
};

const AIR_MISSIONS = ["air_superiority","interception","close_air_support","logistics_strike","strategic_bombing","naval_strike","recon"];
const NAVAL_MISSIONS = ["patrol","strike_force","convoy_raiding","convoy_escort","search_destroy","naval_invasion_support"];

const LAWS = {
  economy:[
    {id:"civilian",name:"Гражданская экономика",ic:.90,stability:2,consumer:.25},
    {id:"early_mobilization",name:"Ранняя мобилизация",ic:1.00,stability:0,consumer:.20},
    {id:"partial_mobilization",name:"Частичная мобилизация",ic:1.10,stability:-1,consumer:.15},
    {id:"war_economy",name:"Военная экономика",ic:1.20,stability:-2,consumer:.08}
  ],
  conscription:[
    {id:"volunteers",name:"Добровольцы",manpower:.4,warSupport:0},
    {id:"limited",name:"Ограниченная служба",manpower:.8,warSupport:1},
    {id:"extensive",name:"Расширенный призыв",manpower:1.4,warSupport:3},
    {id:"service_by_requirement",name:"Обязательная служба",manpower:2.0,warSupport:5}
  ],
  trade:[
    {id:"free_trade",name:"Свободная торговля",resource:1.25,ic:.10,stability:-1},
    {id:"export_focus",name:"Экспортный фокус",resource:1.10,ic:.05,stability:0},
    {id:"limited_exports",name:"Ограниченный экспорт",resource:0.90,ic:0,stability:1},
    {id:"closed_economy",name:"Закрытая экономика",resource:0.72,ic:-.05,stability:3}
  ]
};

const ADVISORS = [
  {id:"war_industrialist",name:"Военный промышленник",slot:"industry",effect:{ic:.08}},
  {id:"captain_industry",name:"Капитан индустрии",slot:"industry",effect:{construction:.08}},
  {id:"silent_workhorse",name:"Тихий работник",slot:"politics",effect:{pp:.20}},
  {id:"fascist_demagogue",name:"Агитатор",slot:"politics",effect:{warSupport:.08}},
  {id:"armaments_maverick",name:"Радикальный конструктор",slot:"industry",effect:{production:.08}},
  {id:"logistics_wizard",name:"Мастер логистики",slot:"military",effect:{supply:.15}},
  {id:"war_propagandist",name:"Военный пропагандист",slot:"military",effect:{org:4}}
];

const EVENTS = [
  {id:"industrial_strike",title:"Промышленная забастовка",text:"Рабочие требуют улучшений условий труда.",choices:[
    {id:"compromise",name:"Пойти на компромисс",fx:{stability:3,money:-10}},
    {id:"crackdown",name:"Жёсткий порядок",fx:{stability:-2,warSupport:4,ic:2}}
  ]},
  {id:"military_parade",title:"Военный парад",text:"Парад поднял боевой дух армии.",choices:[
    {id:"public",name:"Провести публично",fx:{warSupport:4,stability:1}},
    {id:"quiet",name:"Ограничиться штабом",fx:{pp:8}}
  ]},
  {id:"resource_boom",title:"Ресурсный бум",text:"Обнаружено новое сырьё.",choices:[
    {id:"invest",name:"Инвестировать",fx:{metal:8,oil:5,money:-8}},
    {id:"export",name:"Экспортировать",fx:{money:20,metal:3}}
  ]},
  {id:"border_crisis",title:"Пограничный кризис",text:"На границе возникло напряжение.",choices:[
    {id:"backdown",name:"Отступить",fx:{stability:2,warSupport:-2}},
    {id:"stand",name:"Не уступать",fx:{warSupport:6,stability:-1}}
  ]}
];

function baseCountryExtras(c){
  c.laws = {economy:"early_mobilization",conscription:"limited",trade:"export_focus"};
  c.advisors = [];
  c.nationalSpirits = ["Сила индустрии"];
  c.commanderPool = [];
  c.templates = {line_infantry:true,armored_spearhead:c.id==="germany",motor_assault:true,mountain_corps:true,marine_corps:false};
  c.armyXP=15;c.airXP=10;c.navyXP=10;
  c.commandPower=20;
  c.armyMorale=0;
  c.supplyUse=0;
  c.fronts=[];
  c.airWings=[];
  c.navalTaskForces=[];
  c.warGoals={};
  c.peaceScore=0;
  c.occupationPolicy="civilian";
  c.partisanPressure=0;
  c.licenses=[];
  c.lendLease=[];
  c.equipment={infantry_equipment:60,artillery_equipment:18,trucks:12,support_equipment:20,tanks:8,aircraft:15};
  c.doctrine=null;
  c.frontPlans=[];
  c.occupationPolicy='civilian';
  c.resistance={};
  c.tradeRoutes=[];
  c.surrenderProgress=0;
  c.victoryPoints=0;
  c.warScore=0;
  c.nationalGoals=[];
  c.completedGoals=[];
  c.notifications=[];
  c.inbox=[];
  c.saves=[];
  c.resistance=0;
  c.airZones={};
  c.navalZones={};
  c.tradeRoutes=[];
  c.pauseVote=false;
  c.lastSeen=Date.now();
  c.generals=[];
  c.armies=[];
  c.corps=[];
  c.commanderXP=0;
  c.frontLines=[];
  c.railways={};
  c.supplyNodes={};
  c.equipmentNeed={infantry_equipment:0,artillery_equipment:0,trucks:0,support_equipment:0,tanks:0,aircraft:0};
  c.nationalFocus={active:null,progress:0,completed:[]};
  c.history=[];
  c.achievements=[];
  c.rating=1000;
}




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
      air:{fighters:8,bombers:3,transport:1,airbases:1},navy:{destroyers:5,cruisers:1,submarines:3,convoys:15,navalBases:1},
      supply:100,supplyCapacity:100,construction:[],focus:{active:null,progress:0,completed:[]},decisionsUsed:[],eventsSeen:[],activeEvent:null
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
    baseCountryExtras(c);
  }
  return world;
}

function createRoom(name,hostUsername,maxPlayers=20){
  let id=crypto.randomBytes(4).toString('hex').toUpperCase();
  while(rooms.has(id)) id=crypto.randomBytes(4).toString('hex').toUpperCase();
  const room={id,name:String(name||'Новая кампания').slice(0,60),host:hostUsername,maxPlayers:Math.max(2,Math.min(40,Number(maxPlayers)||20)),status:'waiting',world:makeWorld(),clients:new Map(),lastSave:Date.now()};
  rooms.set(id,room);return room;
}
function roomOwnedBy(username){
  const key=String(username||'').trim().toLowerCase();
  return [...rooms.values()].find(r=>String(r.host||'').trim().toLowerCase()===key)||null;
}
function deleteRoom(room){
  if(!room) return false;
  for(const ws of room.clients.keys()){
    try{
      if(ws.readyState===1) ws.send(JSON.stringify({type:'room_deleted',message:'Комната удалена владельцем.'}));
      ws.close();
    }catch{}
    sockets.delete(ws);
  }
  room.clients.clear();
  rooms.delete(room.id);
  return true;
}
function roomState(room){
  const w=room.world;
  const players=w.players.map(p=>({id:p.id,nick:p.nick,country:p.country,ready:p.ready,host:p.host}));
  return {id:room.id,name:room.name,host:room.host,status:room.status,maxPlayers:room.maxPlayers,needsCountry:true,players,scenario:w.scenario||'1936',fogOfWar:w.fogOfWar!==false,
    year:w.year,month:w.month,day:w.day,paused:w.paused,speed:w.speed,weather:w.weather,
    countries:w.countries,provinces:w.provinces,wars:w.wars,factions:w.factions,events:w.events.slice(-20),log:w.log,techs:TECHS,focuses:FOCUSES,decisions:DECISIONS,buildings:BUILDINGS,unitTypes:UNIT_TYPES,divisionTemplates:DIVISION_TEMPLATES,airMissions:AIR_MISSIONS,navalMissions:NAVAL_MISSIONS,laws:LAWS,advisors:ADVISORS,eventDefs:EVENTS,equipment:EQUIPMENT,doctrines:DOCTRINES,occupationPolicies:OCCUPATION,mapModes:MAP_MODES,weatherDefs:WEATHER,nationalGoals:NATIONAL_GOALS,victoryConditions:VICTORY,mapLayers:MAP_LAYERS,ranks:RANKS,traits:TRAITS,nationalFocusTree:NATIONAL_FOCUS_TREE,scenarios:SCENARIOS};
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
  if(!pool){ dbOnline=false; console.log('[IronEra] DATABASE_URL not set; using memory mode.'); return; }
  try{
    await pool.query('SELECT 1');
    await pool.query(`CREATE TABLE IF NOT EXISTS ie_users(
      id uuid PRIMARY KEY,
      username varchar(40) UNIQUE NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz DEFAULT now()
    );`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ie_rooms(
      id varchar(24) PRIMARY KEY,
      name varchar(80) NOT NULL,
      payload jsonb NOT NULL,
      updated_at timestamptz DEFAULT now()
    );`);
    dbOnline=true;
    console.log('[IronEra] PostgreSQL online.');
  }catch(e){
    dbOnline=false;
    console.error('[IronEra] PostgreSQL unavailable; using memory mode:', e.message);
  }
}
async function saveRoom(room){
  if(!dbOnline)return;
  try{
    await pool.query(
      `INSERT INTO ie_rooms(id,name,payload,updated_at)
       VALUES($1,$2,$3,now())
       ON CONFLICT(id) DO UPDATE
       SET name=EXCLUDED.name,payload=EXCLUDED.payload,updated_at=now()`,
      [room.id,room.name,JSON.stringify({
        host:room.host,maxPlayers:room.maxPlayers,status:room.status,world:room.world
      })]
    );
  }catch(e){
    dbOnline=false;
    console.error('[IronEra] Save failed; switching to memory mode:', e.message);
  }
}
async function loadRooms(){
  if(!dbOnline)return;
  try{
    const r=await pool.query(`SELECT * FROM ie_rooms ORDER BY updated_at DESC LIMIT 30`);
    for(const row of r.rows){
      const p=row.payload||{};
      rooms.set(row.id,{
        id:row.id,name:row.name,host:p.host,maxPlayers:p.maxPlayers,
        status:p.status||'waiting',world:p.world||makeWorld(),
        clients:new Map(),lastSave:Date.now()
      });
    }
    console.log(`[IronEra] Loaded ${r.rows.length} saved rooms.`);
  }catch(e){
    dbOnline=false;
    console.error('[IronEra] Room load failed; using memory mode:', e.message);
  }
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

app.get('/',(_,res)=>res.sendFile(new URL('../../public/index.html',import.meta.url).pathname));
app.get('/lobby',(_,res)=>res.sendFile(new URL('../../public/pages/lobby.html',import.meta.url).pathname));
app.get('/game',(_,res)=>res.sendFile(new URL('../../public/pages/game.html',import.meta.url).pathname));
app.get('/profile',(_,res)=>res.sendFile(new URL('../../public/pages/profile.html',import.meta.url).pathname));
app.get('/api/me',(req,res)=>res.json({user:publicUser(userFromReq(req))}));
app.post('/api/auth/register',async(req,res)=>{try{const s=await auth(req.body.username,req.body.password);res.json({ok:true,token:s.token,user:publicUser(s)});}catch(e){res.status(400).json({ok:false,error:e.message});}});
app.post('/api/auth/login',async(req,res)=>{try{const s=await auth(req.body.username,req.body.password);res.json({ok:true,token:s.token,user:publicUser(s)});}catch(e){res.status(400).json({ok:false,error:e.message});}});
app.post('/api/auth/logout',(req,res)=>{const u=userFromReq(req);if(u)sessions.delete(u.token);res.json({ok:true});});
app.get('/api/rooms',(req,res)=>{
  const u=userFromReq(req);
  const owned=roomOwnedBy(u?.username);
  res.json({
    rooms:[...rooms.values()].map(r=>({id:r.id,name:r.name,status:r.status,host:r.host,maxPlayers:r.maxPlayers,players:r.world.players.length,date:`${r.world.year}.${String(r.world.month).padStart(2,'0')}.${String(r.world.day).padStart(2,'0')}`,owned:owned?.id===r.id})),
    ownedRoomId:owned?.id||null,
    canCreate:!owned
  });
});
app.post('/api/rooms',async(req,res)=>{
  const u=userFromReq(req);
  if(!u)return res.status(401).json({ok:false,error:'Нужна авторизация.'});
  const existing=roomOwnedBy(u.username);
  if(existing)return res.status(409).json({ok:false,error:`У тебя уже есть комната «${existing.name}». Сначала удали её.`,roomId:existing.id});
  const room=createRoom(req.body.name||`${u.username} — кампания`,u.username,req.body.maxPlayers);
  await saveRoom(room);
  res.json({ok:true,roomId:room.id});
});
app.delete('/api/rooms/:id',async(req,res)=>{
  const u=userFromReq(req);
  if(!u)return res.status(401).json({ok:false,error:'Нужна авторизация.'});
  const id=String(req.params.id||'').toUpperCase();
  const room=rooms.get(id);
  if(!room)return res.status(404).json({ok:false,error:'Комната не найдена.'});
  if(String(room.host).toLowerCase()!==String(u.username).toLowerCase())return res.status(403).json({ok:false,error:'Удалить комнату может только её владелец.'});
  deleteRoom(room);
  if(dbOnline){try{await pool.query('DELETE FROM ie_rooms WHERE id=$1',[id]);}catch(e){console.error('[IronEra] Delete room failed:',e.message);}}
  res.json({ok:true});
});
app.get('/api/profile' ,(req,res)=>{const u=userFromReq(req);if(!u)return res.status(401).json({ok:false,error:'Нужна авторизация.'});const history=[...rooms.values()].filter(r=>r.world.players.some(p=>p.nick===u.username)).map(r=>({id:r.id,name:r.name,status:r.status,date:`${r.world.year}.${r.world.month}.${r.world.day}`}));res.json({ok:true,user:publicUser(u),history});});
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
      const cid=String(m.country||'');
      if(!room.world.countries[cid]){ws.send(JSON.stringify({type:'error',message:'Выбери страну.'}));return;}
      const existingPlayer=room.world.players.find(p=>p.id===ses.userId);
      const occupied=room.world.players.find(p=>p.country===cid&&p.id!==ses.userId);
      if(occupied){ws.send(JSON.stringify({type:'error',message:'Эта страна уже занята.'}));return;}
      if(existingPlayer){
        if(existingPlayer.ready||room.status==='running'){ws.send(JSON.stringify({type:'error',message:'Сменить страну можно только до готовности.'}));return;}
        const old=existingPlayer.country;
        existingPlayer.country=cid;ses.country=cid;
        if(room.world.countries[old])room.world.countries[old].ai=true;
        room.world.countries[cid].ai=false;
        log(room.world,`${existingPlayer.nick} сменил страну на ${room.world.countries[cid].name}.`);
        ws.send(JSON.stringify({type:'joined',id:existingPlayer.id,country:existingPlayer.country,state:roomState(room)}));
        broadcast(room);saveRoom(room).catch(()=>{});return;
      }
      if(room.world.players.length>=room.maxPlayers){ws.send(JSON.stringify({type:'error',message:'Комната заполнена.'}));return;}
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


function applyFx(c,fx){
  for(const [k,v] of Object.entries(fx)){
    if(k==="money") c.money += v;
    else if(k==="stability") c.stability = Math.max(0,Math.min(100,c.stability+v));
    else if(k==="warSupport") c.warSupport = Math.max(0,Math.min(100,c.warSupport+v));
    else if(k==="ic") { c.ic += v; c.baseIc += v; }
    else if(k==="pp") c.politicalPoints += v;
    else if(k==="metal") c.metal += v;
    else if(k==="oil") c.oil += v;
    else if(k==="construction") c.constructionBonus=(c.constructionBonus||0)+v;
    else if(k==="production") c.productionBonus=(c.productionBonus||0)+v;
    else if(k==="supply") c.supplyBonus=(c.supplyBonus||0)+v;
    else if(k==="org") c.orgBonus=(c.orgBonus||0)+v;
    else if(k==="air_fighters") c.air.fighters += v;
    else if(k==="navy_destroyers") c.navy.destroyers += v;
    else if(k==="navy_subs") c.navy.submarines += v;
  }
}


function notifyPlayer(w, playerId, title, text){
  const c = w.countries[w.players.find(p=>p.id===playerId)?.country];
  if(!c)return;
  c.notifications.unshift({id:crypto.randomUUID(),title,text,time:Date.now()});
  c.notifications=c.notifications.slice(0,20);
}
function worldNotification(w,title,text,countryIds=[]){
  for(const c of countryIds){
    const ids=w.players.filter(p=>p.country===c).map(p=>p.id);
    ids.forEach(pid=>notifyPlayer(w,pid,title,text));
  }
}
function computeGoal(c,w,g){
  if(g.id==="industrialization") return c.ic>=80;
  if(g.id==="armament") return c.units.length>=12 || c.air.fighters>=30;
  if(g.id==="great_power") return c.ic>=110 && c.units.length>=16;
  if(g.id==="dominate_region") {
    const own=Object.values(w.provinces).filter(p=>p.controller===c.id).length;
    return own>=8;
  }
  return false;
}
function evaluateGoals(w,c){
  for(const g of NATIONAL_GOALS){
    if(!c.completedGoals.includes(g.id)&&computeGoal(c,w,g)){
      c.completedGoals.push(g.id); c.victoryPoints=(c.victoryPoints||0)+g.score;
      log(w,`${c.name}: выполнена национальная цель «${g.name}».`);
    }
  }
}
function evaluateVictory(w){
  for(const c of Object.values(w.countries)){
    if(c.victoryPoints>=VICTORY.military.need || c.ic>=VICTORY.industry.need || (c.faction && (w.factions.find(f=>f.id===c.faction)?.members?.length||0)>=VICTORY.diplomacy.need)){
      if(!w.winner){
        c.achievements.push('conqueror'); c.rating+=100; w.winner={country:c.id,reason:c.victoryPoints>=VICTORY.military.need?"Военная победа":c.ic>=VICTORY.industry.need?"Промышленная победа":"Дипломатическая победа"};
        w.status="finished";
        log(w,`${c.name} одержала победу: ${w.winner.reason}.`);
      }
    }
  }
}

function startNationalEvent(w,c){
  const available=EVENTS.filter(e=>!c.eventsSeen.includes(e.id));
  if(!available.length || c.activeEvent) return;
  const e=available[Math.floor(Math.random()*available.length)];
  c.activeEvent={id:e.id,title:e.title,text:e.text,choices:e.choices};
  log(w,`${c.name}: национальное событие — ${e.title}.`);
}

function resolveEvent(w,c,choiceId){
  if(!c.activeEvent)return false;
  const e=EVENTS.find(x=>x.id===c.activeEvent.id);
  const choice=e?.choices.find(x=>x.id===choiceId);
  if(!choice)return false;
  applyFx(c,choice.fx);
  c.eventsSeen.push(e.id);
  log(w,`${c.name}: решение «${choice.name}» по событию «${e.title}».`);
  c.activeEvent=null;
  return true;
}

function createFrontOrder(c,unitIds,targetProvinceId,type="attack"){
  return {id:crypto.randomUUID(),units:unitIds,target:targetProvinceId,type,planning:0,active:true};
}

function combatStats(c,u){
  const t=UNIT_TYPES[u.type]||UNIT_TYPES.infantry;
  const doctrine = c.commandPower>20 ? 1.05 : 1;
  const org = Math.max(.15,u.org/80);
  return {
    attack:(t.soft*(1+(c._softBonus||0))) * org * doctrine,
    hard:(t.hard*(1+(c._hardBonus||0))) * org,
    defense:t.def * org,
    breakthrough:t.breakthrough * org,
    supply:t.supply
  };
}




  if(m.action==='mark_notifications'){
    c.notifications=[];
    return;
  }
  if(m.action==='set_pause_vote'){
    c.pauseVote=!!m.value;
    const humans=w.players.length;
    const votes=w.players.filter(p=>w.countries[p.country]?.pauseVote).length;
    if(humans>0 && votes>=Math.ceil(humans/2)) w.paused=!w.paused;
    log(w,`${c.name}: голосование за паузу — ${votes}/${humans}.`);
    return;
  }
  if(m.action==='create_trade_route'){
    const target=w.countries[m.target];
    if(!target||target.id===c.id||c.metal<3){ws.send(JSON.stringify({type:'error',message:'Нельзя создать торговый маршрут.'}));return;}
    c.metal-=3;c.tradeRoutes.push({to:target.id,resource:m.resource||"metal",amount:3});
    target.metal+=3;log(w,`${c.name}: создан торговый маршрут с ${target.name}.`);return;
  }
  if(m.action==='observer'){
    const allowed=!!m.value;
    const p=w.players.find(p=>p.id===ses.userId);
    if(p) p.observer=allowed;
    return;
  }

  if(m.action==='create_general'){
    if(c.politicalPoints<15){ws.send(JSON.stringify({type:'error',message:'Нужно 15 политических очков.'}));return;}
    const g={id:crypto.randomUUID(),name:`Генерал ${c.generals.length+1}`,rank:"general",level:1,experience:0,traits:[TRAITS[Math.floor(Math.random()*TRAITS.length)].id]};
    c.politicalPoints-=15;c.generals.push(g);log(w,`${c.name}: назначен новый генерал.`);return;
  }
  if(m.action==='create_army_group'){
    const name=String(m.name||`Армия ${c.armies.length+1}`).slice(0,30);
    const army={id:crypto.randomUUID(),name,generalId:c.generals[0]?.id||null,units:[],front:null};
    c.armies.push(army);return;
  }
  if(m.action==='assign_unit'){
    const u=c.units.find(x=>x.id===m.unit), a=c.armies.find(x=>x.id===m.army);
    if(!u||!a)return;
    a.units=Array.from(new Set([...a.units,u.id]));u.armyId=a.id;return;
  }
  if(m.action==='set_focus'){
    const f=(NATIONAL_FOCUS_TREE.generic||[]).find(x=>x.id===m.focus);
    if(!f||c.nationalFocus.active||c.nationalFocus.completed.includes(f.id)){ws.send(JSON.stringify({type:'error',message:'Фокус недоступен.'}));return;}
    if(f.requires.some(r=>!c.nationalFocus.completed.includes(r))){ws.send(JSON.stringify({type:'error',message:'Предыдущие фокусы ещё не выполнены.'}));return;}
    c.nationalFocus.active={id:f.id,name:f.name,days:f.days};c.nationalFocus.progress=0;return;
  }
  if(m.action==='set_front'){
    const target=w.provinces[m.target];
    if(!target){return;}
    c.frontLines=[{id:crypto.randomUUID(),name:`Фронт: ${target.name}`,target:target.id,planning:0}];
    return;
  }
  if(m.action==='build_supply_node'){
    const p=w.provinces[m.province];
    if(!p||p.controller!==c.id||c.metal<10){ws.send(JSON.stringify({type:'error',message:'Нельзя построить узел снабжения.'}));return;}
    c.metal-=10;c.supplyNodes[p.id]=(c.supplyNodes[p.id]||0)+1;log(w,`${c.name}: создан узел снабжения в ${p.name}.`);return;
  }
  if(m.action==='build_railway'){
    const p=w.provinces[m.province];
    if(!p||p.controller!==c.id||c.metal<5){ws.send(JSON.stringify({type:'error',message:'Нельзя построить железную дорогу.'}));return;}
    c.metal-=5;c.railways[p.id]=(c.railways[p.id]||0)+1;return;
  }
  if(m.action==='set_air_zone'){
    c.airZones[m.province]=m.mission||"air_superiority";return;
  }
  if(m.action==='set_naval_zone'){
    c.navalZones[m.zone]=m.mission||"patrol";return;
  }
  if(m.action==='trade_resources'){
    const target=w.countries[m.target];
    if(!target||target.id===c.id||c.money<5)return;
    const amount=Math.min(10,Math.max(1,Number(m.amount)||3));
    c.money-=5;target.money+=5;
    if(m.resource==="oil"){c.oil=Math.max(0,c.oil-amount);target.oil+=amount}
    else {c.metal=Math.max(0,c.metal-amount);target.metal+=amount}
    log(w,`${c.name}: торговая сделка с ${target.name}.`);return;
  }
  if(m.action==='save_snapshot'){
    room.lastSave=Date.now(); saveRoom(room).catch(()=>{}); return;
  }
  if(m.action==='set_doctrine'){
    const d=DOCTRINES.find(x=>x.id===m.doctrine);
    if(!d){ws.send(JSON.stringify({type:'error',message:'Доктрина не найдена.'}));return;}
    if(c.doctrine===d.id){return;}
    if(c.armyXP<20){ws.send(JSON.stringify({type:'error',message:'Нужно 20 опыта армии.'}));return;}
    c.armyXP-=20;c.doctrine=d.id;log(w,`${c.name}: выбрана доктрина «${d.name}».`);return;
  }
  if(m.action==='set_occupation'){
    const p=w.provinces[m.province], policy=OCCUPATION.find(x=>x.id===m.policy);
    if(!p||p.controller!==c.id||!policy){ws.send(JSON.stringify({type:'error',message:'Нельзя изменить оккупацию.'}));return;}
    c.occupationPolicy=policy.id;log(w,`${c.name}: политика оккупации — ${policy.name}.`);return;
  }
  if(m.action==='front_plan'){
    const target=w.provinces[m.target];
    if(!target||target.controller===c.id){ws.send(JSON.stringify({type:'error',message:'Неверная цель фронта.'}));return;}
    const ids=(c.units||[]).filter(u=>u.province===m.from).map(u=>u.id);
    if(!ids.length){ws.send(JSON.stringify({type:'error',message:'Нет войск в исходной провинции.'}));return;}
    c.frontPlans=[{id:crypto.randomUUID(),from:m.from,target:m.target,units:ids,planning:0,status:'planning'}];
    log(w,`${c.name}: создан план наступления на ${target.name}.`);return;
  }
  if(m.action==='peace_offer'){
    const target=w.countries[m.target];
    if(!target||target.id===c.id){return;}
    c.peaceScore=(c.peaceScore||0)+5;
    log(w,`${c.name}: отправлено мирное предложение ${target.name}.`);
    return;
  }
  if(m.action==='air_sortie'){
    if(!AIR_MISSIONS.includes(m.mission)){return;}
    c.airMission=m.mission;c.airXP+=1;log(w,`${c.name}: авиация выполняет ${m.mission}.`);return;
  }
  if(m.action==='naval_order'){
    if(!NAVAL_MISSIONS.includes(m.mission)){return;}
    c.navalMission=m.mission;c.navyTaskForce={mission:m.mission};c.navyXP+=1;log(w,`${c.name}: флот получил приказ ${m.mission}.`);return;
  }
  if(m.action==='event_choice'){
    if(!resolveEvent(w,c,m.choice)){ws.send(JSON.stringify({type:'error',message:'Это событие уже недоступно.'}));return;}
    return;
  }
  if(m.action==='set_law'){
    const group=m.group,id=m.id;
    const law=(LAWS[group]||[]).find(x=>x.id===id);
    if(!law){ws.send(JSON.stringify({type:'error',message:'Закон не найден.'}));return;}
    c.laws[group]=id;log(w,`${c.name}: изменён закон — ${law.name}.`);return;
  }
  if(m.action==='hire_advisor'){
    const a=ADVISORS.find(x=>x.id===m.advisor);
    if(!a||c.advisors.includes(a.id)||c.politicalPoints<30){ws.send(JSON.stringify({type:'error',message:'Нельзя назначить советника.'}));return;}
    c.politicalPoints-=30;c.advisors.push(a.id);applyFx(c,a.effect);log(w,`${c.name}: назначен советник ${a.name}.`);return;
  }
  if(m.action==='set_template'){
    const t=DIVISION_TEMPLATES[m.template];
    if(!t){ws.send(JSON.stringify({type:'error',message:'Шаблон не найден.'}));return;}
    c.templates[m.template]=true; c.activeTemplate=m.template; log(w,`${c.name}: выбран шаблон дивизии ${t.name}.`);return;
  }
  if(m.action==='set_air_mission'){
    const mission=String(m.mission||"");
    if(!AIR_MISSIONS.includes(mission)){ws.send(JSON.stringify({type:'error',message:'Неверная воздушная миссия.'}));return;}
    c.airMission=mission;log(w,`${c.name}: ВВС выполняют миссию ${mission}.`);return;
  }
  if(m.action==='set_naval_mission'){
    const mission=String(m.mission||"");
    if(!NAVAL_MISSIONS.includes(mission)){ws.send(JSON.stringify({type:'error',message:'Неверная морская миссия.'}));return;}
    c.navalMission=mission;log(w,`${c.name}: флот выполняет миссию ${mission}.`);return;
  }
  if(m.action==='war_goal'){
    const target=w.countries[m.target];
    if(!target||target.id===c.id){ws.send(JSON.stringify({type:'error',message:'Цель войны не найдена.'}));return;}
    if(!w.wars.some(x=>(x.a===c.id&&x.b===target.id)||(x.a===target.id&&x.b===c.id))){
      c.warGoals[target.id]={type:m.goal||"conquest",cost:10};
      log(w,`${c.name}: заявлена военная цель против ${target.name}.`);
    }
    return;
  }
  if(m.action==='surrender'){
    if(c.id===m.target){return;}
    const target=w.countries[m.target];
    if(target){ target.peaceScore=(target.peaceScore||0)+10; log(w,`${c.name}: предложение о капитуляции отправлено ${target.name}.`); }
    return;
  }
  if(m.action==='lend_lease'){
    const target=w.countries[m.target];
    if(!target||c.metal<5){ws.send(JSON.stringify({type:'error',message:'Нельзя отправить ленд-лиз.'}));return;}
    c.metal-=5;target.metal+=5;target.supplies=(target.supplies||0)+10;c.lendLease.push({to:target.id,amount:5});log(w,`${c.name}: отправлен ленд-лиз ${target.name}.`);return;
  }
  if(m.action==='offer_faction'){
    const target=w.countries[m.target];
    if(!target||target.id===c.id){return;}
    if(!c.faction&&!target.faction){const f={id:crypto.randomUUID(),name:`${c.tag}-${target.tag}`,members:[c.id,target.id]};w.factions.push(f);c.faction=f.id;target.faction=f.id;log(w,`${c.name} и ${target.name} создали новый альянс.`);}
    return;
  }
  if(m.action==='start_focus'){
    const f=FOCUSES.find(x=>x.id===m.focus);
    if(!f||c.focus.active||c.focus.completed.includes(f.id)){ws.send(JSON.stringify({type:'error',message:'Нельзя начать этот фокус.'}));return;}
    if(c.politicalPoints<f.cost){ws.send(JSON.stringify({type:'error',message:'Недостаточно политических очков.'}));return;}
    c.politicalPoints-=f.cost;c.focus.active={id:f.id,name:f.name,days:f.days};c.focus.progress=0;log(w,`${c.name}: начат национальный фокус «${f.name}».`);return;
  }
  if(m.action==='decision'){
    const d=DECISIONS.find(x=>x.id===m.decision);
    if(!d||c.decisionsUsed.includes(d.id)){ws.send(JSON.stringify({type:'error',message:'Решение уже использовано или недоступно.'}));return;}
    if(c.politicalPoints<d.cost){ws.send(JSON.stringify({type:'error',message:'Недостаточно политических очков.'}));return;}
    c.politicalPoints-=d.cost;c.decisionsUsed.push(d.id);for(const [k,v] of Object.entries(d.fx)){c[k]=(c[k]||0)+v;}log(w,`${c.name}: принято решение «${d.name}».`);return;
  }
  if(m.action==='build'){
    const b=BUILDINGS.find(x=>x.id===m.building);const p=w.provinces[m.province];
    if(!b||!p||p.controller!==c.id||c.metal<b.cost){ws.send(JSON.stringify({type:'error',message:'Нельзя разместить строительство.'}));return;}
    c.metal-=b.cost;c.construction.push({id:crypto.randomUUID(),building:b.id,province:p.id,remaining:b.days,total:b.days});log(w,`${c.name}: строительство — ${b.name} в ${p.name}.`);return;
  }
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
    if(!c.focus.active&&c.focus.completed.length<3&&c.politicalPoints>12&&Math.random()<0.07){
      const f=FOCUSES.find(x=>!c.focus.completed.includes(x.id));
      if(f){c.politicalPoints-=f.cost;c.focus.active={id:f.id,name:f.name,days:f.days};c.focus.progress=0;log(w,`${c.name}: ИИ начал фокус — ${f.name}.`);}
    }
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
    const economyLaw=(LAWS.economy.find(x=>x.id===c.laws.economy)||LAWS.economy[1]);
    const tradeLaw=(LAWS.trade.find(x=>x.id===c.laws.trade)||LAWS.trade[1]);
    const consLaw=(LAWS.conscription.find(x=>x.id===c.laws.conscription)||LAWS.conscription[1]);
    c.money+=Math.floor(c.ic*.08);
    const eqUse=Math.max(1,Math.floor(c.units.length*.12));
    c.equipment.infantry_equipment=Math.max(0,c.equipment.infantry_equipment-eqUse*.20);
    c.equipmentNeed.infantry_equipment=Math.max(0,c.units.length*10-c.equipment.infantry_equipment);
    c.equipmentNeed.trucks=Math.max(0,c.units.length*2-c.equipment.trucks);
    c.equipment.support_equipment=Math.max(0,c.equipment.support_equipment-eqUse*.05);
    c.supply=Math.max(0,Math.min(c.supplyCapacity,c.supply + Math.floor(c.ic*.02) - Math.max(0,c.units.length-4)));
c.metal+=Math.max(0,Math.floor(2*tradeLaw.resource));c.oil+=1;c.rare+=1;c.energy+=2;c.politicalPoints+=.5;c.manpower+=Math.max(0,Math.floor(c.manpower*.001*consLaw.manpower*10));
    c.icEffective=Math.max(1,c.ic*economyLaw.ic*(1+(c.icEff-1)));c.supply=Math.max(0,Math.min(c.supplyCapacity,c.supply + Math.floor(c.ic*.02) - Math.max(0,c.units.length-4)));
    c.production.forEach(x=>x.remaining--);
    for(let i=c.production.length-1;i>=0;i--)if(c.production[i].remaining<=0){const prod=c.production[i];c.units.push({id:crypto.randomUUID(),name:`${c.name} ${c.units.length+1}-я дивизия`,type:prod.type,province:c.capital,strength:10,max:10,org:70,exp:0,order:null,commander:'Генерал'});c.production.splice(i,1);log(w,`${c.name}: завершено производство — ${prod.type}.`);}
    for(let i=0;i<c.researchSlots.length;i++){const tid=c.researchSlots[i];if(tid&&Math.random()<0.08){c.researched.push(tid);c.researchSlots[i]=null;log(w,`${c.name}: завершено исследование — ${TECHS.find(t=>t.id===tid)?.name||tid}.`);}}
    if(c.focus.active){
      c.focus.progress++;
      if(c.focus.progress>=c.focus.active.days){
        const f=FOCUSES.find(x=>x.id===c.focus.active.id);
        if(f){for(const [k,v] of Object.entries(f.fx)){c[k]=(c[k]||0)+v;}}
        c.focus.completed.push(c.focus.active.id);log(w,`${c.name}: завершён фокус — ${c.focus.active.name}.`);c.focus.active=null;c.focus.progress=0;
      }
    }
    for(let i=c.construction.length-1;i>=0;i--){
      const job=c.construction[i];job.remaining--;
      if(job.remaining<=0){
        const p=w.provinces[job.province];const b=BUILDINGS.find(x=>x.id===job.building);
        if(p&&b){
          if(b.id==='factory'){c.ic+=2;c.baseIc+=2;}
          if(b.id==='infrastructure')p.infrastructure++;
          if(b.id==='airbase')c.air.airbases++;
          if(b.id==='radar')p.radar=(p.radar||0)+1;
          if(b.id==='fort')p.fort=(p.fort||0)+1;
          log(w,`${c.name}: завершено строительство — ${b.name} в ${p.name}.`);
        }
        c.construction.splice(i,1);
      }
    }
    
    for(const p of Object.values(w.provinces)){
      if(p.controller!==p.owner){
        const occ=OCCUPATION.find(x=>x.id===c.occupationPolicy)||OCCUPATION[0];
        const r=Math.max(0,Math.min(100,(p.resistance||0)+(Math.random()*.8)+occ.resistance));
        p.resistance=r;
        if(r>85 && Math.random()<.01){
          log(w,`${c.name}: сопротивление в ${p.name} достигло критического уровня.`);
          c.partisanPressure=(c.partisanPressure||0)+1;
        }
      }
    }

    for(const u of c.units){u.org=Math.min(100,u.org+(c.supply>20?1:.2));if(u.order?.type==='attack'){const target=w.provinces[u.order.target];if(target&&target.controller!==c.id){u.org-=.5;if(Math.random()<.08&&u.org>20){target.controller=c.id;u.province=target.id;u.order=null;log(w,`${c.name} захватывает ${target.name}.`);
      worldNotification(w,'ПОТЕРЯ ТЕРРИТОРИИ',`${target.name} потеряла ${target.name}.`,[target.controller]);}}}}
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
