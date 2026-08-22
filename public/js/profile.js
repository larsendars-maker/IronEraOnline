async function profile(){
 const r=await api("/api/profile");const d=await r.json();if(!d.ok){location.href="/";return}
 username.textContent=d.user.username;profileName.textContent=d.user.username;avatar.textContent=d.user.username.slice(0,2).toUpperCase();
 history.innerHTML=d.history.map(h=>`<div class="history"><b>${esc(h.name)}</b><small>${h.status} • ${h.date}</small></div>`).join("")||`<div class="empty">История пока пустая.</div>`;
}
profile();
