let roomsData=[];
async function refreshRooms(){
  try{
    const r=await api('/api/rooms'); roomsData=await r.json(); roomCount.textContent=roomsData.length;
    rooms.innerHTML=roomsData.map(r=>`<div class="room"><div><b>${esc(r.name)}</b><small>${r.status==='waiting'?'Ожидание игроков':'Игра идёт'} • ${r.date}</small></div><span>${r.players}/${r.maxPlayers}</span><span>${esc(r.host||'—')}</span><button class="btn ${r.status==='waiting'?'gold':''} join" data-id="${r.id}">ВОЙТИ</button></div>`).join('')||'<div class="empty">Комнат пока нет. Создай первую.</div>';
    document.querySelectorAll('.join').forEach(b=>b.onclick=()=>{if(!getToken()){showAuth();return;}location.href=`/game?room=${encodeURIComponent(b.dataset.id)}`;});
  }catch{rooms.innerHTML='<div class="empty">Не удалось загрузить список комнат.</div>';}
}
createRoom.onclick=()=>{if(!getToken()){showAuth();return;}roomModal.classList.remove('hidden');roomName.focus();};
closeModal.onclick=()=>roomModal.classList.add('hidden');
confirmRoom.onclick=async()=>{
  const r=await api('/api/rooms',{method:'POST',body:JSON.stringify({name:roomName.value.trim()||'Новая кампания',maxPlayers:Number(roomMax.value)||20})});
  const d=await r.json();if(!d.ok){alert(d.error);return;}location.href=`/game?room=${encodeURIComponent(d.roomId)}`;
};
refreshRooms();setInterval(refreshRooms,5000);
