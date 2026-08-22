const urlParams=new URLSearchParams(location.search);const roomId=urlParams.get("room");
const token=localStorage.getItem("ironEraToken");let ws,state=null,myId=null,myCountry=null,selectedProv=null,selectedUnit=null,mapMode="political";
const canvas=document.getElementById("map"),ctx=canvas.getContext("2d");
function send(o){if(ws?.readyState===1)ws.send(JSON.stringify(o))}
function connect(){
 if(!token){location.href="/";return}
 ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host);
 ws.onopen=()=>{net.textContent="● WEBSOCKET ONLINE";ws.send(JSON.stringify({type:"auth",token}));};
 ws.onclose=()=>{net.textContent="● RECONNECTING";setTimeout(connect,1200)};
 ws.onmessage=e=>{
   const m=JSON.parse(e.data);
   if(m.type==="auth_ok"){send({type:"join_room",roomId});}
   if(m.type==="need_country"){openCountryModal();}
   if(m.type==="room_state"){state=m.room;render();}
   if(m.type==="chat"){chat.innerHTML+=`<div class="msg"><b>${esc(m.from)}:</b> ${esc(m.text)}</div>`;chat.scrollTop=chat.scrollHeight}
   if(m.type==="error"){alert(m.message)}
 };
}
function openCountryModal(){
 if(!state){return setTimeout(openCountryModal,300)}
 const sel=document.getElementById("countryModalSelect");
 sel.innerHTML=Object.values(state.countries).map(c=>{
   const busy=state.players.some(p=>p.country===c.id);
   return `<option value="${c.id}" ${busy?"disabled":""}>${esc(c.name)}${busy?" — занята":" — свободна"}</option>`;
 }).join("");
 countryModal.classList.remove("hidden");
}
confirmCountry.onclick=()=>{const cid=countryModalSelect.value;if(!cid)return;send({type:"choose_country",country:cid});countryModal.classList.add("hidden");}
chooseCountry.onclick=openCountryModal;
countrySelect.onchange=()=>{};
factory.onclick=()=>send({type:"action",action:"build_factory"});
division.onclick=()=>send({type:"action",action:"add_division",template:"infantry"});
war.onclick=()=>{const target=targetCountry();if(target)send({type:"action",action:"declare_war",target})};
alliance.onclick=()=>{const target=targetCountry();if(target)send({type:"action",action:"alliance",target})};
relation.onclick=()=>{const target=targetCountry();if(target)send({type:"action",action:"relation",target})};
ready.onclick=()=>send({type:"set_ready",value:true});
start.onclick=()=>send({type:"start_room"});
function targetCountry(){const me=state.countries[myCountry];return Object.values(state.countries).find(c=>c.id!==me?.id)?.id}
send.onclick=()=>{const t=chatInput.value.trim();if(t){send({type:"action",action:"chat",text:t});chatInput.value=""}};
chatInput.onkeydown=e=>{if(e.key==="Enter")send.click()};
document.querySelectorAll(".game-tabs button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".game-tabs button").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".tabbody").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.getElementById("tab-"+b.textContent.toLowerCase().replace(" ","")).classList.add("active")});
document.querySelectorAll(".map-actions button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".map-actions button").forEach(x=>x.classList.remove("active"));b.classList.add("active");mapMode=b.dataset.mode;draw()});

function render(){
 const player=state.players.find(p=>p.id===myId);
 if(!player)return;
 myCountry=player.country;
 roomTitle.textContent=state.name;date.textContent=`${state.year}.${String(state.month).padStart(2,"0")}.${String(state.day).padStart(2,"0")}`;online.textContent=state.players.length;
 countrySelect.innerHTML=Object.values(state.countries).map(c=>`<option value="${c.id}" ${c.id===myCountry?"selected":""}>${esc(c.name)}</option>`).join("");
 const c=state.countries[myCountry];
 stats.innerHTML=[["Промышленность",c.ic],["Людские ресурсы",c.manpower],["Металл",c.metal],["Нефть",c.oil],["Стабильность",Math.round(c.stability)+"%"],["Военная поддержка",Math.round(c.warSupport)+"%"],["Полит. очки",Math.round(c.politicalPoints)],["TC",c.tc]].map(x=>`<div class="stat"><small>${x[0]}</small><b>${x[1]}</b></div>`).join("");
 events.innerHTML=(state.events||[]).slice(-8).reverse().map(e=>`<div class="event"><b>${esc(e.title)}</b><br>${esc(e.text)}</div>`).join("");
 army.innerHTML=(c.units||[]).map(u=>`<div class="listrow" data-unit="${u.id}"><b>${esc(u.name)}</b><small>${esc(state.provinces[u.province]?.name||u.province)} • ${esc(u.commander)}</small><div class="progress"><i style="width:${Math.min(100,u.org)}%"></i></div></div>`).join("");
 production.innerHTML=(c.production||[]).map(p=>`<div class="listrow"><b>${esc(p.type)}</b><small>${Math.max(0,Math.round(100*(1-p.remaining/p.total)))}%</small><div class="progress"><i style="width:${Math.min(100,100*(1-p.remaining/p.total))}%"></i></div></div>`).join("");
 tech.innerHTML=state.techs.map(t=>`<div class="listrow"><b>${esc(t.name)}</b><small>${c.researched.includes(t.id)?"✓ ИССЛЕДОВАНО":c.researchSlots.includes(t.id)?"В РАБОТЕ":"Доступно"} • ${t.cost} очков</small>${!c.researched.includes(t.id)&&!c.researchSlots.includes(t.id)?`<button class="research" data-tech="${t.id}">Исследовать</button>`:""}</div>`).join("");
 document.querySelectorAll(".research").forEach(b=>b.onclick=()=>{const slot=c.researchSlots.findIndex(x=>!x);if(slot>=0)send({type:"action",action:"research",tech:b.dataset.tech,slot});else alert("Нет свободного исследовательского слота.")});
 diplo.innerHTML=Object.values(state.countries).filter(x=>x.id!==c.id).map(x=>`<div class="listrow"><b>${esc(x.name)}</b><small>Отношения: ${c.relations?.[x.id]||0}</small></div>`).join("");
 players.innerHTML=state.players.map(p=>`<div class="player"><div class="avatar">${esc(p.nick.slice(0,2).toUpperCase())}</div><b>${esc(p.nick)}</b><small>${esc(state.countries[p.country].name)} ${p.ready?"✓":""}</small></div>`).join("");
 log.innerHTML=state.log.map(x=>`<div class="event">${esc(x)}</div>`).join("");
 wars.innerHTML=state.wars.map(w=>`<div class="war">${esc(state.countries[w.a].name)} ⚔ ${esc(state.countries[w.b].name)}</div>`).join("")||"<div>Нет активных войн.</div>";
 start.style.display=state.host===player.nick?"block":"none";
 draw();
}
function draw(){
 ctx.clearRect(0,0,1000,720);
 const g=ctx.createLinearGradient(0,0,0,720);g.addColorStop(0,"#3f4a3d");g.addColorStop(1,"#202920");ctx.fillStyle=g;ctx.fillRect(0,0,1000,720);
 for(let x=0;x<1000;x+=60){ctx.strokeStyle="#fff1";ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,720);ctx.stroke()}
 for(let y=0;y<720;y+=60){ctx.strokeStyle="#fff1";ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1000,y);ctx.stroke()}
 for(const p of Object.values(state.provinces)){
   const owner=state.countries[p.controller];let fill=owner.color;
   if(mapMode==="industry")fill=p.industry>6?"#c98f4c":"#617b60";
   if(mapMode==="terrain")fill=({plains:"#738361",forest:"#4f6b4d",hills:"#817258",mountains:"#5d625f",city:"#8e826c"})[p.terrain]||"#6b7664";
   polygon(p.poly);ctx.globalAlpha=.76;ctx.fillStyle=fill;ctx.fill();ctx.globalAlpha=1;ctx.lineWidth=selectedProv===p.id?3:1;ctx.strokeStyle=selectedProv===p.id?"#f2d985":"#171a16";ctx.stroke();
   ctx.textAlign="center";ctx.fillStyle="#fff";ctx.font="700 10px Georgia";ctx.fillText(p.name,p.x,p.y-2);ctx.font="8px system-ui";ctx.fillStyle="#eae4d4aa";ctx.fillText(p.terrain,p.x,p.y+10);
 }
 for(const [cid,c] of Object.entries(state.countries)){
   const units=c.units||[];for(const u of units){const p=state.provinces[u.province];if(!p)continue;ctx.fillStyle=c.color;ctx.beginPath();ctx.arc(p.x+20,p.y+20,10,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#111";ctx.stroke();ctx.fillStyle="#fff";ctx.font="800 8px system-ui";ctx.fillText(Math.max(1,Math.round(u.strength)),p.x+20,p.y+23);}
 }
}
function polygon(poly){ctx.beginPath();ctx.moveTo(poly[0][0],poly[0][1]);for(let i=1;i<poly.length;i++)ctx.lineTo(poly[i][0],poly[i][1]);ctx.closePath()}
canvas.onclick=e=>{const pt=point(e);selectedProv=Object.values(state.provinces).find(p=>inside(pt.x,pt.y,p.poly))?.id||null;selectedUnit=(state.units?.[myCountry]||[]).find(u=>u.province===selectedProv)?.id||null;draw()};
canvas.oncontextmenu=e=>{e.preventDefault();if(!selectedProv||!selectedUnit)return;send({type:"action",action:"attack",unit:selectedUnit,target:selectedProv})};
function point(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}}
function inside(x,y,poly){let k=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];const hit=((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi);if(hit)k=!k}return k}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
connect();
