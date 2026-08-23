const params=new URLSearchParams(location.search);
const roomId=(params.get('room')||'').toUpperCase();
const token=localStorage.getItem('ironEraToken');
let ws=null,state=null,myId=null,myCountry=null,myNick='',selectedProv=null,selectedUnit=null,mapMode='political',reconnectTimer=null,selectedBuild=null,hoveredProv=null;
const canvas=document.getElementById('map');const ctx=canvas.getContext('2d');
if(!token||!roomId)location.href='/lobby';
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function toast(message,type='info',title){
  let stack=document.querySelector('.toast-stack');
  if(!stack){stack=document.createElement('div');stack.className='toast-stack';document.body.appendChild(stack);}
  const t=document.createElement('div');t.className=`toast ${type}`;
  t.innerHTML=`${title?`<b>${esc(title)}</b>`:''}${esc(message)}`;
  stack.appendChild(t);
  setTimeout(()=>{t.style.transition='opacity .3s ease, transform .3s ease';t.style.opacity='0';t.style.transform='translateX(24px)';setTimeout(()=>t.remove(),320);},4200);
}
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
    if(m.type==='room_deleted'){toast(m.message||'Комната удалена.','error');window.__leavingIronEra=true;setTimeout(()=>location.href='/lobby',900);}
    if(m.type==='error'){toast(m.message,'error');if(/сессия|авториз/i.test(m.message))setTimeout(()=>location.href='/',900);}
  };
}
function renderShell(){connectOverlay.style.display='none';roomTitle.textContent=`${state.name||'CAMPAIGN'} • ${state.scenario||'1936'}`;online.textContent=state.players.length;date.textContent=`${state.year}.${String(state.month).padStart(2,'0')}.${String(state.day).padStart(2,'0')}`;}

function rebuildCountryChooser(){
  if(!state)return;
  const modal=document.getElementById('countryModal');
  const sel=document.getElementById('countryModalSelect');
  const wrap=document.getElementById('countryCards');
  if(!sel||!wrap)return;
  wrap.innerHTML=Object.values(state.countries).map(c=>{
    const busy=state.players.some(p=>p.country===c.id);
    return `<button class="country-card ${busy?'busy':''}" data-country="${c.id}" ${busy?'disabled':''}>
      <span class="swatch" style="background:${c.color}"></span>
      <span class="country-card-main"><b>${esc(c.name)}</b><small>${busy?'ЗАНЯТА':(c.ai?'ИИ':'СВОБОДНА')} • ${c.ic} IC • ${c.manpower} MP</small></span>
      <span class="country-arrow">›</span>
    </button>`;
  }).join('');
  wrap.querySelectorAll('.country-card:not([disabled])').forEach(b=>b.onclick=()=>{
    send({type:'choose_country',country:b.dataset.country});
    modal.classList.add('hidden');
  });
}

function openCountryModal(){
  if(!state)return;
  const sel=countryModalSelect;const me=state.players.find(p=>p.id===myId);
  if(me){countryModal.classList.add('hidden');return;}
  sel.innerHTML=Object.values(state.countries).map(c=>`<option value="${c.id}" ${state.players.some(p=>p.country===c.id)?'disabled':''}>${esc(c.name)}</option>`).join(''); rebuildCountryChooser();
  const first=Object.values(state.countries).find(c=>!state.players.some(p=>p.country===c.id)); if(first)sel.value=first.id;
  countryModal.classList.remove('hidden');
}
confirmCountry.onclick=()=>{const cid=countryModalSelect.value;if(!cid)return;send({type:'choose_country',country:cid});};
chooseCountry.onclick=openCountryModal;
countrySelect.onchange=()=>{
  const me=state?.players?.find(p=>p.id===myId);
  if(!me || me.ready || state?.status==='running'){render();return;}
  const next=countrySelect.value;
  if(next && next!==me.country)send({type:'choose_country',country:next});
};
ready.onclick=()=>send({type:'ready',value:true});
start.onclick=()=>send({type:'start'});
factory.onclick=()=>send({type:'action',action:'build_factory'});
division.onclick=()=>send({type:'action',action:'add_division',template:'infantry'});
war.onclick=()=>send({type:'action',action:'declare_war',target:diploTarget.value});
alliance.onclick=()=>send({type:'action',action:'alliance',target:diploTarget.value});
relation.onclick=()=>send({type:'action',action:'relation',target:diploTarget.value});
sendBtn.onclick=()=>{const t=chatInput.value.trim();if(t){send({type:'chat',text:t});chatInput.value='';}};
chatInput.onkeydown=e=>{if(e.key==='Enter')sendBtn.click();};
document.querySelectorAll('.game-tabs [data-tab]').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.game-tabs [data-tab]').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tabbody').forEach(x=>x.classList.remove('active'));btn.classList.add('active');document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');});
document.querySelectorAll('.map-actions [data-mode]').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.map-actions [data-mode]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');mapMode=btn.dataset.mode;draw();});




function renderAllSystems(c){
  const cb=document.getElementById('commandBox');
  if(cb)cb.innerHTML=`<div class="stats-inline"><span>Генералов <b>${c.generals?.length||0}</b></span><span>Армейский XP <b>${Math.round(c.armyXP||0)}</b></span><span>Командная сила <b>${Math.round(c.commandPower||0)}</b></span></div>`+
    `<div class="listrow"><b>Командиры</b>${(c.generals||[]).map(g=>`<small>${esc(g.name)} • ${g.rank} • ${g.traits.join(', ')}</small>`).join('')||'<small>Нет генералов.</small>'}</div>`+
    `<div class="listrow"><b>Армии</b>${(c.armies||[]).map(a=>`<small>${esc(a.name)} • ${a.units.length} дивизий</small>`).join('')||'<small>Нет созданных армий.</small>'}</div>`;
  document.getElementById('newGeneral')?.setAttribute('data-ready','1');
  document.getElementById('newArmy')?.setAttribute('data-ready','1');
  const fb=document.getElementById('frontBox');
  if(fb)fb.innerHTML=(c.frontLines||[]).map(f=>`<div class="listrow"><b>${esc(f.name)}</b><small>Цель: ${esc(state.provinces[f.target]?.name||f.target)}</small></div>`).join('')||'<div class="empty">Активных фронтов нет.</div>';
  const sb=document.getElementById('supplyBox');
  if(sb)sb.innerHTML=`<div class="stats-inline"><span>Снабжение <b>${Math.round(c.supply||0)}/${Math.round(c.supplyCapacity||100)}</b></span><span>Узлы <b>${Object.keys(c.supplyNodes||{}).length}</b></span><span>Ж/д <b>${Object.keys(c.railways||{}).length}</b></span><span>Дефицит винтовок <b>${Math.round(c.equipmentNeed?.infantry_equipment||0)}</b></span></div>`;
  const an=document.getElementById('airNavyBox');
  if(an)an.innerHTML=`<div class="stats-inline"><span>ВВС <b>${c.air.fighters+c.air.bombers}</b></span><span>Воздушных зон <b>${Object.keys(c.airZones||{}).length}</b></span><span>Флот <b>${c.navy.destroyers+c.navy.cruisers+c.navy.submarines}</b></span><span>Морских зон <b>${Object.keys(c.navalZones||{}).length}</b></span></div>`;
  const tt=document.getElementById('tradeTarget');
  if(tt)tt.innerHTML=Object.values(state.countries).filter(x=>x.id!==c.id).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  document.getElementById('newGeneral')?.addEventListener('click',()=>send({type:'action',action:'create_general'}));
  document.getElementById('newArmy')?.addEventListener('click',()=>send({type:'action',action:'create_army_group'}));
  document.getElementById('createFront')?.addEventListener('click',()=>{const target=Object.values(state.provinces).find(p=>p.controller!==myCountry);if(target)send({type:'action',action:'set_front',target:target.id})});
  document.getElementById('supplyNode')?.addEventListener('click',()=>{const p=state.provinces[selectedProv]||Object.values(state.provinces).find(p=>p.controller===myCountry);if(p)send({type:'action',action:'build_supply_node',province:p.id})});
  document.getElementById('railway')?.addEventListener('click',()=>{const p=state.provinces[selectedProv]||Object.values(state.provinces).find(p=>p.controller===myCountry);if(p)send({type:'action',action:'build_railway',province:p.id})});
  document.getElementById('tradeSend')?.addEventListener('click',()=>send({type:'action',action:'trade_resources',target:document.getElementById('tradeTarget')?.value,resource:document.getElementById('tradeResource')?.value,amount:Number(document.getElementById('tradeAmount')?.value)||3}));
}

function renderDeepSystems(c){

  const vb=document.getElementById('victoryBox');
  if(vb){
    const score=c.victoryPoints||0;
    vb.innerHTML=`<div class="victory-score"><b>${score}</b><span>VICTORY SCORE</span></div>`+
      (state.victoryConditions?Object.entries(state.victoryConditions).map(([k,v])=>`<div class="victory-row"><b>${esc(v.name)}</b><span>${k==='military'?Math.min(100,score):k==='industry'?Math.min(100,Math.round(c.ic/1.4)):Math.min(100,(state.factions?.find(f=>f.id===c.faction)?.members?.length||0)*12)} / ${v.need}</span></div>`).join(''):'');
  }
  const nb=document.getElementById('notifications');
  if(nb) nb.innerHTML=(c.notifications||[]).map(n=>`<div class="notification"><b>${esc(n.title)}</b><span>${esc(n.text)}</span></div>`).join('')||'<div class="empty">Новых уведомлений нет.</div>';
  const nc=document.getElementById('notifyCount'); if(nc) nc.textContent=(c.notifications||[]).length;

  const dbox=document.getElementById('doctrineBox');
  if(dbox){
    dbox.innerHTML=(state.doctrines||[]).map(d=>`<button class="doctrine-card ${c.doctrine===d.id?'active':''}" data-doctrine="${d.id}"><b>${esc(d.name)}</b><small>${c.doctrine===d.id?'АКТИВНАЯ':'20 XP армии'}</small></button>`).join('');
    dbox.querySelectorAll('.doctrine-card').forEach(b=>b.onclick=()=>send({type:'action',action:'set_doctrine',doctrine:b.dataset.doctrine}));
  }
  const ebox=document.getElementById('equipmentBox'),mini=document.getElementById('equipmentMini');
  const eq=(state.equipment?Object.keys(state.equipment):[]);
  const eqHtml=eq.map(k=>`<div class="equip"><span>${esc(state.equipment[k].name)}</span><b>${Math.round(c.equipment?.[k]||0)}</b></div>`).join('');
  if(ebox)ebox.innerHTML=`<div class="equipment-grid">${eqHtml}</div>`;
  if(mini)mini.innerHTML=`<div class="equipment-strip">${eqHtml}</div>`;
  const plans=document.getElementById('frontPlans');
  if(plans)plans.innerHTML=(c.frontPlans||[]).map(p=>`<div class="listrow"><b>План наступления</b><small>${esc(state.provinces[p.from]?.name||p.from)} → ${esc(state.provinces[p.target]?.name||p.target)} • ${p.status}</small></div>`).join('')||'<div class="empty">Нет активных планов.</div>';
  const opBtn=document.getElementById('frontPlanBtn');
  if(opBtn)opBtn.onclick=()=>{
    const myUnits=(state.units?.[myCountry]||[]);
    const u=myUnits.find(x=>x.province===selectedProv)||myUnits[0];
    const target=Object.values(state.provinces).find(p=>p.controller!==myCountry);
    if(u&&target)send({type:'action',action:'front_plan',from:u.province,target:target.id});
  };
  const peace=document.getElementById('peaceBtn');
  if(peace)peace.onclick=()=>{const target=Object.values(state.countries).find(x=>x.id!==myCountry);if(target)send({type:'action',action:'peace_offer',target:target.id})};
  const occSel=document.getElementById('occupationProvince');
  if(occSel){
    occSel.innerHTML=Object.values(state.provinces).filter(p=>p.controller===myCountry).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
    occSel.onchange=()=>renderOccupation(c,occSel.value);
    renderOccupation(c,occSel.value);
  }
  const history=document.getElementById('historyLog');
  if(history)history.innerHTML=(state.history||state.log||[]).slice(0,40).map(x=>`<div class="event">${esc(x)}</div>`).join('');
  const air=document.getElementById('airMission'),nav=document.getElementById('navalMission');
  if(air)air.onchange=()=>send({type:'action',action:'air_sortie',mission:air.value});
  if(nav)nav.onchange=()=>send({type:'action',action:'naval_order',mission:nav.value});
}
function renderOccupation(c,pid){
  const p=state.provinces?.[pid], box=document.getElementById('occupationBox');
  if(!p||!box)return;
  const resistance=Math.round(p.resistance||0);
  box.innerHTML=`<div class="stats-inline"><span>Сопротивление <b>${resistance}%</b></span><span>Владелец <b>${esc(state.countries[p.owner]?.name||'—')}</b></span><span>Контроль <b>${esc(state.countries[p.controller]?.name||'—')}</b></span></div>
    <div class="occupation-buttons">${(state.occupationPolicies||[]).map(o=>`<button class="${c.occupationPolicy===o.id?'active':''}" data-occ="${o.id}">${esc(o.name)}</button>`).join('')}</div>`;
  box.querySelectorAll('[data-occ]').forEach(b=>b.onclick=()=>send({type:'action',action:'set_occupation',province:pid,policy:b.dataset.occ}));
}

function renderAdvancedSystems(c){
  const focusBox=document.getElementById('focusTree');
  const decBox=document.getElementById('decisions');
  const politicsBox=document.getElementById('politicsBox');
  const airBox=document.getElementById('airBox');
  const navyBox=document.getElementById('navyBox');
  const intelBox=document.getElementById('intelBox');
  const statsWorld=document.getElementById('statsWorld');
  const buildProvince=document.getElementById('buildProvince');
  const constructionList=document.getElementById('constructionList');
  if(focusBox){
    focusBox.innerHTML=(state.focuses?.length?state.focuses:(state.nationalFocusTree?.generic||[])).map(f=>{
      const done=c.focus?.completed?.includes(f.id), active=c.focus?.active?.id===f.id;
      return `<div class="focus-card ${done?'done':''} ${active?'active':''}">
        <b>${esc(f.name)}</b><small>${done?'✓ Завершён':active?`В работе ${c.focus.progress}/${f.days}`:`${f.days} дн. • ${f.cost} PP`}</small>
        <p>${Object.entries(f.fx).map(([k,v])=>`${k}: ${v>0?'+':''}${v}`).join(' • ')}</p>
        ${!done&&!active?`<button class="focus-start" data-focus="${f.id}" ${c.politicalPoints<f.cost?'disabled':''}>Начать</button>`:''}
      </div>`;
    }).join('');
    document.querySelectorAll('.focus-start').forEach(b=>b.onclick=()=>send({type:'action',action:'start_focus',focus:b.dataset.focus}));
  }
  if(decBox){
    decBox.innerHTML=(state.decisions||[]).map(d=>{
      const used=c.decisionsUsed?.includes(d.id);
      return `<div class="focus-card ${used?'done':''}"><b>${esc(d.name)}</b><small>${used?'✓ Использовано':`${d.cost} PP`}</small><p>${Object.entries(d.fx).map(([k,v])=>`${k}: ${v>0?'+':''}${v}`).join(' • ')}</p><button class="decision-use" data-decision="${d.id}" ${used||c.politicalPoints<d.cost?'disabled':''}>Принять</button></div>`;
    }).join('');
    document.querySelectorAll('.decision-use').forEach(b=>b.onclick=()=>send({type:'action',action:'decision',decision:b.dataset.decision}));
  }
  if(politicsBox)politicsBox.innerHTML=`<div class="stats-inline"><span>Идеология <b>${esc(c.ideology)}</b></span><span>Стабильность <b>${Math.round(c.stability)}%</b></span><span>Военная поддержка <b>${Math.round(c.warSupport)}%</b></span><span>PP <b>${Math.round(c.politicalPoints)}</b></span></div>`;
  if(airBox)airBox.innerHTML=`<div class="stats-inline"><span>Истребители <b>${c.air.fighters}</b></span><span>Бомбардировщики <b>${c.air.bombers}</b></span><span>Транспортники <b>${c.air.transport||0}</b></span><span>Авиабазы <b>${c.air.airbases||0}</b></span></div>`;
  if(navyBox)navyBox.innerHTML=`<div class="stats-inline"><span>Эсминцы <b>${c.navy.destroyers}</b></span><span>Крейсеры <b>${c.navy.cruisers}</b></span><span>ПЛ <b>${c.navy.submarines}</b></span><span>Конвои <b>${c.navy.convoys}</b></span></div>`;
  if(intelBox)intelBox.innerHTML=`<div class="stats-inline"><span>Сеть разведки <b>${Object.values(c.spyNetworks||{}).reduce((a,b)=>a+b,0)}</b></span><span>Шпионы <b>${c.spies||2}</b></span><span>Снабжение <b>${Math.round(c.supply||0)}/${Math.round(c.supplyCapacity||100)}</b></span></div>`;
  if(statsWorld){
    const rows=Object.values(state.countries).sort((a,b)=>b.ic-a.ic);
    statsWorld.innerHTML=rows.map((x,i)=>`<div class="world-row"><span>${i+1}</span><b>${esc(x.name)}</b><span>${x.ic} IC</span><span>${x.manpower} MP</span><span>${x.units.length} див.</span></div>`).join('');
  }

  const lawGrid=document.getElementById('lawGrid');
  if(lawGrid){
    lawGrid.innerHTML=['economy','conscription','trade'].map(group=>`<div class="law-group"><h4>${group}</h4>${(state.laws[group]||[]).map(l=>{
      const active=c.laws[group]===l.id;
      return `<button class="law-btn ${active?'active':''}" data-law-group="${group}" data-law-id="${l.id}">${esc(l.name)}<small>${active?'АКТИВЕН':''}</small></button>`;
    }).join('')}</div>`).join('');
    lawGrid.querySelectorAll('.law-btn').forEach(b=>b.onclick=()=>send({type:'action',action:'set_law',group:b.dataset.lawGroup,id:b.dataset.lawId}));
  }
  const advisorGrid=document.getElementById('advisorGrid');
  if(advisorGrid){
    advisorGrid.innerHTML=(state.advisors||[]).map(a=>{
      const active=c.advisors.includes(a.id);
      return `<button class="advisor-card ${active?'active':''}" data-advisor="${a.id}" ${active||c.politicalPoints<30?'disabled':''}><b>${esc(a.name)}</b><small>${active?'НАЗНАЧЕН':'30 PP'}</small></button>`;
    }).join('');
    advisorGrid.querySelectorAll('.advisor-card:not([disabled])').forEach(b=>b.onclick=()=>send({type:'action',action:'hire_advisor',advisor:b.dataset.advisor}));
  }
  const prod=document.getElementById('production');
  if(prod)prod.innerHTML=(c.production||[]).map(p=>`<div class="listrow"><b>${esc(state.unitTypes?.[p.type]?.name||p.type)}</b><small>${Math.max(0,Math.round(100*(1-p.remaining/Math.max(1,p.total))))}% • ${Math.max(0,Math.ceil(p.remaining))} дн.</small><div class="progress"><i style="width:${Math.min(100,100*(1-p.remaining/Math.max(1,p.total)))}%"></i></div></div>`).join('');
  document.querySelectorAll('[data-prod]').forEach(b=>{b.onclick=()=>send({type:'action',action:'add_division',template:b.dataset.prod})});
  const airMission=document.getElementById('airMission');
  if(airMission){airMission.innerHTML=(state.airMissions||[]).map(m=>`<option value="${m}" ${c.airMission===m?'selected':''}>${m}</option>`).join('');airMission.onchange=()=>send({type:'action',action:'set_air_mission',mission:airMission.value});}
  const navalMission=document.getElementById('navalMission');
  if(navalMission){navalMission.innerHTML=(state.navalMissions||[]).map(m=>`<option value="${m}" ${c.navalMission===m?'selected':''}>${m}</option>`).join('');navalMission.onchange=()=>send({type:'action',action:'set_naval_mission',mission:navalMission.value});}
  const diploTarget=document.getElementById('diploTarget');
  if(diploTarget){const opts=Object.values(state.countries).filter(x=>x.id!==c.id);diploTarget.innerHTML=opts.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');}
  document.getElementById('warGoalBtn')&&(document.getElementById('warGoalBtn').onclick=()=>send({type:'action',action:'war_goal',target:document.getElementById('diploTarget')?.value,goal:'conquest'}));
  document.getElementById('lendLeaseBtn')&&(document.getElementById('lendLeaseBtn').onclick=()=>send({type:'action',action:'lend_lease',target:document.getElementById('diploTarget')?.value}));
  document.getElementById('factionBtn')&&(document.getElementById('factionBtn').onclick=()=>send({type:'action',action:'offer_faction',target:document.getElementById('diploTarget')?.value}));
  const hist=document.getElementById('historyLog'); if(hist) hist.innerHTML=(state.log||[]).map(x=>`<div class="event">${esc(x)}</div>`).join('');
  const ev=c.activeEvent;
  const modal=document.getElementById('eventModal');
  if(modal){
    if(ev){
      modal.classList.remove('hidden');document.getElementById('eventTitle').textContent=ev.title;document.getElementById('eventText').textContent=ev.text;
      document.getElementById('eventChoices').innerHTML=ev.choices.map(ch=>`<button class="choice-btn" data-choice="${ch.id}"><b>${esc(ch.name)}</b><small>${Object.entries(ch.fx).map(([k,v])=>`${k}: ${v>0?'+':''}${v}`).join(' • ')}</small></button>`).join('');
      document.querySelectorAll('.choice-btn').forEach(b=>b.onclick=()=>{send({type:'action',action:'event_choice',choice:b.dataset.choice});});
    }else modal.classList.add('hidden');
  }

  if(buildProvince){
    buildProvince.innerHTML=Object.values(state.provinces).filter(p=>p.controller===myCountry).map(p=>`<option value="${p.id}">${esc(p.name)} • IC ${p.industry}</option>`).join('');
  }
  if(constructionList){
    constructionList.innerHTML=(c.construction||[]).map(j=>`<div class="listrow"><b>${esc(j.building)}</b><small>${esc(state.provinces[j.province]?.name||j.province)} • ${Math.max(0,j.remaining)} дн.</small><div class="progress"><i style="width:${Math.max(0,Math.min(100,(1-j.remaining/j.total)*100))}%"></i></div></div>`).join('')||'<div class="empty">Нет активного строительства.</div>';
  }
}

function render(){
  if(!state)return;renderShell();
  const me=state.players.find(p=>p.id===myId);
  if(!me){
    countrySelect.innerHTML=Object.values(state.countries).map(x=>{const busy=state.players.some(p=>p.country===x.id);return `<option value="${x.id}" ${busy?'disabled':''}>${esc(x.name)}${busy?' — занята':' — свободна'}</option>`;}).join('');
    document.getElementById('countryModal').classList.remove('hidden');
    draw();
    return;
  }
  myCountry=me.country;myNick=me.nick;
  const c=state.countries[myCountry]; if(!c)return;
  const chatPanel=document.getElementById('chatPanel'); if(chatPanel){chatPanel.style.display=state.players.length>1?'':'none'; if(state.players.length<=1) chatPanel.title='Чат включится, когда в комнате появится второй игрок.';}
  countrySelect.innerHTML=Object.values(state.countries).map(x=>{const busy=state.players.some(p=>p.country===x.id&&p.id!==myId);return `<option value="${x.id}" ${x.id===myCountry?'selected':''} ${busy?'disabled':''}>${esc(x.name)}${busy?' — занята':''}</option>`;}).join('');
  countrySelect.disabled=me.ready||state.status==='running';
  const countries=Object.values(state.countries).filter(x=>x.id!==myCountry);diploTarget.innerHTML=countries.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  stats.innerHTML=[['Промышленность',c.ic],['Людские ресурсы',c.manpower],['Металл',c.metal],['Нефть',c.oil],['Стабильность',Math.round(c.stability)+'%'],['Военная поддержка',Math.round(c.warSupport)+'%'],['Полит. очки',Math.round(c.politicalPoints)],['Снабжение',`${Math.round(c.supply||0)}/${Math.round(c.supplyCapacity||100)}`]].map(([a,b])=>`<div class="stat"><small>${a}</small><b>${b}</b></div>`).join('');
  events.innerHTML=c.activeEvent?`<div class="event event-card"><b>${esc(c.activeEvent.title)}</b><p>${esc(c.activeEvent.text)}</p>${c.activeEvent.choices.map((ch,i)=>`<button class="event-choice" data-choice="${i}">${esc(ch.text)}</button>`).join('')}</div>`:'<div class="empty">Активных национальных событий нет.</div>';
  document.querySelectorAll('.event-choice').forEach(b=>b.onclick=()=>send({type:'action',action:'event_choice',choice:Number(b.dataset.choice)}));
  army.innerHTML=c.units.map(u=>`<div class="listrow unit-row ${selectedUnit===u.id?'selected':''}" data-unit="${u.id}"><b>${esc(u.name)}</b><small>${esc(state.provinces[u.province]?.name||u.province)} • ${esc(u.commander)} • ${Math.round(u.org)}% орг.</small><div class="progress"><i style="width:${Math.max(0,Math.min(100,u.org))}%"></i></div></div>`).join('');
  document.querySelectorAll('.unit-row').forEach(row=>row.onclick=()=>{selectedUnit=row.dataset.unit;draw();});
  production.innerHTML=c.production.map(p=>`<div class="listrow"><b>${esc(p.type)}</b><small>${Math.round((1-p.remaining/p.total)*100)}%</small><div class="progress"><i style="width:${Math.max(0,Math.min(100,(1-p.remaining/p.total)*100))}%"></i></div></div>`).join('')||'<div class="empty">Очередь пуста.</div>';
  tech.innerHTML=state.techs.map(t=>`<div class="listrow"><b>${esc(t.name)}</b><small>${esc(t.group)} • ${c.researched.includes(t.id)?'✓ изучено':c.researchSlots.includes(t.id)?'в работе':t.cost+' очков'}</small>${!c.researched.includes(t.id)&&!c.researchSlots.includes(t.id)?`<button class="research-btn" data-tech="${t.id}">Исследовать</button>`:''}</div>`).join('');
  document.querySelectorAll('.research-btn').forEach(b=>b.onclick=()=>{const slot=c.researchSlots.findIndex(x=>!x);if(slot<0)return toast('Нет свободного слота для исследования.','error');send({type:'action',action:'research',tech:b.dataset.tech,slot});});
  renderAdvancedSystems(c); renderDeepSystems(c); renderAllSystems(c);
  diplo.innerHTML=countries.map(x=>`<div class="listrow"><b>${esc(x.name)}</b><small>Отношения: ${c.relations?.[x.id]||0}</small></div>`).join('');
  players.innerHTML=state.players.map(p=>`<div class="player"><div class="avatar">${esc(p.nick.slice(0,2).toUpperCase())}</div><b>${esc(p.nick)}</b><small>${esc(state.countries[p.country].name)} ${p.ready?'✓':''}</small></div>`).join('');
  log.innerHTML=state.log.map(x=>`<div class="event">${esc(x)}</div>`).join('');
  wars.innerHTML=state.wars.map(w=>`<div class="war">${esc(state.countries[w.a].name)} ⚔ ${esc(state.countries[w.b].name)}</div>`).join('')||'<div class="empty">Нет активных войн.</div>';
  const isHost=state.host===me.nick;start.style.display=isHost?'block':'none';ready.disabled=me.ready||state.status==='running';ready.textContent=me.ready?'ГОТОВ ✓':'ГОТОВ';
  document.getElementById('countryModal').classList.toggle('hidden',!!me);
  if(!me) rebuildCountryChooser();
  draw();
}
const MAP_LEGENDS={
  political:null,
  industry:[['#c9964e','Высокая пром.'],['#9b9156','Средняя'],['#5f7b64','Низкая']],
  supply:[['#6f9e78','Снабжено'],['#b1934f','Частично'],['#a3564f','Отрезано']],
  resources:[['#7ea6c9','Нефть'],['#b8925a','Металл'],['#5f7360','Нет ресурсов']],
  terrain:[['#71805e','Равнины'],['#4d684c','Лес'],['#847359','Холмы'],['#5d645e','Горы'],['#8d806d','Город']]
};
function terrainFill(p){return ({plains:'#71805e',forest:'#4d684c',hills:'#847359',mountains:'#5d645e',city:'#8d806d'})[p.terrain]||'#6d7868';}
function draw(){
  if(!state)return;
  ctx.clearRect(0,0,1000,720);
  const ocean=ctx.createRadialGradient(500,340,80,500,360,760);
  ocean.addColorStop(0,'#131d22');ocean.addColorStop(1,'#0a1013');
  ctx.fillStyle=ocean;ctx.fillRect(0,0,1000,720);
  for(let x=0;x<1000;x+=60){ctx.strokeStyle='#ffffff05';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,720);ctx.stroke();}
  for(let y=0;y<720;y+=60){ctx.strokeStyle='#ffffff07';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1000,y);ctx.stroke();}

  for(const p of Object.values(state.provinces)){
    const owner=state.countries[p.controller];if(!owner)continue;
    let fill=owner.color;
    if(mapMode==='industry')fill=p.industry>=7?'#c9964e':p.industry>=6?'#9b9156':'#5f7b64';
    if(mapMode==='terrain')fill=terrainFill(p);
    if(mapMode==='resources')fill=p.oil>0?'#7ea6c9':p.metal>3?'#b8925a':'#5f7360';
    if(mapMode==='supply')fill=(p.controller===p.owner)?'#6f9e78':(p.resistance||0)>50?'#a3564f':'#b1934f';
    const isHover=p.id===hoveredProv, isSel=p.id===selectedProv;
    ctx.save();
    polygon(p.poly);
    ctx.shadowColor='#000a';ctx.shadowBlur=isSel?14:6;ctx.shadowOffsetY=3;
    ctx.globalAlpha=isHover?.93:.8;ctx.fillStyle=fill;ctx.fill();
    ctx.restore();
    polygon(p.poly);
    ctx.strokeStyle=isSel?'#f2d88b':isHover?'#e8dcb8':'#12140fcc';
    ctx.lineWidth=isSel?3:isHover?2:1.1;
    ctx.stroke();
    if(p.terrain==='city'){ctx.fillStyle='#f2ede1cc';ctx.beginPath();ctx.arc(p.x,p.y,2.4,0,Math.PI*2);ctx.fill();}
    ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#0b0c09b0';ctx.font='700 10px Georgia';
    ctx.strokeText(p.name,p.x,p.y-3);ctx.fillStyle='#f4efe4';ctx.fillText(p.name,p.x,p.y-3);
    ctx.fillStyle='#d8d2c4aa';ctx.font='8px system-ui';ctx.fillText(p.terrain,p.x,p.y+10);
  }

  for(const w of state.wars){const a=countryCenter(w.a),b=countryCenter(w.b);if(a&&b){ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.setLineDash([8,5]);ctx.strokeStyle='#d6655c';ctx.lineWidth=3;ctx.stroke();ctx.setLineDash([]);}}

  for(const [cid,c] of Object.entries(state.countries)){
    const center=countryCenter(cid); if(!center)continue;
    ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='700 13px Georgia';ctx.shadowColor='#000';ctx.shadowBlur=6;ctx.fillText(c.name,center[0],center[1]-30);
    const pl=state.players.find(p=>p.country===cid);
    ctx.font='9px system-ui';ctx.fillStyle=pl?'#efd37e':'#ffffffaa';ctx.fillText(pl?`● ${pl.nick}`:'● ИИ',center[0],center[1]-14);ctx.shadowBlur=0;
  }

  for(const [cid,c] of Object.entries(state.countries))for(const u of c.units){
    const p=state.provinces[u.province];if(!p)continue;
    ctx.beginPath();ctx.arc(p.x+25,p.y+20,10,0,Math.PI*2);
    ctx.shadowColor='#000a';ctx.shadowBlur=5;ctx.fillStyle=c.color;ctx.fill();ctx.shadowBlur=0;
    ctx.strokeStyle=selectedUnit===u.id?'#fff0a9':'#151515';ctx.lineWidth=selectedUnit===u.id?3:1;ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='800 8px system-ui';ctx.textAlign='center';ctx.fillText(Math.max(1,Math.round(u.strength)),p.x+25,p.y+23);
    if(cid===myCountry){ctx.fillStyle='#fff8';ctx.fillRect(p.x+10,p.y+38,30,3);ctx.fillStyle='#d9bd72';ctx.fillRect(p.x+10,p.y+38,30*(u.org/100),3);}
  }

  const legend=MAP_LEGENDS[mapMode];
  if(legend){
    let lx=16,ly=684;
    ctx.font='700 10px system-ui';
    for(const [color,label] of legend){
      ctx.fillStyle=color;ctx.fillRect(lx,ly-9,10,10);
      ctx.fillStyle='#e7e2d4';ctx.textAlign='left';ctx.fillText(label,lx+15,ly);
      lx+=15+ctx.measureText(label).width+16;
    }
  }
}
function polygon(poly){ctx.beginPath();ctx.moveTo(poly[0][0],poly[0][1]);for(let i=1;i<poly.length;i++)ctx.lineTo(poly[i][0],poly[i][1]);ctx.closePath();}
function point(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};}
function inside(x,y,p){let ins=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const xi=p[i][0],yi=p[i][1],xj=p[j][0],yj=p[j][1];const hit=((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi);if(hit)ins=!ins;}return ins;}
function countryCenter(id){const ps=Object.values(state.provinces).filter(p=>p.controller===id);if(!ps.length)return null;return[ps.reduce((s,p)=>s+p.x,0)/ps.length,ps.reduce((s,p)=>s+p.y,0)/ps.length];}
canvas.onclick=e=>{if(!state)return;const pt=point(e);const p=Object.values(state.provinces).find(p=>inside(pt.x,pt.y,p.poly));if(!p)return;selectedProv=p.id;const c=state.countries[myCountry];const u=c?.units.find(u=>u.province===p.id);if(u)selectedUnit=u.id;if(e.shiftKey&&selectedUnit)send({type:'action',action:'move',unit:selectedUnit,target:p.id});draw();};
canvas.onmousemove=e=>{if(!state)return;const pt=point(e);const p=Object.values(state.provinces).find(p=>inside(pt.x,pt.y,p.poly));const id=p?p.id:null;if(id!==hoveredProv){hoveredProv=id;canvas.style.cursor=id?'pointer':'default';draw();}};
canvas.onmouseleave=()=>{if(hoveredProv){hoveredProv=null;draw();}};
canvas.oncontextmenu=e=>{e.preventDefault();if(!selectedProv||!selectedUnit)return;send({type:'action',action:'attack',unit:selectedUnit,target:selectedProv});};

document.querySelectorAll('.build-choice').forEach(b=>b.onclick=()=>{
  const province=document.getElementById('buildProvince')?.value;
  if(!province)return toast('Сначала выбери провинцию на карте.','error');
  send({type:'action',action:'build',building:b.dataset.building,province});
});

window.addEventListener('beforeunload',()=>window.__leavingIronEra=true);

document.querySelectorAll('.speedbar button').forEach(b=>b.onclick=()=>send({type:'set_speed',value:Number(b.dataset.speed)}));
document.getElementById('pauseVote')?.addEventListener('click',()=>send({type:'action',action:'set_pause_vote',value:true}));
document.getElementById('notifyBtn')?.addEventListener('click',()=>{document.querySelector('[data-tab="notifications"]')?.click();send({type:'action',action:'mark_notifications'});});

connect();
