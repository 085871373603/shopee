(()=>{
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp=n=>'Rp'+Number(n||0).toLocaleString('id-ID');
const toB64=s=>btoa(unescape(encodeURIComponent(s)));
const fromB64=s=>decodeURIComponent(escape(atob(s.replace(/\s/g,''))));
const slug=s=>(s||'img').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30)||'img';
const LS='katalog_admin_cfg';

// ---------- Konfigurasi (owner/repo otomatis dari URL GitHub Pages) ----------
const guess=()=>{const h=location.hostname;if(!h.endsWith('.github.io'))return{};const seg=location.pathname.split('/')[1];return{owner:h.split('.')[0],repo:seg&&!seg.includes('.')?seg:h}};
let cfg={branch:'main',...guess(),...JSON.parse(localStorage.getItem(LS)||'{}')};
let data={store:{},products:[]},sha=null,dirty=false,edit=-1,pFile=null,lFile=null;
const prev={}; // path -> blob url (pratinjau gambar yang baru diunggah, sebelum Pages selesai deploy)
const src=p=>prev[p]||p;

// ---------- UI helper ----------
let tt;function toast(m,bad){const t=$('#toast');t.textContent=m;t.className='toast show'+(bad?' bad':'');clearTimeout(tt);tt=setTimeout(()=>t.className='toast',3200)}
const busy=(b,on)=>b.classList.toggle('busy',on);
function setDirty(v){dirty=v;$('#publish').disabled=!v}
addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});

// ---------- GitHub API ----------
async function api(path,method='GET',body){
  const r=await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`,{method,
    headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+cfg.token,...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined});
  if(!r.ok){const j=await r.json().catch(()=>({}));const e=new Error(j.message||r.statusText);e.status=r.status;throw e}
  return r.json();
}
async function pull(){
  try{const j=await api(`/contents/data/products.json?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`);sha=j.sha;data=JSON.parse(fromB64(j.content))}
  catch(e){if(e.status!==404)throw e;sha=null;data={store:{name:'Toko Saya',theme:'#ee4d2d'},products:[]}}
  data.store=data.store||{};data.products=data.products||[];
}
async function publish(){
  const b=$('#publish');busy(b,true);
  try{
    const body={message:'Update katalog '+new Date().toISOString().slice(0,16),content:toB64(JSON.stringify(data,null,2)),branch:cfg.branch};
    if(sha)body.sha=sha;
    const j=await api('/contents/data/products.json','PUT',body);
    sha=j.content.sha;setDirty(false);toast('Dipublikasikan. Katalog diperbarui dalam 1-2 menit.');
  }catch(e){toast(e.status===409||e.status===422?'Data di GitHub berubah. Muat ulang halaman lalu coba lagi.':'Gagal publikasi: '+e.message,true)}
  busy(b,false);
}

// ---------- Gambar: kompres lalu unggah ke repo ----------
const shrink=(f,max)=>new Promise((res,rej)=>{
  const i=new Image();
  i.onload=()=>{const k=Math.min(1,max/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=Math.round(i.width*k);c.height=Math.round(i.height*k);
    const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(i,0,0,c.width,c.height);
    c.toBlob(b=>b?res(b):rej(new Error('Gagal memproses gambar')),'image/jpeg',.82)};
  i.onerror=()=>rej(new Error('File bukan gambar yang valid'));i.src=URL.createObjectURL(f);
});
const blobB64=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b)});
async function upload(file,max,name){
  const blob=await shrink(file,max),path=`images/${Date.now()}-${slug(name)}.jpg`;
  await api('/contents/'+path,'PUT',{message:'Upload '+path,content:await blobB64(blob),branch:cfg.branch});
  prev[path]=URL.createObjectURL(blob);return path;
}

// ---------- Login ----------
function showLogin(){$('#login').hidden=false;$('#app').hidden=true;$('#fOwner').value=cfg.owner||'';$('#fRepo').value=cfg.repo||'';$('#fBranch').value=cfg.branch||'main';$('#fToken').value=''}
async function enter(){
  $('#login').hidden=true;$('#app').hidden=false;
  try{await pull()}catch(e){toast('Gagal memuat data: '+e.message,true)}
  renderList();fillStore();
}
$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const b=$('#loginBtn');busy(b,true);$('#loginErr').textContent='';
  const t={owner:$('#fOwner').value.trim(),repo:$('#fRepo').value.trim(),branch:$('#fBranch').value.trim(),token:$('#fToken').value.trim()};
  const old=cfg;cfg=t;
  try{
    const r=await api('');
    if(!r.permissions||!r.permissions.push)throw new Error('Token tidak punya izin tulis ke repo ini.');
    localStorage.setItem(LS,JSON.stringify(cfg));await enter();
  }catch(err){cfg=old;$('#loginErr').textContent=err.status===401?'Token salah atau kedaluwarsa.':err.status===404?'Repo tidak ditemukan. Periksa username, nama repo, dan izin token.':err.message}
  busy(b,false);
});
$('#logout').onclick=()=>{if(dirty&&!confirm('Ada perubahan yang belum dipublikasikan. Tetap keluar?'))return;localStorage.removeItem(LS);cfg={branch:'main',...guess()};setDirty(false);showLogin()};
$('#publish').onclick=publish;

// ---------- Tab ----------
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===b));
  $('#tab-products').hidden=b.dataset.t!=='products';$('#tab-store').hidden=b.dataset.t!=='store';
});

// ---------- Daftar produk ----------
function renderList(){
  const L=data.products,act=L.filter(p=>p.active!==false).length;
  $('#stats').textContent=`${L.length} produk, ${act} tampil di katalog`;
  $('#list').innerHTML=L.length?L.map((p,i)=>`
    <article class="item ${p.active===false?'off':''}">
      <div class="th">${p.image?`<img src="${esc(src(p.image))}" alt="">`:'🛍️'}</div>
      <div class="info"><b>${esc(p.name)}</b><span>${rp(p.price)}${p.category?' • '+esc(p.category):''}</span>
        <span class="tag ${p.active===false?'off':''}">${p.active===false?'Disembunyikan':'Tampil'}</span></div>
      <div class="acts" data-i="${i}">
        <button data-a="up" title="Naikkan" ${i===0?'disabled':''}>↑</button>
        <button data-a="down" title="Turunkan" ${i===L.length-1?'disabled':''}>↓</button>
        <button data-a="edit">Ubah</button><button data-a="del" class="del">Hapus</button>
      </div></article>`).join(''):'<div class="empty">Belum ada produk. Klik "Tambah produk" untuk mulai.</div>';
}
$('#list').addEventListener('click',e=>{
  const b=e.target.closest('button[data-a]');if(!b)return;
  const i=+b.parentElement.dataset.i,L=data.products,a=b.dataset.a;
  if(a==='edit')return openModal(i);
  if(a==='del'){if(!confirm(`Hapus "${L[i].name}"?`))return;L.splice(i,1)}
  if(a==='up'&&i>0)[L[i-1],L[i]]=[L[i],L[i-1]];
  if(a==='down'&&i<L.length-1)[L[i+1],L[i]]=[L[i],L[i+1]];
  setDirty(true);renderList();
});
$('#addBtn').onclick=()=>openModal(-1);

// ---------- Form produk ----------
function openModal(i){
  edit=i;pFile=null;const p=i>=0?data.products[i]:{active:true};
  $('#mTitle').textContent=i>=0?'Ubah produk':'Tambah produk';
  $('#pName').value=p.name||'';$('#pPrice').value=p.price??'';$('#pOld').value=p.oldPrice||'';
  $('#pCat').value=p.category||'';$('#pBadge').value=p.badge||'';$('#pDesc').value=p.desc||'';
  $('#pShopee').value=p.shopee||'';$('#pActive').checked=p.active!==false;$('#pFile').value='';
  $('#pPrev').innerHTML=p.image?`<img src="${esc(src(p.image))}" alt="">`:'🛍️';
  $('#cats').innerHTML=[...new Set(data.products.map(x=>x.category).filter(Boolean))].map(c=>`<option value="${esc(c)}">`).join('');
  $('#modal').hidden=false;
}
const closeModal=()=>$('#modal').hidden=true;
$('#mClose').onclick=closeModal;
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
$('#pFile').onchange=e=>{pFile=e.target.files[0]||null;if(pFile)$('#pPrev').innerHTML=`<img src="${URL.createObjectURL(pFile)}" alt="">`};
$('#pForm').addEventListener('submit',async e=>{
  e.preventDefault();const b=$('#pSave');
  const shopee=$('#pShopee').value.trim();
  if(!/^https?:\/\//i.test(shopee))return toast('Link Shopee harus diawali https://',true);
  busy(b,true);
  try{
    const old=edit>=0?data.products[edit]:{};
    let image=old.image||'';
    if(pFile){b.textContent='Mengunggah foto...';image=await upload(pFile,1000,$('#pName').value)}
    const p={id:old.id||'p'+Date.now().toString(36),name:$('#pName').value.trim(),price:+$('#pPrice').value||0,oldPrice:+$('#pOld').value||0,
      category:$('#pCat').value.trim(),badge:$('#pBadge').value.trim(),desc:$('#pDesc').value.trim(),image,shopee,active:$('#pActive').checked};
    edit>=0?data.products[edit]=p:data.products.push(p);
    setDirty(true);renderList();closeModal();toast('Produk disimpan. Klik Publikasikan untuk menayangkan.');
  }catch(err){toast('Gagal menyimpan: '+err.message,true)}
  b.textContent='Simpan produk';busy(b,false);
});

// ---------- Info toko ----------
function fillStore(){
  const s=data.store;$('#sName').value=s.name||'';$('#sTag').value=s.tagline||'';$('#sIg').value=s.instagram||'';
  $('#sShop').value=s.shopeeStore||'';$('#sTheme').value=s.theme||'#ee4d2d';
  $('#logoPrev').innerHTML=s.logo?`<img src="${esc(src(s.logo))}" alt="">`:'🏪';
}
$('#logoFile').onchange=e=>{lFile=e.target.files[0]||null;if(lFile)$('#logoPrev').innerHTML=`<img src="${URL.createObjectURL(lFile)}" alt="">`};
$('#storeForm').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.target.querySelector('.primary');busy(b,true);
  try{
    const s=data.store;
    if(lFile){s.logo=await upload(lFile,400,'logo');lFile=null}
    Object.assign(s,{name:$('#sName').value.trim(),tagline:$('#sTag').value.trim(),instagram:$('#sIg').value.trim(),shopeeStore:$('#sShop').value.trim(),theme:$('#sTheme').value});
    setDirty(true);toast('Info toko disimpan. Klik Publikasikan untuk menayangkan.');
  }catch(err){toast('Gagal menyimpan: '+err.message,true)}
  busy(b,false);
});

// ---------- PWA: service worker + popup install ----------
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
let dp=null;
const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
function showInstall(){
  if(standalone()||sessionStorage.getItem('instLater'))return;
  if(dp){$('#installBtn').hidden=false}
  else{$('#installBtn').hidden=true;$('#installTxt').textContent=ios?'Di Safari, ketuk tombol Bagikan lalu pilih "Tambah ke Layar Utama".':'Buka menu browser (titik tiga) lalu pilih "Instal aplikasi" atau "Tambahkan ke layar utama".'}
  $('#install').hidden=false;
}
addEventListener('beforeinstallprompt',e=>{e.preventDefault();dp=e;showInstall()});
addEventListener('appinstalled',()=>{$('#install').hidden=true;toast('Aplikasi admin terpasang')});
$('#installBtn').onclick=async()=>{if(!dp)return;dp.prompt();await dp.userChoice;dp=null;$('#install').hidden=true};
$('#installLater').onclick=()=>{sessionStorage.setItem('instLater','1');$('#install').hidden=true};
setTimeout(showInstall,900);

// ---------- Mulai ----------
cfg.token?enter():showLogin();
})();
