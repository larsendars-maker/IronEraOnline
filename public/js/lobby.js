let roomsCache=[];
async function refreshRooms(){
 const r=await api("/api/rooms");roomsCache=await r.json();roomCount.textContent=roomsCache.length;
 rooms.innerHTML=roomsCache.map(r=>`<div class="room"><div><b>${esc(r.name)}</b><small>${r.status==="waiting"?"Ожидание":"Игра идёт"} • ${r.date}</small></div><span>${r.players}/${r.maxPlayers}</span><span>${esc(r.host||"—")}</span><button class="btn ${r.status==="waiting"?"gold":""} join" data-id="${r.id}">${r.status==="waiting"?"ВОЙТИ":"СМОТРЕТЬ"}</button></div>`).join("")||`<div class="empty">Комнат пока нет. Создай первую.</div>`;
 document.querySelectorAll(".join").forEach(b=>b.onclick=()=>{location.href="/game?room="+b.dataset.id});
}
createRoom?.addEventListener("click",()=>{if(!token()){openLogin();return}roomModal.classList.remove("hidden")});
closeModal?.addEventListener("click",()=>roomModal.classList.add("hidden"));
confirmRoom?.addEventListener("click",async()=>{
 const r=await api("/api/rooms",{method:"POST",body:JSON.stringify({name:roomName.value||"Новая мировая кампания",maxPlayers:Number(roomMax.value)||20})});
 const d=await r.json();if(!d.ok){alert(d.error);return}
 location.href="/game?room="+d.roomId;
});
refreshRooms();setInterval(refreshRooms,5000);
