(async()=>{
  try{
    const r=await api('/api/profile');
    const d=await r.json();
    if(!d.ok){location.href='/';return;}
    const usernameEl=document.getElementById('username');
    const profileNameEl=document.getElementById('profileName');
    const avatarEl=document.getElementById('avatar');
    const historyEl=document.getElementById('history');
    usernameEl.textContent=d.user.username;
    profileNameEl.textContent=d.user.username;
    avatarEl.textContent=d.user.username.slice(0,2).toUpperCase();
    historyEl.innerHTML=d.history.map(h=>`<div class="history"><b>${esc(h.name)}</b><small>${esc(h.status)} • ${esc(h.date)}</small></div>`).join('')||'<div class="empty">История пока пустая.</div>';
  }catch{location.href='/';}
})();
