const TOKEN_KEY='ironEraToken';
function getToken(){return localStorage.getItem(TOKEN_KEY)||'';}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function toast(message,type='info',title){
  let stack=document.querySelector('.toast-stack');
  if(!stack){stack=document.createElement('div');stack.className='toast-stack';document.body.appendChild(stack);}
  const t=document.createElement('div');t.className=`toast ${type}`;
  t.innerHTML=`${title?`<b>${esc(title)}</b>`:''}${esc(message)}`;
  stack.appendChild(t);
  setTimeout(()=>{t.style.transition='opacity .3s ease, transform .3s ease';t.style.opacity='0';t.style.transform='translateX(24px)';setTimeout(()=>t.remove(),320);},4200);
}
async function api(path,options={}){
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  const t=getToken(); if(t)headers.Authorization=`Bearer ${t}`;
  return fetch(path,{...options,headers});
}
function showAuth(){
  const old=document.querySelector('.modal.auth-modal'); if(old)old.remove();
  const el=document.createElement('div'); el.className='modal auth-modal';
  el.innerHTML=`<div class="modal-card"><button class="close" id="authClose">×</button><h2>Войти в Iron Era</h2><p class="muted">Для игры нужен аккаунт.</p><input id="authUser" maxlength="20" placeholder="Логин"><input id="authPass" type="password" placeholder="Пароль"><div class="auth-actions"><button class="btn gold" id="authLogin">Войти</button><button class="btn" id="authRegister">Регистрация</button></div><div id="authError" class="error"></div></div>`;
  document.body.appendChild(el);
  authClose.onclick=()=>el.remove();
  async function submit(url){
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:authUser.value,password:authPass.value})});
    const d=await r.json(); if(!d.ok){authError.textContent=d.error;return;}
    localStorage.setItem(TOKEN_KEY,d.token); location.reload();
  }
  authLogin.onclick=()=>submit('/api/auth/login');
  authRegister.onclick=()=>submit('/api/auth/register');
}
async function refreshUserBox(){
  const box=document.getElementById('userBox'); if(!box)return;
  try{
    const r=await api('/api/me'); const d=await r.json();
    if(d.user){
      box.innerHTML=`<a class="user-link" href="/profile">${esc(d.user.username)}</a><button class="logout" id="logoutBtn">Выйти</button>`;
      document.getElementById('loginBtn')?.remove();
      document.getElementById('logoutBtn')?.addEventListener('click',async()=>{
        await api('/api/auth/logout',{method:'POST'});localStorage.removeItem(TOKEN_KEY);location.reload();
      });
    }else if(document.getElementById('loginBtn')){
      document.getElementById('loginBtn').style.display='inline-flex';
    }
  }catch{}
}
document.getElementById('loginBtn')?.addEventListener('click',showAuth);
refreshUserBox();
