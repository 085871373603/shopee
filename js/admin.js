(()=>{
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp=n=>'Rp'+Number(n||0).toLocaleString('id-ID');
const slug=s=>(s||'img').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30)||'img';
const toB64=s=>{const b=new TextEncoder().encode(s);let r='';for(let i=0;i<b.length;i+=0x8000)r+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(r)};
const fromB64=s=>{const b=atob(s.replace(/\s/g,''));return new TextDecoder().decode(Uint8Array.from(b,c=>c.charCodeAt(0)))};
const fixUrl=v=>{v=(v||'').trim();return v&&!/^https?:\/\//i.test(v)?'https://'+v:v};
const validUrl=v=>{try{const u=new URL(v);return u.protocol==='https:'||u.protocol==='http:'}catch(e){return false}};
const errMsg=e=>e.status===401?'Token tidak valid atau kedaluwarsa. Klik Keluar lalu masuk dengan token baru.':e.status===403?'Token tidak punya izin tulis, atau akses GitHub dibatasi sementara.':e.message;

// ---------- Penyimpanan lokal (aman bila localStorage diblokir / rusak) ----------
const LS='katalog_admin_cfg';
const ls={get(){try{return JSON.parse(localStorage.getItem(LS)||'{}')||{}}catch(e){return{}}},set(v){try{localStorage.setItem(LS,JSON.stringify(v))}catch(e){}},del(){try{localStorage.removeItem(LS)}catch(e){}}};

// ---------- State ----------
const guess=()=>{const h=location.hostname;if(!h.endsWith('.github.io'))return{};const seg=location.pathname.split('/')[1];return{owner:h.split('.')[0],repo:seg&&!seg.includes('.')?seg:h}};
let cfg={branch:'main',...guess(),...ls.get()};
let data={store:{},products:[]},sha=null,loaded=false,dirty=false,storeEdited=false;
let edit=-1,pFile=null,lFile=null,hFile=null,hDel=false;
const prev={};                       // path -> blob url (pratinjau sebelum Pages selesai deploy)
const src=p=>prev[p]||p;

// ---------- UI helper ----------
let tt;function toast(m,bad){const t=$('#toast');t.textContent=m;t.className='toast show'+(bad?' bad':'');clearTimeout(tt);tt=setTimeout(()=>t.className='toast',3600)}
const busy=(b,on)=>b.classList.toggle('busy',on);
const isBusy=b=>b.classList.contains('busy');
function setDirty(v){dirty=v;$('#publish').disabled=!v}
addEventListener('beforeunload',e=>{if(dirty||storeEdited){e.preventDefault();e.returnValue=''}});
const wait=ms=>new Promise(r=>setTimeout(r,ms));

// ---------- GitHub API ----------
async function api(path,method='GET',body,retry=true){
  let r;
  try{
    r=await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${path}`,{method,cache:'no-store',
      headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+cfg.token,...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined});
  }catch(e){throw new Error('Tidak bisa terhubung ke GitHub. Periksa koneksi internet.')}
  if(!r.ok){
    if(r.status===409&&method==='PUT'&&retry){await wait(900);return api(path,method,body,false)}   // bentrok commit beruntun
    const j=await r.json().catch(()=>({}));const e=new Error(j.message||r.statusText);e.status=r.status;throw e;
  }
  return r.json();
}
async function pull(){
  try{
    const j=await api(`/contents/data/products.json?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`);
    sha=j.sha;data=JSON.parse(fromB64(j.content));
  }catch(e){
    if(e.status!==404)throw e;
    sha=null;data={store:{name:'Toko Saya',theme:'#ee4d2d'},products:[]};   // file belum ada: mulai dari kosong
  }
  if(!data||typeof data!=='object')data={};
  data.store=data.store||{};data.products=Array.isArray(data.products)?data.products:[];
}
async function publish(){
  const b=$('#publish');if(isBusy(b))return;
  if(!loaded)return toast('Data belum termuat. Muat ulang halaman sebelum publikasi.',true);
  if(storeEdited){document.querySelector('.tab[data-t=store]').click();return toast('Ada perubahan Info toko yang belum disimpan. Klik "Simpan info toko" dulu.',true)}
  busy(b,true);
  try{
    const body={message:'Update katalog '+new Date().toISOString().slice(0,16),content:toB64(JSON.stringify(data,null,2)),branch:cfg.branch};
    if(sha)body.sha=sha;
    const j=await api('/contents/data/products.json','PUT',body);
    sha=j.content.sha;setDirty(false);toast('Dipublikasikan. Katalog diperbarui dalam 1-2 menit.');
  }catch(e){toast(e.status===409||e.status===422?'Data di GitHub sudah berubah. Muat ulang halaman lalu coba lagi.':'Gagal publikasi: '+errMsg(e),true)}
  busy(b,false);
}

// ---------- Gambar: kompres lalu unggah ----------
const shrink=(f,max)=>new Promise((res,rej)=>{
  const i=new Image(),u=URL.createObjectURL(f);
  i.onload=()=>{
    URL.revokeObjectURL(u);
    if(!i.width||!i.height)return rej(new Error('Ukuran gambar tidak valid'));
    const k=Math.min(1,max/Math.max(i.width,i.height)),c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(i.width*k));c.height=Math.max(1,Math.round(i.height*k));
    const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(i,0,0,c.width,c.height);
    c.toBlob(b=>b?res(b):rej(new Error('Gagal memproses gambar')),'image/jpeg',.82);
  };
  i.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('File bukan gambar yang didukung (gunakan JPG, PNG, atau WebP)'))};
  i.src=u;
});
const blobB64=b=>new Promise((res,rej)=>{const f=new FileReader();f.onload=()=>res(f.result.split(',')[1]);f.onerror=()=>rej(new Error('Gagal membaca gambar'));f.readAsDataURL(b)});
async function upload(file,max,name){
  const blob=await shrink(file,max),path=`images/${Date.now()}-${slug(name)}.jpg`;
  await api('/contents/'+path,'PUT',{message:'Upload '+path,content:await blobB64(blob),branch:cfg.branch});
  prev[path]=URL.createObjectURL(blob);return path;
}

// ---------- Login ----------
function showLogin(){
  $('#login').hidden=false;$('#app').hidden=true;
  $('#fOwner').value=cfg.owner||'';$('#fRepo').value=cfg.repo||'';$('#fBranch').value=cfg.branch||'main';$('#fToken').value='';
}
async function enter(){
  $('#login').hidden=true;$('#app').hidden=false;
  try{await pull();loaded=true}catch(e){loaded=false;toast('Gagal memuat data: '+errMsg(e),true)}
  renderList();fillStore();
}
$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const b=$('#loginBtn');if(isBusy(b))return;
  busy(b,true);$('#loginErr').textContent='';
  const old=cfg;
  cfg={owner:$('#fOwner').value.trim(),repo:$('#fRepo').value.trim(),branch:$('#fBranch').value.trim()||'main',token:$('#fToken').value.trim()};
  let ok=false;
  try{
    const r=await api('');
    if(r.permissions&&r.permissions.push===false)throw new Error('Token tidak punya izin tulis ke repo ini. Aktifkan Contents: Read and write.');
    ls.set(cfg);ok=true;
  }catch(err){
    cfg=old;
    $('#loginErr').textContent=err.status===401?'Token salah atau kedaluwarsa.':err.status===404?'Repo tidak ditemukan. Periksa username, nama repo, dan izin token.':errMsg(err);
  }
  busy(b,false);
  if(ok)await enter();
});
$('#logout').onclick=()=>{
  if((dirty||storeEdited)&&!confirm('Ada perubahan yang belum dipublikasikan. Tetap keluar?'))return;
  ls.del();cfg={branch:'main',...guess()};data={store:{},products:[]};sha=null;loaded=false;
  setDirty(false);storeEdited=false;showLogin();
};
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
document.addEventListener('error',e=>{const t=e.target;if(t&&t.tagName==='IMG'&&t.closest('.th'))t.replaceWith('🛍️')},true);
$('#list').addEventListener('click',e=>{
  const b=e.target.closest('button[data-a]');if(!b)return;
  const i=+b.parentElement.dataset.i,L=data.products,a=b.dataset.a;
  if(a==='edit')return openModal(i);
  if(a==='del'){if(!confirm(`Hapus "${L[i].name}"?`))return;L.splice(i,1)}
  else if(a==='up'&&i>0){const t=L[i-1];L[i-1]=L[i];L[i]=t}
  else if(a==='down'&&i<L.length-1){const t=L[i+1];L[i+1]=L[i];L[i]=t}
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
  $('#modal').hidden=false;$('#pName').focus();
}
const closeModal=()=>{$('#modal').hidden=true};
$('#mClose').onclick=closeModal;
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modal').hidden)closeModal()});
$('#pFile').onchange=e=>{pFile=e.target.files[0]||null;if(pFile)$('#pPrev').innerHTML=`<img src="${URL.createObjectURL(pFile)}" alt="">`};
$('#pForm').addEventListener('submit',async e=>{
  e.preventDefault();const b=$('#pSave');if(isBusy(b))return;
  const name=$('#pName').value.trim(),shopee=fixUrl($('#pShopee').value);
  if(!name)return toast('Nama produk wajib diisi',true);
  if(!validUrl(shopee))return toast('Link Shopee tidak valid. Salin ulang dari aplikasi atau situs Shopee.',true);
  busy(b,true);
  try{
    const old=edit>=0?data.products[edit]:{};
    let image=old.image||'';
    if(pFile){b.textContent='Mengunggah foto...';image=await upload(pFile,1000,name)}
    const p={id:old.id||'p'+Date.now().toString(36),name,price:Math.max(0,+$('#pPrice').value||0),oldPrice:Math.max(0,+$('#pOld').value||0),
      category:$('#pCat').value.trim(),badge:$('#pBadge').value.trim(),desc:$('#pDesc').value.trim(),image,shopee,active:$('#pActive').checked};
    if(edit>=0)data.products[edit]=p;else data.products.push(p);
    pFile=null;setDirty(true);renderList();closeModal();toast('Produk disimpan. Klik Publikasikan untuk menayangkan.');
  }catch(err){toast('Gagal menyimpan: '+errMsg(err),true)}
  b.textContent='Simpan produk';busy(b,false);
});

// ---------- Info toko ----------
const ROLES=['Seller','Agen','Distributor'];
const normPhone=v=>{let d=String(v||'').replace(/\D/g,'');if(d.startsWith('0'))d='62'+d.slice(1);else if(d.startsWith('8'))d='62'+d;return d};
function contactRow(c={}){
  const d=document.createElement('div');d.className='crow';
  d.innerHTML=`<input class="cn" placeholder="Nama kontak" maxlength="40" value="${esc(c.name||'')}">
    <select class="cr" aria-label="Peran">${ROLES.map(r=>`<option ${r===c.role?'selected':''}>${r}</option>`).join('')}</select>
    <input class="cp" type="tel" inputmode="tel" placeholder="08xxxxxxxxxx" value="${esc(c.phone||'')}">
    <button type="button" class="x cd" aria-label="Hapus kontak">×</button>`;
  return d;
}
function setHdrPrev(p){const h=$('#hdrPrev');h.style.backgroundImage=p?`url("${src(p)}")`:'';h.textContent=p?'':'Belum ada foto'}
function fillStore(){
  const s=data.store;$('#sName').value=s.name||'';$('#sTag').value=s.tagline||'';$('#sIg').value=s.instagram||'';
  $('#sShop').value=s.shopeeStore||'';$('#sTheme').value=/^#[0-9a-f]{6}$/i.test(s.theme||'')?s.theme:'#ee4d2d';
  $('#logoPrev').innerHTML=s.logo?`<img src="${esc(src(s.logo))}" alt="">`:'🏪';
  setHdrPrev(s.headerImage);hFile=null;hDel=false;lFile=null;$('#hdrFile').value='';$('#logoFile').value='';
  $('#contacts').replaceChildren(...(Array.isArray(s.contacts)?s.contacts:[]).map(contactRow));
  storeEdited=false;
}
const markStore=()=>{storeEdited=true};
$('#storeForm').addEventListener('input',markStore);
$('#storeForm').addEventListener('change',markStore);
$('#logoFile').onchange=e=>{lFile=e.target.files[0]||null;if(lFile)$('#logoPrev').innerHTML=`<img src="${URL.createObjectURL(lFile)}" alt="">`};
$('#hdrFile').onchange=e=>{hFile=e.target.files[0]||null;if(hFile){hDel=false;setHdrPrev(URL.createObjectURL(hFile))}};
$('#hdrDel').onclick=()=>{hFile=null;hDel=true;$('#hdrFile').value='';setHdrPrev('');markStore()};
$('#addContact').onclick=()=>{$('#contacts').append(contactRow());markStore()};
$('#contacts').addEventListener('click',e=>{if(e.target.closest('.cd')){e.target.closest('.crow').remove();markStore()}});
$('#storeForm').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.target.querySelector('button.primary');if(isBusy(b))return;
  const ig=fixUrl($('#sIg').value),shop=fixUrl($('#sShop').value);
  if((ig&&!validUrl(ig))||(shop&&!validUrl(shop)))return toast('Link Instagram atau Shopee tidak valid',true);
  const rows=[...document.querySelectorAll('#contacts .crow')];
  const contacts=rows.map(r=>({role:r.querySelector('.cr').value,phone:normPhone(r.querySelector('.cp').value),name:r.querySelector('.cn').value.trim()||r.querySelector('.cr').value}))
    .filter(c=>c.phone.length>=9&&c.phone.length<=15);
  busy(b,true);
  try{
    const s=data.store;
    if(lFile){s.logo=await upload(lFile,400,'logo');lFile=null}
    if(hFile){s.headerImage=await upload(hFile,1600,'header');hFile=null}else if(hDel)s.headerImage='';
    Object.assign(s,{name:$('#sName').value.trim(),tagline:$('#sTag').value.trim(),instagram:ig,shopeeStore:shop,theme:$('#sTheme').value,contacts});
    fillStore();setDirty(true);
    toast(contacts.length<rows.length?'Tersimpan. Kontak dengan nomor tidak valid dilewati. Klik Publikasikan.':'Info toko disimpan. Klik Publikasikan untuk menayangkan.');
  }catch(err){toast('Gagal menyimpan: '+errMsg(err),true)}
  busy(b,false);
});

// ---------- PWA: service worker + popup install ----------
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').then(r=>r.update()).catch(()=>{}));
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
let dp=null;
function showInstall(){
  if(standalone()||sessionStorage.getItem('instLater'))return;
  if(dp){$('#installBtn').hidden=false;$('#installTxt').textContent='Pasang di perangkatmu agar admin bisa dibuka cepat seperti aplikasi biasa.'}
  else{$('#installBtn').hidden=true;$('#installTxt').textContent=ios?'Di Safari, ketuk tombol Bagikan lalu pilih "Tambah ke Layar Utama".':'Buka menu browser (titik tiga) lalu pilih "Instal aplikasi" atau "Tambahkan ke layar utama".'}
  $('#install').hidden=false;
}
addEventListener('beforeinstallprompt',e=>{e.preventDefault();dp=e;showInstall()});
addEventListener('appinstalled',()=>{$('#install').hidden=true;toast('Aplikasi admin terpasang')});
$('#installBtn').onclick=async()=>{if(!dp)return;dp.prompt();try{await dp.userChoice}catch(e){}dp=null;$('#install').hidden=true};
$('#installLater').onclick=()=>{try{sessionStorage.setItem('instLater','1')}catch(e){}$('#install').hidden=true};
setTimeout(showInstall,900);

// ---------- Mulai ----------
cfg.token?enter():showLogin();
})();
