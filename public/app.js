
let state=null, socket=null, myId=null, myCountry="aurora", selectedProvince=null, selectedUnit=null, mapMode="political";

const canvas=document.getElementById("map");
const ctx=canvas.getContext("2d");

const terrainColors={
  plains:"#71825d", forest:"#49664b", hills:"#85775b", mountains:"#67655b", swamp:"#5c735f", city:"#8d806c", coast:"#587a88"
};
const weatherNames={clear:"ЯСНО",rain:"ДОЖДЬ",snow:"СНЕГ",storm:"ШТОРМ"};

function wsConnect(){
  const url=(location.protocol==="https:"?"wss://":"ws://")+location.host;
  socket=new WebSocket(url);
  socket.onopen=()=>{net.textContent="● WEBSOCKET ONLINE";net.style.color="#79c886";};
  socket.onclose=()=>{net.textContent="● ПЕРЕПОДКЛЮЧЕНИЕ";net.style.color="#c96b61";setTimeout(wsConnect,1200);};
  socket.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==="joined"){myId=m.id;myCountry=m.country;document.getElementById("login").style.display="none";return;}
    if(m.type==="state"){state=m.state;render();}
    if(m.type==="chat"){appendChat(m);}
    if(m.type==="error"){alert(m.message);}
    if(m.type==="hello"){state=m.state;initLoginFromState(state);render();}
  };
}
function requestStateHandshake(){
  // State will arrive on each broadcast tick; join sends the next state immediately.
}
function send(obj){if(socket?.readyState===1)socket.send(JSON.stringify(obj));}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}
function c(){return state?.countries?.[myCountry]||null;}
function appendChat(m){
  const box=document.getElementById("chat");
  box.innerHTML += `<div class="msg"><b>${esc(m.from)}:</b> ${esc(m.text)}</div>`;
  box.scrollTop=box.scrollHeight;
}
function render(){
  if(!state)return;
  const country=c()||state.countries.aurora;
  document.getElementById("date").textContent=`${state.year}.${String(state.month).padStart(2,"0")}.${String(state.day).padStart(2,"0")} • ХОД ${state.turn}`;
  document.getElementById("weather").textContent=weatherNames[state.weather]||state.weather;
  document.getElementById("money").textContent=Math.floor(country.money);
  document.getElementById("ic").textContent=Math.floor(country.baseIc*country.icEff);
  document.getElementById("metal").textContent=Math.floor(country.metal);
  document.getElementById("oil").textContent=Math.floor(country.oil);
  document.getElementById("mp").textContent=Math.floor(country.manpower);
  document.getElementById("online").textContent=state.players.length;
  document.getElementById("playersCount").textContent=state.players.length;
  document.getElementById("countryName").textContent=country.name;
  document.getElementById("countryOwner").textContent=`${country.ideology} • ${state.players.find(p=>p.country===country.id)?.nick||"🤖 ИИ"}`;
  document.getElementById("crest").style.background=country.color;
  document.getElementById("ovIc").textContent=Math.floor(country.baseIc*country.icEff);
  document.getElementById("ovStab").textContent=Math.floor(country.stability)+"%";
  document.getElementById("ovMp").textContent=Math.floor(country.manpower);
  document.getElementById("ovWs").textContent=Math.floor(country.warSupport)+"%";
  document.getElementById("ovTc").textContent=Math.floor(country.tc);
  document.getElementById("ovPp").textContent=Math.floor(country.politicalPoints);
  renderPlayers();
  renderArmy(country);
  renderProduction(country);
  renderResearch(country);
  renderDiplo(country);
  renderPolitics(country);
  renderIntel(country);
  renderStats();
  renderLog();
  drawMap();
}

function renderPlayers(){
  playersList.innerHTML=state.players.map(p=>{
    const cc=state.countries[p.country];
    return `<div class="player"><div class="avatar" style="background:${cc.color}">${esc(p.nick.slice(0,2).toUpperCase())}</div><b>${esc(p.nick)}</b><small>${esc(cc.name)}</small></div>`;
  }).join("");
}
function renderArmy(country){
  const units=state.units[country.id]||[];
  armyList.innerHTML=units.map(u=>{
    const t=state.countries[country.id] ? u.type : "infantry";
    return `<div class="listrow" data-unit="${u.id}">
      <b>${esc(u.name)}</b> <small>• ${esc(t)} • ${esc(u.commander)}</small>
      <div><small>Провинция: ${esc(state.provinces[u.province]?.name||u.province)} • Организация ${Math.round(u.org)}%</small></div>
      <div class="progress"><i style="width:${Math.min(100,u.org)}%"></i></div>
    </div>`;
  }).join("") || `<div class="listrow">Армий нет.</div>`;
}
function renderProduction(country){
  productionList.innerHTML=country.production.map(q=>{
    const pct=Math.max(0,Math.min(100,100*(1-q.remaining/q.total)));
    return `<div class="listrow"><b>${esc(labelFor(q.type))}</b><small>${Math.round(pct)}%</small><div class="progress"><i style="width:${pct}%"></i></div></div>`;
  }).join("") || `<div class="listrow">Очередь свободна.</div>`;
}
function renderResearch(country){
  researchList.innerHTML=state.techDefs.map(t=>{
    const researched=country.researched.includes(t.id);
    const active=country.researchSlots.includes(t.id);
    const slot=country.researchSlots.indexOf(t.id);
    return `<div class="listrow">
      <b>${esc(t.name)}</b> <small>${researched?"✓ ИССЛЕДОВАНО":active?`СЛОТ ${slot+1}`:"ДОСТУПНО"}</small>
      <div><small>Стоимость: ${t.cost} • ${esc(t.group)}</small></div>
      ${!researched&&!active?`<button class="bigbutton start-tech" data-tech="${t.id}">Исследовать</button>`:""}
    </div>`;
  }).join("");
  document.querySelectorAll(".start-tech").forEach(btn=>btn.onclick=()=>startTech(btn.dataset.tech));
}
function renderDiplo(country){
  const others=Object.values(state.countries).filter(x=>x.id!==country.id);
  targetCountry.innerHTML=others.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("");
  spyTarget.innerHTML=others.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("");
  relations.innerHTML=others.map(x=>{
    const r=country.relations?.[x.id]||0;
    return `<div><span>${esc(x.name)}</span><b>${Math.round(r)}</b></div>`;
  }).join("");
}
function renderPolitics(country){
  politicalLeft.value=country.politicalLeft; economyLaw.value=country.economyLaw; conscription.value=country.conscription;
  politicalLeftV.textContent=Math.round(country.politicalLeft);
  economyLawV.textContent=Math.round(country.economyLaw);
  conscriptionV.textContent=Math.round(country.conscription);
  ministers.innerHTML=country.ministers.map(x=>`<span class="chip">${esc(x)}</span>`).join("");
}
function renderIntel(country){
  spyDomestic.textContent=country.spies.domestic;
  spyForeign.textContent=country.spies.foreign;
  spyList.innerHTML=Object.entries(country.spyNetworks||{}).map(([id,v])=>`<div class="listrow"><b>${esc(state.countries[id]?.name||id)}</b><small>Сеть ${Math.round(v)}%</small><div class="progress"><i style="width:${Math.min(100,v)}%"></i></div></div>`).join("");
}
function renderStats(){
  const rows=Object.values(state.countries).sort((a,b)=>(b.baseIc*b.icEff)-(a.baseIc*a.icEff));
  worldStats.innerHTML=`<div class="table-row head"><span>#</span><span>Страна</span><span>IC</span><span>Люди</span></div>`+
    rows.map((x,i)=>`<div class="table-row"><span>${i+1}</span><span>${esc(x.name)}</span><span>${Math.floor(x.baseIc*x.icEff)}</span><span>${Math.floor(x.manpower)}</span></div>`).join("");
}
function renderLog(){
  log.innerHTML=state.log.map(x=>`<div class="event">${esc(x)}</div>`).join("");
  wars.innerHTML=state.wars.map(w=>`<div>${esc(state.countries[w.a].name)} ⚔ ${esc(state.countries[w.b].name)}</div>`).join("")||"<div>Активных войн нет.</div>";
  events.innerHTML=(state.events||[]).slice(-10).reverse().map(x=>`<div class="event">${esc(x)}</div>`).join("");
  alerts.innerHTML=state.wars.length?`<div class="event">⚔ Активных войн: <b>${state.wars.length}</b></div>`:`<div class="event">Мирная обстановка.</div>`;
}
function labelFor(t){return ({infantry:"Пехотная дивизия",motorized:"Моторизованная дивизия",armor:"Бронетанковая дивизия",mountain:"Горная дивизия",garrison:"Гарнизон"})[t]||t;}

function drawMap(){
  if(!state)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const bg=ctx.createLinearGradient(0,0,0,690);bg.addColorStop(0,"#3e4939");bg.addColorStop(1,"#202820");
  ctx.fillStyle=bg;ctx.fillRect(0,0,900,690);
  ctx.strokeStyle="#ffffff08";ctx.lineWidth=1;
  for(let x=0;x<900;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,690);ctx.stroke();}
  for(let y=0;y<690;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(900,y);ctx.stroke();}

  for(const p of Object.values(state.provinces)){
    polygon(p.poly);
    let fill=state.countries[p.controller]?.color||"#666";
    let alpha=.72;
    if(mapMode==="industry"){const v=state.countries[p.controller]?.baseIc||0;fill=v>50?"#ca5f58":v>40?"#b69f61":"#69856b";}
    if(mapMode==="supply"){fill=p.controller===myCountry?"#5c9e6c":"#6d4e4e";alpha=.68;}
    if(mapMode==="terrain"){fill=terrainColors[p.terrain]||"#777";}
    if(mapMode==="weather"){fill=weatherColor(state.weather);alpha=.63;}
    ctx.fillStyle=fill;ctx.globalAlpha=alpha;ctx.fill();ctx.globalAlpha=1;
    ctx.lineWidth=(selectedProvince===p.id?3:1.2);
    ctx.strokeStyle=selectedProvince===p.id?"#f1d98f":"#1a1d18";ctx.stroke();
    ctx.textAlign="center";ctx.shadowColor="#000";ctx.shadowBlur=4;
    ctx.fillStyle="#f6f2e6";ctx.font="700 11px Georgia";ctx.fillText(p.name,p.x,p.y-3);
    ctx.font="8px system-ui";ctx.fillStyle="#e6e0cebb";ctx.fillText(p.terrain,p.x,p.y+10);ctx.shadowBlur=0;
  }

  // war lines
  for(const w of state.wars){
    const a=centerOfCountry(w.a), b=centerOfCountry(w.b);
    if(a&&b){
      ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);
      ctx.setLineDash([8,5]);ctx.strokeStyle="#d7655e";ctx.lineWidth=3;ctx.stroke();ctx.setLineDash([]);
    }
  }

  // units
  for(const [cid,units] of Object.entries(state.units)){
    for(const u of units){
      const p=state.provinces[u.province]; if(!p)continue;
      const col=state.countries[cid].color;
      ctx.fillStyle=col;ctx.beginPath();ctx.roundRect(p.x+18,p.y+18,24,18,3);ctx.fill();
      ctx.strokeStyle="#111";ctx.stroke();
      ctx.fillStyle="#fff";ctx.font="800 8px system-ui";ctx.textAlign="center";ctx.fillText(u.strength>0.7?Math.max(1,Math.round(u.strength*10)):"−",p.x+30,p.y+30);
      if(cid===myCountry){ctx.strokeStyle="#e9cf87";ctx.lineWidth=1;ctx.strokeRect(p.x+15,p.y+15,30,24);}
    }
  }
}
function polygon(poly){ctx.beginPath();ctx.moveTo(poly[0][0],poly[0][1]);for(let i=1;i<poly.length;i++)ctx.lineTo(poly[i][0],poly[i][1]);ctx.closePath();}
function centerOfCountry(cid){
  const ps=Object.values(state.provinces).filter(p=>p.controller===cid); if(!ps.length)return null;
  return [ps.reduce((s,p)=>s+p.x,0)/ps.length, ps.reduce((s,p)=>s+p.y,0)/ps.length];
}
function weatherColor(w){return ({clear:"#7d8a71",rain:"#58717e",snow:"#b7c4c8",storm:"#5c5360"})[w]||"#777";}

canvas.addEventListener("click",e=>{
  if(!state)return;
  const pt=canvasPoint(e);
  const province=Object.values(state.provinces).find(p=>pointInPoly(pt.x,pt.y,p.poly));
  if(!province)return;
  selectedProvince=province.id;
  const units=state.units[myCountry]||[];
  selectedUnit=units.find(u=>u.province===province.id)?.id||null;
  if(e.shiftKey && selectedUnit){
    const target=province.id;
    send({type:"action",action:"move",unit:selectedUnit,target});
  }
  drawMap();
});
canvas.addEventListener("contextmenu",e=>{
  e.preventDefault();
  if(!state)return;
  const pt=canvasPoint(e);
  const province=Object.values(state.provinces).find(p=>pointInPoly(pt.x,pt.y,p.poly));
  if(!province)return;
  const units=(state.units[myCountry]||[]).filter(u=>u.province===selectedProvince);
  if(units.length){
    send({type:"action",action:"attack",unit:units[0].id,target:province.id});
  }
});
function canvasPoint(e){
  const r=canvas.getBoundingClientRect();
  return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};
}
function pointInPoly(x,y,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
    const ok=((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi);
    if(ok)inside=!inside;
  }
  return inside;
}

function initUI(){
  document.querySelectorAll(".tab").forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".tabpanel").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-"+btn.dataset.tab).classList.add("active");
  });
  document.querySelectorAll(".mode").forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll(".mode").forEach(x=>x.classList.remove("active"));btn.classList.add("active");mapMode=btn.dataset.mode;drawMap();
  });
  document.querySelectorAll(".produce").forEach(btn=>btn.onclick=()=>send({type:"action",action:"division",template:btn.dataset.template}));
  buildFactory.onclick=()=>send({type:"action",action:"factory"});
  tradeQuick.onclick=()=>send({type:"action",action:"trade",target:targetCountry.value});
  improveRelation.onclick=()=>send({type:"action",action:"relation",target:targetCountry.value});
  makeAlliance.onclick=()=>send({type:"action",action:"alliance",target:targetCountry.value});
  declareWar.onclick=()=>{if(confirm("Объявить войну?"))send({type:"action",action:"war",target:targetCountry.value});};
  trade.onclick=()=>send({type:"action",action:"trade",target:targetCountry.value});
  spyButton.onclick=()=>send({type:"action",action:"spy",target:spyTarget.value});
  send.onclick=()=>sendChat();
  chatInput.onkeydown=e=>{if(e.key==="Enter")sendChat();}
  function sendChat(){const text=chatInput.value.trim();if(text){send({type:"chat",channel:"world",text});chatInput.value="";}}
  [politicalLeft,economyLaw,conscription].forEach(el=>el.addEventListener("change",()=>send({type:"action",action:"slider",key:el.id,value:Number(el.value)})));
  pause.onclick=()=>send({type:"set_pause",value:!state?.paused});
  speed1.onclick=()=>send({type:"set_speed",value:1});
  speed2.onclick=()=>send({type:"set_speed",value:2});
  speed4.onclick=()=>send({type:"set_speed",value:4});
}
join.onclick=()=>{
  const nickValue=nick.value.trim()||"Игрок";
  send({type:"join",nick:nickValue,country:country.value});
};
function initLoginFromState(st){
  if(!st)return;
  country.innerHTML=Object.values(st.countries).map(c=>`<option value="${c.id}">${esc(c.name)}${c.ai?" — ИИ":""}</option>`).join("");
}
function startTech(id){
  const c0=c(); if(!c0)return;
  const slot=c0.researchSlots.findIndex(x=>!x);
  if(slot<0){alert("Все исследовательские слоты заняты.");return;}
  send({type:"action",action:"research_start",tech:id,slot});
}

initUI();
wsConnect();

// Ask server for a view by using a temporary anonymous connection snapshot.
// Joining is still required to interact.
setTimeout(()=>{
  if(!state){
    // The server broadcasts on tick; once received, login gets its country list.
  }
},800);

// Patch render hook to keep login country list usable after first snapshot.
const _oldRender=render;
render=function(){
  if(!state)return;
  initLoginFromState(state);
  _oldRender();
};
