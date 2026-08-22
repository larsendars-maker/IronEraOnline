const tokenKey="ironEraToken";
function token(){return localStorage.getItem(tokenKey)}
function api(path,opts={}){const headers={"Content-Type":"application/json",...(opts.headers||{})};if(token())headers.Authorization="Bearer "+token();return fetch(path,{...opts,headers})}
async function loadMe(){
  const r=await api("/api/me");const d=await r.json();
  const box=document.getElementById("userBox");
  if(!box)return;
  if(d.user)box.innerHTML=`<a href="/profile">${esc(d.user.username)}</a> <button class="logout" id="logout">Выйти</button>`;
  else box.innerHTML=`<button class="logout" id="loginSite">Войти</button>`;
  document.getElementById("logout")?.addEventListener("click",async()=>{await api("/api/auth/logout",{method:"POST"});localStorage.removeItem(tokenKey);location.href="/";});
  document.getElementById("loginSite")?.addEventListener("click",()=>openLogin());
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function openLogin(){
  const modal=document.createElement("div");modal.className="modal";modal.innerHTML=`<div class="modal-card"><h2>Войти в Iron Era</h2><input id="authUser" placeholder="Логин"><input id="authPass" type="password" placeholder="Пароль"><div style="display:flex;gap:6px;margin-top:8px"><button class="btn gold" id="authLogin">Войти</button><button class="btn" id="authReg">Регистрация</button></div><div id="authErr" style="color:#c87a70;margin-top:8px;font-size:11px"></div></div>`;document.body.appendChild(modal);
  async function run(path){const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:authUser.value,password:authPass.value})});const d=await r.json();if(!d.ok){authErr.textContent=d.error;return}localStorage.setItem(tokenKey,d.token);location.reload()}
  authLogin.onclick=()=>run("/api/auth/login");authReg.onclick=()=>run("/api/auth/register");
}
document.getElementById("loginBtn")?.addEventListener("click",openLogin);
loadMe();
