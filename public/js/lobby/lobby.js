let roomsData=[];
async function refreshRooms(){
  try{
    const r=await api('/api/rooms');
    const data=await r.json();
    roomsData=data.rooms||[];
    roomCount.textContent=roomsData.length;
    const ownedId=data.ownedRoomId;
    createRoom.disabled=!!ownedId;
    roomLimitNote.textContent=ownedId?`У тебя уже есть одна комната. Удали её, чтобы создать новую.`:'';
    rooms.innerHTML=roomsData.map(r=>`<div class="room ${r.owned?'owned-room':''}">
      <div><b>${esc(r.name)}</b><small>${r.status==='waiting'?'Ожидание игроков':'Игра идёт'} • ${r.date}</small></div>
      <span>${r.players}/${r.maxPlayers}</span><span>${esc(r.host||'—')}</span>
      <div class="room-actions">
        <button class="btn ${r.status==='waiting'?'gold':''} join" data-id="${r.id}">${r.status==='waiting'?'ВОЙТИ':'СМОТРЕТЬ'}</button>
        ${r.owned?`<button class="btn danger delete-room" data-id="${r.id}">УДАЛИТЬ</button>`:''}
      </div>
    </div>`).join('')||'<div class="empty">Комнат пока нет. Создай первую.</div>';
    document.querySelectorAll('.join').forEach(b=>b.onclick=()=>{if(!getToken()){showAuth();return;}location.href=`/game?room=${encodeURIComponent(b.dataset.id)}`;});
    document.querySelectorAll('.delete-room').forEach(b=>b.onclick=async()=>{
      if(!confirm('Удалить свою комнату? Все игроки будут отключены.'))return;
      const rr=await api(`/api/rooms/${encodeURIComponent(b.dataset.id)}`,{method:'DELETE'});
      const dd=await rr.json();
      if(!dd.ok){alert(dd.error);return;}
      await refreshRooms();
    });
  }catch{rooms.innerHTML='<div class="empty">Не удалось загрузить список комнат.</div>';}
}
createRoom.onclick=()=>{if(!getToken()){showAuth();return;}if(createRoom.disabled){alert('У тебя уже есть комната. Сначала удали её.');return;}roomModal.classList.remove('hidden');roomName.focus();};
closeModal.onclick=()=>roomModal.classList.add('hidden');
confirmRoom.onclick=async()=>{
  const r=await api('/api/rooms',{method:'POST',body:JSON.stringify({name:roomName.value.trim()||'Новая кампания',maxPlayers:Number(roomMax.value)||20})});
  const d=await r.json();
  if(!d.ok){alert(d.error);return;}
  location.href=`/game?room=${encodeURIComponent(d.roomId)}`;
};
refreshRooms();setInterval(refreshRooms,5000);
