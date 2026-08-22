let state=null,ws=null,myId=null,myCountry=null,selectedProvince=null,selectedUnit=null,mapMode="political",joined=false;
const canvas=document.getElementById('map'),ctx=canvas.getContext('2d');
const weatherNames={clear:'ЯСНО',rain:'ДОЖДЬ',snow:'СНЕГ',storm:'ШТОРМ'};
const terrainColors={plains:'#71845e',forest:'#4d684b',hills:'#8b7858',mountains:'#6d6a61',swamp:'#58735e',city:'#8f826b',coast:'#5e8290'};

function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function send(o){if(ws?.readyState===1)ws.send(JSON.stringify(o));}
function currentCountry(){return state?.countries?.[myCountry]||null;}
function getCountryByProvince(pid){const p=state?.provinces?.[pid];return p?state.countries[p.controller]:null;}

function setLobbyState(message){document.getElementById('lobbyStatus').textContent=message;}
function refreshLobby(){
  if(!state)return;
  const select=document.getElementById('countrySelect');
  const players=new Set(state.players.map(p=>p.country));
  const previous=select.value;
  select.innerHTML='<option value="">— Выберите страну —</option>';
  Object.values(state.countries).forEach(c=>{
    const opt=document.createElement('option'); opt.value=c.id;
    opt.textContent=`${c.name} • ${c.ideology}${c.ai?' • ИИ':''}${players.has(c.id)?' • ЗАНЯТА':''}`;
    opt.disabled=players.has(c.id);
    select.appendChild(opt);
  });
  if(previous && state.countries[previous] && !players.has(previous)) select.value=previous;
  validateJoin();
}
function validateJoin(){
  const n=document.getElementById('nickInput').value.trim();
  const c=document.getElementById('countrySelect').value;
  document.getElementById('joinButton').disabled=!(n.length>=2&&c);
}

document.getElementById('nickInput').addEventListener('input',validateJoin);
document.getElementById('countrySelect').addEventListener('change',validateJoin);
document.getElementById('joinButton').onclick=()=>{
  const nick=document.getElementById('nickInput').value.trim(),country=document.getElementById('countrySelect').value;
  if(!nick||!country){setLobbyState('Выбери никнейм и страну.');return;}
  setLobbyState('Входим в мировую кампанию…');
  send({type:'join',nick,country});
};

function connect(){
  const url=(location.protocol==='https:'?'wss://':'ws://')+location.host;
  ws=new WebSocket(url);
  ws.onopen=()=>{document.getElementById('net').textContent='● WEBSOCKET ONLINE';document.getElementById('net').style.color='#78c984';setLobbyState('Сервер подключён. Выбери державу.');};
  ws.onclose=()=>{document.getElementById('net').textContent='● ПЕРЕПОДКЛЮЧЕНИЕ';document.getElementById('net').style.color='#c96a62';if(!joined)setLobbyState('Соединение разорвано. Повторное подключение…');setTimeout(connect,1200);};
  ws.onerror=()=>setLobbyState('Ошибка соединения с сервером.');
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==='hello'){
      state=m.state;refreshLobby();drawMap();
      setLobbyState('Сервер готов. Выбери страну и никнейм.');
    } else if(m.type==='joined'){
      joined=true;myId=m.id;myCountry=m.country;document.getElementById('lobby').classList.add('hidden');
    } else if(m.type==='state'){
      state=m.state;refreshLobby();render();
    } else if(m.type==='error'){setLobbyState(m.message);alert(m.message);}
    else if(m.type==='chat'){appendChat(m);}
  };
}
function appendChat(m){const box=document.getElementById('chat');box.insertAdjacentHTML('beforeend',`<div class="msg"><b>${esc(m.from)}:</b> ${esc(m.text)}</div>`);box.scrollTop=box.scrollHeight;}

function render(){
  if(!state)return;
  const c=currentCountry(); if(!c)return;
  document.getElementById('date').textContent=`${state.year}.${String(state.month).padStart(2,'0')}.${String(state.day).padStart(2,'0')} • ХОД ${state.turn}`;
  document.getElementById('weather').textContent=weatherNames[state.weather]||state.weather;
  document.getElementById('money').textContent=Math.floor(c.money);
  document.getElementById('ic').textContent=Math.floor(c.baseIc*c.icEff);
  document.getElementById('metal').textContent=Math.floor(c.metal);
  document.getElementById('oil').textContent=Math.floor(c.oil);
  document.getElementById('mp').textContent=Math.floor(c.mp);
  document.getElementById('online').textContent=state.players.length;
  document.getElementById('playerCount').textContent=state.players.length;
  document.getElementById('countryName').textContent=c.name;
  const owner=state.players.find(p=>p.country===c.id);
  document.getElementById('countryOwner').textContent=owner?`👤 ${owner.nick} • ${c.ideology}`:`🤖 ${c.ideology}`;
  document.getElementById('countryColor').style.background=c.color;
  document.getElementById('sIc').textContent=Math.floor(c.baseIc*c.icEff);
  document.getElementById('sStab').textContent=Math.floor(c.stability)+'%';
  document.getElementById('sMp').textContent=Math.floor(c.mp);
  document.getElementById('sWar').textContent=Math.floor(c.warSupport)+'%';
  document.getElementById('sTc').textContent=Math.floor(c.tc);
  document.getElementById('sPp').textContent=Math.floor(c.politicalPoints);
  document.getElementById('overviewFeed').innerHTML=`<div>Столица: <b>${esc(state.provinces[c.capital]?.name||c.capital)}</b></div><div>Доктрина: ${esc(c.ideology)}</div><div>Фракция: ${c.faction?'<span class="event-badge">есть</span>':'нет'}</div>`;
  renderPlayers();renderArmy();renderProduction();renderTech();renderDiplomacy();renderPolitics();renderIntel();renderStats();renderLogs();renderEvent();drawMap();
}
function renderPlayers(){
  document.getElementById('players').innerHTML=state.players.map(p=>{const c=state.countries[p.country];return `<div class="player"><div class="avatar" style="background:${c.color}">${esc(p.nick.slice(0,2).toUpperCase())}</div><b>${esc(p.nick)}</b><small>${esc(c.name)}</small></div>`}).join('')||'<div class="feed">Никого нет.</div>';
}
function renderArmy(){
  const c=currentCountry(),units=state.countries[c.id]?getUnits(c.id):[];
  document.getElementById('armyList').innerHTML=units.map(u=>`<div class="listrow" data-unit="${u.id}"><b>${esc(u.name)}</b> <small>${esc(u.type)} • ${esc(u.commander)}</small><div><small>${esc(state.provinces[u.province]?.name||u.province)} • орг. ${Math.round(u.org)}%</small></div><div class="progress"><i style="width:${Math.max(0,Math.min(100,u.org))}%"></i></div></div>`).join('')||'<div class="listrow">Армия пуста.</div>';
}
function getUnits(cid){
  // In v0.6 public state exposes units through each country's units field.
  return state.countries[cid]?.units||[];
}
function renderProduction(){
  const c=currentCountry();document.getElementById('productionList').innerHTML=(c.production||[]).map(q=>{const pct=Math.max(0,Math.min(100,100*(1-q.remaining/q.total)));return `<div class="listrow"><b>${label(q.type)}</b><small>${Math.round(pct)}%</small><div class="progress"><i style="width:${pct}%"></i></div></div>`}).join('')||'<div class="listrow">Производственная очередь пуста.</div>';
}
function label(t){return {infantry:'Пехотная дивизия',motorized:'Моторизованная дивизия',armor:'Бронетанковая дивизия',mountain:'Горная дивизия',garrison:'Гарнизон'}[t]||t;}
function renderTech(){
  const c=currentCountry();document.getElementById('researchList').innerHTML=state.techDefs.map(t=>{const done=c.researched.includes(t.id),slot=c.researchSlots.indexOf(t.id);return `<div class="listrow"><b>${esc(t.name)}</b><small>${done?'✓ ИССЛЕДОВАНО':slot>=0?'СЛОТ '+(slot+1):t.group}</small><div><small>${esc(t.effects)} • ${t.cost} очков</small></div>${!done&&slot<0?`<button class="wide research-btn" data-tech="${t.id}">ИССЛЕДОВАТЬ</button>`:''}</div>`}).join('');document.querySelectorAll('.research-btn').forEach(b=>b.onclick=()=>send({type:'action',action:'research',tech:b.dataset.tech}));
}
function renderDiplomacy(){
  const c=currentCountry(),others=Object.values(state.countries).filter(x=>x.id!==c.id);const target=document.getElementById('targetSelect');target.innerHTML=others.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');document.getElementById('spyTarget').innerHTML=target.innerHTML;document.getElementById('relations').innerHTML=others.map(x=>`<div><span>${esc(x.name)}</span><b>${Math.round(c.relations?.[x.id]||0)}</b></div>`).join('');
}
function renderPolitics(){const c=currentCountry();politicalLeft.value=c.politicalLeft;economyLaw.value=c.economyLaw;conscription.value=c.conscription;politicalLeftV.textContent=Math.round(c.politicalLeft);economyLawV.textContent=Math.round(c.economyLaw);conscriptionV.textContent=Math.round(c.conscription);ministers.innerHTML=c.ministers.map(x=>`<span class="chip">${esc(x)}</span>`).join('');}
function renderIntel(){const c=currentCountry();spiesDom.textContent=c.spies.domestic;spiesFor.textContent=c.spies.foreign;document.getElementById('spyList').innerHTML=Object.entries(c.spyNetworks||{}).map(([id,v])=>`<div class="listrow"><b>${esc(state.countries[id]?.name||id)}</b><small>${Math.round(v)}%</small><div class="progress"><i style="width:${Math.min(100,v)}%"></i></div></div>`).join('')||'<div class="listrow">Разведсети пока не созданы.</div>';}
function renderStats(){const arr=Object.values(state.countries).sort((a,b)=>(b.baseIc*b.icEff)-(a.baseIc*a.icEff));document.getElementById('worldStats').innerHTML=`<div class="table-row" style="color:#808279"><span>#</span><span>Страна</span><span>IC</span><span>Люди</span></div>`+arr.map((x,i)=>`<div class="table-row"><span>${i+1}</span><span>${esc(x.name)}</span><span>${Math.floor(x.baseIc*x.icEff)}</span><span>${Math.floor(x.mp)}</span></div>`).join('');}
function renderLogs(){document.getElementById('log').innerHTML=state.log.map(x=>`<div>${esc(x)}</div>`).join('');document.getElementById('wars').innerHTML=state.wars.map(w=>`<div>${esc(state.countries[w.a]?.name)} ⚔ ${esc(state.countries[w.b]?.name)}</div>`).join('')||'<div>Войн нет.</div>';}
function renderEvent(){const ev=currentCountry()?.pendingEvent;if(!ev){document.getElementById('eventModal').classList.add('hidden');return;}document.getElementById('eventTitle').textContent=ev.title;document.getElementById('eventText').textContent=ev.text;document.getElementById('eventChoices').innerHTML=ev.choices.map(ch=>`<button class="event-choice" data-choice="${ch.id}"><b>${esc(ch.title)}</b><small>${esc(ch.desc)}</small></button>`).join('');document.getElementById('eventModal').classList.remove('hidden');document.querySelectorAll('.event-choice').forEach(b=>b.onclick=()=>{send({type:'event_choice',choice:b.dataset.choice});document.getElementById('eventModal').classList.add('hidden');});}

function poly(poly){ctx.beginPath();ctx.moveTo(poly[0][0],poly[0][1]);for(let i=1;i<poly.length;i++)ctx.lineTo(poly[i][0],poly[i][1]);ctx.closePath();}
function pointInPoly(x,y,p){let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const xi=p[i][0],yi=p[i][1],xj=p[j][0],yj=p[j][1];const hit=((yi>y)!=(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi;if(hit)inside=!inside;}return inside;}
function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};}
function mapFill(p){const c=state.countries[p.controller];if(mapMode==='political')return c?.color||'#666';if(mapMode==='industry'){const v=p.industry;return v>=9?'#d45d57':v>=6?'#b99558':'#627f67';}if(mapMode==='supply')return p.controller===myCountry?'#5f9a6a':'#5b6560';if(mapMode==='terrain')return terrainColors[p.terrain]||'#777';return c?.color||'#666';}
function drawMap(){
  if(!state)return;ctx.clearRect(0,0,canvas.width,canvas.height);const g=ctx.createLinearGradient(0,0,0,900);g.addColorStop(0,'#3f4c40');g.addColorStop(1,'#1d271f');ctx.fillStyle=g;ctx.fillRect(0,0,1600,900);
  ctx.strokeStyle='#fff1';ctx.lineWidth=1;for(let x=0;x<1600;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,900);ctx.stroke();}for(let y=0;y<900;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1600,y);ctx.stroke();}
  for(const p of Object.values(state.provinces)){
    poly(p.poly);ctx.globalAlpha=p.controller===myCountry?.86:.72;ctx.fillStyle=mapFill(p);ctx.fill();ctx.globalAlpha=1;ctx.lineWidth=selectedProvince===p.id?3:1.1;ctx.strokeStyle=selectedProvince===p.id?'#f0d98f':'#131713';ctx.stroke();ctx.fillStyle='#f5f0e4';ctx.font=p.terrain==='city'?'700 12px Georgia':'600 9px system-ui';ctx.textAlign='center';ctx.shadowColor='#000';ctx.shadowBlur=4;ctx.fillText(p.name,p.x,p.y);ctx.shadowBlur=0;
  }
  // country labels
  for(const c of Object.values(state.countries)){
    const ps=Object.values(state.provinces).filter(p=>p.controller===c.id);if(!ps.length)continue;const x=ps.reduce((s,p)=>s+p.x,0)/ps.length,y=ps.reduce((s,p)=>s+p.y,0)/ps.length;ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='800 18px Georgia';ctx.shadowColor='#000';ctx.shadowBlur=6;ctx.fillText(c.name,x,y-22);ctx.font='10px system-ui';const player=state.players.find(q=>q.country===c.id);ctx.fillStyle=player?'#f0d278':'#e8e5dbaa';ctx.fillText(player?player.nick:'ИИ',x,y-6);ctx.shadowBlur=0;
  }
  // wars
  for(const w of state.wars){const a=state.countries[w.a],b=state.countries[w.b],pa=avgProvince(w.a),pb=avgProvince(w.b);if(!pa||!pb)continue;ctx.beginPath();ctx.moveTo(pa.x,pa.y);ctx.lineTo(pb.x,pb.y);ctx.setLineDash([10,6]);ctx.strokeStyle='#dc5e57';ctx.lineWidth=4;ctx.stroke();ctx.setLineDash([]);}
  // armies
  for(const c of Object.values(state.countries))for(const u of (c.units||[])){
    const p=state.provinces[u.province];if(!p)continue;ctx.fillStyle=c.color;ctx.beginPath();ctx.roundRect(p.x-16,p.y+12,32,20,4);ctx.fill();ctx.strokeStyle='#141611';ctx.stroke();ctx.fillStyle='#fff';ctx.font='800 9px system-ui';ctx.textAlign='center';ctx.fillText(Math.max(1,Math.round(u.strength*10)),p.x,p.y+26);if(c.id===myCountry){ctx.strokeStyle='#e8cf86';ctx.strokeRect(p.x-19,p.y+9,38,26);}
  }
}
function avgProvince(cid){const ps=Object.values(state.provinces).filter(p=>p.controller===cid);if(!ps.length)return null;return{x:ps.reduce((s,p)=>s+p.x,0)/ps.length,y:ps.reduce((s,p)=>s+p.y,0)/ps.length};}

canvas.addEventListener('click',e=>{if(!state||!joined)return;const q=canvasPoint(e),p=Object.values(state.provinces).find(v=>pointInPoly(q.x,q.y,v.poly));if(!p)return;selectedProvince=p.id;const units=currentCountry()?.units||[];const here=units.find(u=>u.province===p.id);selectedUnit=here?.id||null;if(e.shiftKey&&selectedUnit)send({type:'action',action:'move',unit:selectedUnit,target:p.id});drawMap();});
canvas.addEventListener('contextmenu',e=>{e.preventDefault();if(!state||!joined||!selectedUnit)return;const q=canvasPoint(e),p=Object.values(state.provinces).find(v=>pointInPoly(q.x,q.y,v.poly));if(p)send({type:'action',action:'attack',unit:selectedUnit,target:p.id});});

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tabpanel').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.getElementById('tab-'+b.dataset.tab).classList.add('active');});
document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>{document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));b.classList.add('active');mapMode=b.dataset.mode;drawMap();});
document.querySelectorAll('.produce').forEach(b=>b.onclick=()=>send({type:'action',action:'produce',template:b.dataset.template}));
document.getElementById('buildFactory').onclick=()=>send({type:'action',action:'factory'});
document.getElementById('quickTrade').onclick=()=>send({type:'action',action:'trade',target:document.getElementById('targetSelect').value});
document.getElementById('improve').onclick=()=>send({type:'action',action:'relation',target:document.getElementById('targetSelect').value});
document.getElementById('alliance').onclick=()=>send({type:'action',action:'alliance',target:document.getElementById('targetSelect').value});
document.getElementById('trade').onclick=()=>send({type:'action',action:'trade',target:document.getElementById('targetSelect').value});
document.getElementById('declareWar').onclick=()=>{if(confirm('Объявить войну выбранной стране?'))send({type:'action',action:'war',target:document.getElementById('targetSelect').value});};
document.getElementById('sendSpy').onclick=()=>send({type:'action',action:'spy',target:document.getElementById('spyTarget').value});
['politicalLeft','economyLaw','conscription'].forEach(k=>document.getElementById(k).addEventListener('change',()=>send({type:'action',action:'policy',key:k,value:Number(document.getElementById(k).value)})));
document.getElementById('sendChat').onclick=()=>sendChat();document.getElementById('chatInput').onkeydown=e=>{if(e.key==='Enter')sendChat();};function sendChat(){const input=document.getElementById('chatInput'),t=input.value.trim();if(t){send({type:'chat',text:t});input.value='';}}
document.getElementById('closeEvent').onclick=()=>document.getElementById('eventModal').classList.add('hidden');
document.getElementById('pause').onclick=()=>send({type:'pause',value:!state?.paused});document.querySelectorAll('.map-toolbar button[data-speed]').forEach(b=>b.onclick=()=>send({type:'speed',value:Number(b.dataset.speed)}));

connect();
