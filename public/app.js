let S=null,selected="aurora",hovered=null,zoom=1,me=null,ws=null;
const canvas=document.getElementById("map"),ctx=canvas.getContext("2d");
const colors=["#d6b75f","#74a9df","#9e7fc1","#6cae78","#c97a63","#c9c0a2"];

function connect(){
  const protocol=location.protocol==="https:"?"wss://":"ws://";
  ws=new WebSocket(protocol+location.host);
  ws.onopen=()=>{net.textContent="● WEBSOCKET ONLINE";net.style.color="#79c98a"};
  ws.onclose=()=>{net.textContent="● ПЕРЕПОДКЛЮЧЕНИЕ";net.style.color="#c96b62";setTimeout(connect,1500)};
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==="joined"){me=m.id;selected=m.country;document.getElementById("login").style.display="none";return}
    if(m.type==="state"){S=m.state;render()}
    if(m.type==="chat"){chat.innerHTML+=`<div class="msg"><b>${esc(m.from)}:</b> ${esc(m.text)}</div>`;chat.scrollTop=chat.scrollHeight}
    if(m.type==="error")alert(m.message);
  };
}
function esc(s){return String(s).replace(/[&<>"']/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[a]))}
function send(o){if(ws&&ws.readyState===1)ws.send(JSON.stringify(o))}
function render(){
  const q=S.countries[selected]||S.countries.aurora;
  date.textContent=`${S.year} • День ${S.day} • Ход ${S.turn}`;
  online.textContent=S.players.length;
  playersCount.textContent=S.players.length;
  name.textContent=q.name;
  factories.textContent=q.factories; steel.textContent=q.steel; manpower.textContent=q.manpower;
  divisions.textContent=q.divisions; stability.textContent=q.stability+"%"; aggression.textContent=q.aggression;
  flag.style.background=q.color;
  const owner=S.players.find(p=>p.country===q.id);
  document.getElementById("owner").textContent=owner?`👤 ${owner.nick}`:(q.ai?"🤖 Управляется ИИ":"Свободная держава");
  players.innerHTML=S.players.map((p,i)=>{
    const c=S.countries[p.country];
    return `<div class="player"><div class="avatar" style="background:${c.color}">${esc(p.nick.slice(0,2).toUpperCase())}</div><b>${esc(p.nick)}</b><small>${esc(c.name)}</small></div>`
  }).join("");
  log.innerHTML=S.log.map(v=>`<div class="event">${esc(v)}</div>`).join("");
  draw();
}
function polygon(poly){ctx.beginPath();ctx.moveTo(poly[0][0],poly[0][1]);for(let i=1;i<poly.length;i++)ctx.lineTo(poly[i][0],poly[i][1]);ctx.closePath()}
function center(poly){let x=0,y=0;poly.forEach(p=>{x+=p[0];y+=p[1]});return [x/poly.length,y/poly.length]}
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const g=ctx.createLinearGradient(0,0,0,610);g.addColorStop(0,"#3c463a");g.addColorStop(1,"#202820");ctx.fillStyle=g;ctx.fillRect(0,0,860,610);
  ctx.strokeStyle="#ffffff08";ctx.lineWidth=1;
  for(let x=0;x<860;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,610);ctx.stroke()}
  for(let y=0;y<610;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(860,y);ctx.stroke()}
  for(const c of Object.values(S.countries)){
    c.provinces.forEach((poly,idx)=>{
      polygon(poly);ctx.fillStyle=c.color;ctx.globalAlpha=c.id===selected?.82:.66;ctx.fill();ctx.globalAlpha=1;
      ctx.lineWidth=c.id===selected?3:1.3;ctx.strokeStyle=c.id===selected?"#f4e4b3":"#151914";ctx.stroke();
      ctx.strokeStyle="#ffffff22";ctx.lineWidth=.7;polygon(poly);ctx.stroke();
    });
    const all=c.provinces.flatMap(p=>p),cx=all.reduce((a,p)=>a+p[0],0)/all.length,cy=all.reduce((a,p)=>a+p[1],0)/all.length;
    ctx.textAlign="center";ctx.fillStyle="#fff";ctx.font="700 16px Georgia";ctx.shadowColor="#000";ctx.shadowBlur=5;ctx.fillText(c.name,cx,cy-7);ctx.font="10px system-ui";ctx.fillStyle="#e8e4d6cc";ctx.fillText(`${c.divisions} див.`,cx,cy+10);ctx.shadowBlur=0;
    const pl=S.players.filter(p=>p.country===c.id);
    pl.forEach((p,i)=>{
      const yy=cy+28+i*18;ctx.fillStyle=c.color;ctx.beginPath();ctx.arc(cx-55,yy-4,6,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff";ctx.font="700 9px system-ui";ctx.textAlign="left";ctx.fillText(p.nick,cx-45,yy);
    });
    if(c.ai){ctx.textAlign="center";ctx.fillStyle="#ffffff88";ctx.font="8px system-ui";ctx.fillText("ИИ",cx,cy+24+(pl.length*18))}
  }
  for(const w of S.wars){
    const a=S.countries[w.a],b=S.countries[w.b];
    const ac=center(a.provinces[0]),bc=center(b.provinces[0]);
    ctx.beginPath();ctx.moveTo(ac[0],ac[1]);ctx.lineTo(bc[0],bc[1]);ctx.setLineDash([8,5]);ctx.strokeStyle="#d35e58";ctx.lineWidth=3;ctx.stroke();ctx.setLineDash([]);
  }
}
function setupLogin(){
  country.innerHTML=Object.values(S?.countries||{}).map(c=>`<option value="${c.id}">${c.name}${c.ai?" — ИИ":""}</option>`).join("");
}
function initialState(){
  const once=e=>{try{const m=JSON.parse(e.data);if(m.type==="state"){S=m.state;setupLogin();ws.removeEventListener("message",once)}}catch{}};
  ws.addEventListener("message",once);
}
join.onclick=()=>{
  const n=nick.value.trim()||"Игрок";
  send({type:"join",nick:n,country:country.value});
};
factory.onclick=()=>send({type:"action",action:"factory"});
division.onclick=()=>send({type:"action",action:"division"});
send.onclick=()=>{const t=chatInput.value.trim();if(t){send({type:"chat",text:t});chatInput.value=""}};
chatInput.onkeydown=e=>{if(e.key==="Enter")send.click()};
canvas.onclick=e=>{
  if(!S)return;const r=canvas.getBoundingClientRect(),X=(e.clientX-r.left)*canvas.width/r.width,Y=(e.clientY-r.top)*canvas.height/r.height;
  hovered=Object.values(S.countries).find(c=>c.provinces.some(poly=>pointInPoly(X,Y,poly)));
  if(hovered){selected=hovered.id;render()}
};
canvas.oncontextmenu=e=>{e.preventDefault();if(hovered&&hovered.id!==selected)send({type:"action",action:"war",target:hovered.id})};
function pointInPoly(x,y,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];const intersect=((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi);if(intersect)inside=!inside}return inside}
zoomIn.onclick=()=>{zoom=Math.min(1.5,zoom+.1);canvas.style.transform=`translate(-50%,-50%) scale(${zoom})`};
zoomOut.onclick=()=>{zoom=Math.max(.7,zoom-.1);canvas.style.transform=`translate(-50%,-50%) scale(${zoom})`};

connect();
setTimeout(()=>{if(!S) initialState()},500);
