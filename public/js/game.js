const params=new URLSearchParams(location.search);
const roomId=(params.get('room')||'').toUpperCase();
const token=localStorage.getItem('ironEraToken');
let ws=null,state=null,myId=null,myCountry=null,myNick='',selectedProv=null,selectedUnit=null,mapMode='political',reconnectTimer=null;
const canvas=document.getElementById('map');const ctx=canvas.getContext('2d');
if(!token||!roomId)location.href='/lobby';
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function send(o){if(ws?.readyState===1)ws.send(JSON.stringify(o));}
function connect(){
  if(window.__leavingIronEra)return;
  const proto=location.protocol==='https:'?'wss:':'ws:';
  ws=new WebSocket(`${proto}//${location.host}`);
  ws.onopen=()=>{net.textContent='● WEBSOCKET ONLINE';net.style.color='#78c986';clearTimeout(reconnectTimer);send({type:'auth',token});};
  ws.onclose=()=>{net.textContent='● RECONNECTING';net.style.color='#c86d64';if(!window.__leavingIronEra)reconnectTimer=setTimeout(connect,1200);};
  ws.onerror=()=>{};
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==='auth_ok')send({type:myId?'rejoin_room':'join_room',roomId,id:myId,nick:myNick,country:myCountry});
    if(m.type==='room_state'){state=m.room;renderShell();if(!myId||!state.players.some(p=>p.id===myId))openCountryModal();render();}
    if(m.type==='choose_country_required')openCountryModal();
    if(m.type==='joined'){myId=m.id;myCountry=m.country;state=m.state||state;document.getElementById('connectOverlay').style.display='none';if(state)render();}
    if(m.type==='chat'){chat.innerHTML+=`<div class="msg"><b>${esc(m.from)}:</b> ${esc(m.text)}</div>`;chat.scrollTop=chat.scrollHeight;}
    if(m.type==='error'){alert(m.message);if(/сессия|авториз/i.test(m.message))location.href='/';}
  };
}
function renderShell(){connectOverlay.style.display='none';roomTitle.textContent=state.name;online.textContent=state.players.length;date.textContent=`${state.year}.${String(state.month).padStart(2,'0')}.${String(state.day).padStart(2,'0')}`;}
function openCountryModal(){
  if(!state)return;
  const sel=countryModalSelect;const me=state.players.find(p=>p.id===myId);
  if(me){countryModal.classList.add('hidden');return;}
  sel.innerHTML=Object.values(state.countries).map(c=>{const busy=state.players.some(p=>p.country===c.id);return `<option value="${c.id}" ${busy?'disabled':''}>${esc(c.name)}${busy?' — занята':' — свободна'}</option>`;}).join('');
  countryModal.classList.remove('hidden');
}
confirmCountry.onclick=()=>{const cid=countryModalSelect.value;if(!cid)return;send({type:'choose_country',country:cid});};
chooseCountry.onclick=openCountryModal;
ready.onclick=()=>send({type:'ready',value:true});
start.onclick=()=>send({type:'start'});
factory.onclick=()=>send({type:'action',action:'build_factory'});
division.onclick=()=>send({type:'action',action:'add_division',template:'infantry'});
war.onclick=()=>send({type:'action',action:'declare_war',target:diploTarget.value});
alliance.onclick=()=>send({type:'action',action:'alliance',target:diploTarget.value});
relation.onclick=()=>send({type:'action',action:'relation',target:diploTarget.value});
send.onclick=()=>{const t=chatInput.value.trim();if(t){send({type:'chat',text:t});chatInput.value='';}};
chatInput.onkeydown=e=>{if(e.key==='Enter')send.click();};
document.querySelectorAll('.game-tabs [data-tab]').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.game-tabs [data-tab]').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tabbody').forEach(x=>x.classList.remove('active'));btn.classList.add('active');document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');});
document.querySelectorAll('.map-actions [data-mode]').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.map-actions [data-mode]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');mapMode=btn.dataset.mode;draw();});

function render(){
  if(!state)return;renderShell();
  const me=state.players.find(p=>p.id===myId);if(!me)return;
  myCountry=me.country;myNick=me.nick;
  const c=state.countries[myCountry]; if(!c)return;
  countrySelect.innerHTML=Object.values(state.countries).map(x=>`<option value="${x.id}" ${x.id===myCountry?'selected':''}>${esc(x.name)}</option>`).join('');
  const countries=Object.values(state.countries).filter(x=>x.id!==myCountry);diploTarget.innerHTML=countries.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  stats.innerHTML=[['Промышленность',c.ic],['Людские ресурсы',c.manpower],['Металл',c.metal],['Нефть',c.oil],['Стабильность',Math.round(c.stability)+'%'],['Военная поддержка',Math.round(c.warSupport)+'%'],['Полит. очки',Math.round(c.politicalPoints)],['TC',c.tc]].map(([a,b])=>`<div class="stat"><small>${a}</small><b>${b}</b></div>`).join('');
  events.innerHTML=c.activeEvent?`<div class="event event-card"><b>${esc(c.activeEvent.title)}</b><p>${esc(c.activeEvent.text)}</p>${c.activeEvent.choices.map((ch,i)=>`<button class="event-choice" data-choice="${i}">${esc(ch.text)}</button>`).join('')}</div>`:'<div class="empty">Активных национальных событий нет.</div>';
  document.querySelectorAll('.event-choice').forEach(b=>b.onclick=()=>send({type:'action',action:'event_choice',choice:Number(b.dataset.choice)}));
  army.innerHTML=c.units.map(u=>`<div class="listrow unit-row ${selectedUnit===u.id?'selected':''}" data-unit="${u.id}"><b>${esc(u.name)}</b><small>${esc(state.provinces[u.province]?.name||u.province)} • ${esc(u.commander)} • ${Math.round(u.org)}% орг.</small><div class="progress"><i style="width:${Math.max(0,Math.min(100,u.org))}%"></i></div></div>`).join('');
  document.querySelectorAll('.unit-row').forEach(row=>row.onclick=()=>{selectedUnit=row.dataset.unit;draw();});
  production.innerHTML=c.production.map(p=>`<div class="listrow"><b>${esc(p.type)}</b><small>${Math.round((1-p.remaining/p.total)*100)}%</small><div class="progress"><i style="width:${Math.max(0,Math.min(100,(1-p.remaining/p.total)*100))}%"></i></div></div>`).join('')||'<div class="empty">Очередь пуста.</div>';
  tech.innerHTML=state.techs.map(t=>`<div class="listrow"><b>${esc(t.name)}</b><small>${esc(t.group)} • ${c.researched.includes(t.id)?'✓ изучено':c.researchSlots.includes(t.id)?'в работе':t.cost+' очков'}</small>${!c.researched.includes(t.id)&&!c.researchSlots.includes(t.id)?`<button class="research-btn" data-tech="${t.id}">Исследовать</button>`:''}</div>`).join('');
  document.querySelectorAll('.research-btn').forEach(b=>b.onclick=()=>{const slot=c.researchSlots.findIndex(x=>!x);if(slot<0)return alert('Нет свободного слота.');send({type:'action',action:'research',tech:b.dataset.tech,slot});});
  diplo.innerHTML=countries.map(x=>`<div class="listrow"><b>${esc(x.name)}</b><small>Отношения: ${c.relations?.[x.id]||0}</small></div>`).join('');
  players.innerHTML=state.players.map(p=>`<div class="player"><div class="avatar">${esc(p.nick.slice(0,2).toUpperCase())}</div><b>${esc(p.nick)}</b><small>${esc(state.countries[p.country].name)} ${p.ready?'✓':''}</small></div>`).join('');
  log.innerHTML=state.log.map(x=>`<div class="event">${esc(x)}</div>`).join('');
  wars.innerHTML=state.wars.map(w=>`<div class="war">${esc(state.countries[w.a].name)} ⚔ ${esc(state.countries[w.b].name)}</div>`).join('')||'<div class="empty">Нет активных войн.</div>';
  const isHost=state.host===me.nick;start.style.display=isHost?'block':'none';ready.disabled=me.ready||state.status==='running';ready.textContent=me.ready?'ГОТОВ ✓':'ГОТОВ';
  document.getElementById('countryModal').classList.toggle('hidden',!!me);
  draw();
}
function draw(){
  if(!state)return;ctx.clearRect(0,0,1000,720);
  const g=ctx.createLinearGradient(0,0,0,720);g.addColorStop(0,'#3f4c40');g.addColorStop(1,'#1b231c');ctx.fillStyle=g;ctx.fillRect(0,0,1000,720);
  for(let x=0;x<1000;x+=60){ctx.strokeStyle='#ffffff09';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,720);ctx.stroke();}
  for(let y=0;y<720;y+=60){ctx.strokeStyle='#ffffff09';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1000,y);ctx.stroke();}
  for(const p of Object.values(state.provinces)){
    const owner=state.countries[p.controller];if(!owner)continue;let fill=owner.color;
    if(mapMode==='industry')fill=p.industry>=7?'#c9964e':p.industry>=6?'#9b9156':'#5f7b64';
    if(mapMode==='terrain')fill=({plains:'#71805e',forest:'#4d684c',hills:'#847359',mountains:'#5d645e',city:'#8d806d'})[p.terrain]||'#6d7868';
    polygon(p.poly);ctx.globalAlpha=.78;ctx.fillStyle=fill;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=p.id===selectedProv?'#f2d88b':'#151914';ctx.lineWidth=p.id===selectedProv?3:1.2;ctx.stroke();
    ctx.textAlign='center';ctx.fillStyle='#f2ede1';ctx.font='700 10px Georgia';ctx.fillText(p.name,p.x,p.y-3);ctx.fillStyle='#d8d2c4aa';ctx.font='8px system-ui';ctx.fillText(p.terrain,p.x,p.y+10);
  }
  for(const w of state.wars){const a=countryCenter(w.a),b=countryCenter(w.b);if(a&&b){ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.setLineDash([8,5]);ctx.strokeStyle='#d6655c';ctx.lineWidth=3;ctx.stroke();ctx.setLineDash([]);}}
  for(const [cid,c] of Object.entries(state.countries))for(const u of c.units){const p=state.provinces[u.province];if(!p)continue;ctx.fillStyle=c.color;ctx.beginPath();ctx.arc(p.x+25,p.y+20,10,0,Math.PI*2);ctx.fill();ctx.strokeStyle=selectedUnit===u.id?'#fff0a9':'#151515';ctx.lineWidth=selectedUnit===u.id?3:1;ctx.stroke();ctx.fillStyle='#fff';ctx.font='800 8px system-ui';ctx.textAlign='center';ctx.fillText(Math.max(1,Math.round(u.strength)),p.x+25,p.y+23);if(cid===myCountry){ctx.fillStyle='#fff8';ctx.fillRect(p.x+10,p.y+38,30,3);ctx.fillStyle='#d9bd72';ctx.fillRect(p.x+10,p.y+38,30*(u.org/100),3);}}
}
function polygon(poly){ctx.beginPath();ctx.moveTo(poly[0][0],poly[0][1]);for(let i=1;i<poly.length;i++)ctx.lineTo(poly[i][0],poly[i][1]);ctx.closePath();}
function point(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};}
function inside(x,y,p){let ins=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const xi=p[i][0],yi=p[i][1],xj=p[j][0],yj=p[j][1];const hit=((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi);if(hit)ins=!ins;}return ins;}
function countryCenter(id){const ps=Object.values(state.provinces).filter(p=>p.controller===id);if(!ps.length)return null;return[ps.reduce((s,p)=>s+p.x,0)/ps.length,ps.reduce((s,p)=>s+p.y,0)/ps.length];}
canvas.onclick=e=>{if(!state)return;const pt=point(e);const p=Object.values(state.provinces).find(p=>inside(pt.x,pt.y,p.poly));if(!p)return;selectedProv=p.id;const c=state.countries[myCountry];const u=c?.units.find(u=>u.province===p.id);if(u)selectedUnit=u.id;if(e.shiftKey&&selectedUnit)send({type:'action',action:'move',unit:selectedUnit,target:p.id});draw();};
canvas.oncontextmenu=e=>{e.preventDefault();if(!selectedProv||!selectedUnit)return;send({type:'action',action:'attack',unit:selectedUnit,target:selectedProv});};
window.addEventListener('beforeunload',()=>window.__leavingIronEra=true);
connect();
