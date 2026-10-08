(()=>{
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp=n=>'Rp'+Number(n||0).toLocaleString('id-ID');
const url=u=>/^https?:\/\//i.test(u||'')?u:'#';
const tel=v=>{let d=String(v||'').replace(/\D/g,'');if(d.startsWith('0'))d='62'+d.slice(1);else if(d.startsWith('8'))d='62'+d;return d};
let D={store:{},products:[]},cat='Semua',q='',opener=null;

/* ---------- Anti salin ---------- */
const field=t=>{const el=t&&t.nodeType===1?t:t&&t.parentElement;return !!(el&&el.closest('input,textarea'))};
['contextmenu','copy','cut','dragstart'].forEach(ev=>document.addEventListener(ev,e=>{if(!field(e.target))e.preventDefault()}));
document.addEventListener('selectstart',e=>{if(!field(e.target))e.preventDefault()});
document.addEventListener('keydown',e=>{
  const k=(e.key||'').toLowerCase(),m=e.ctrlKey||e.metaKey;
  if(k==='escape'){closeP();$('#waPanel').hidden=true;return}
  if(k==='f12'||(m&&['u','s','p'].includes(k))||(m&&e.shiftKey&&['i','j','c'].includes(k))||(m&&['c','x','a'].includes(k)&&!field(e.target)))e.preventDefault();
});

/* Gambar gagal dimuat (mis. belum selesai deploy) -> tampilkan ikon pengganti */
document.addEventListener('error',e=>{
  const t=e.target;if(!t||t.tagName!=='IMG')return;
  if(t.id==='logo'){t.hidden=true;return}
  if(t.closest('.ph,.m-ph'))t.replaceWith('🛍️');
},true);

async function load(){
  try{
    const r=await fetch('data/products.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw 0;
    D=await r.json();
    if(!D||typeof D!=='object')D={};
    D.store=D.store||{};D.products=Array.isArray(D.products)?D.products:[];
  }catch(e){$('#grid').innerHTML='';$('#count').textContent='';$('#empty').hidden=false;$('#empty').textContent='Katalog belum bisa dimuat. Muat ulang halaman.';return}
  header();render();whatsapp();
}

function header(){
  const s=D.store;
  document.title=(s.name||'Katalog')+' | Katalog Produk';
  $('#storeName').textContent=s.name||'Katalog';
  $('#tagline').textContent=s.tagline||'';
  if(/^#[0-9a-f]{3,8}$/i.test(s.theme||'')){document.documentElement.style.setProperty('--accent',s.theme);document.querySelector('meta[name=theme-color]').content=s.theme}
  if(s.logo){const l=$('#logo');l.src=s.logo;l.alt=s.name||'';l.hidden=false}
  const hero=$('.hero');
  if(s.headerImage){
    // inline style (bukan CSS variable) agar path relatif dihitung dari halaman, bukan dari folder css/
    hero.style.backgroundImage=`linear-gradient(180deg,rgba(20,33,61,.40),rgba(20,33,61,.85)),url("${String(s.headerImage).replace(/["\\\n\r]/g,'')}")`;
    hero.classList.add('has-img');
  }else{hero.style.backgroundImage='';hero.classList.remove('has-img')}
  const links=[];
  if(s.shopeeStore)links.push(['Toko Shopee',s.shopeeStore]);
  if(s.instagram)links.push(['Instagram',s.instagram]);
  $('#links').innerHTML=links.map(([t,u])=>`<a href="${esc(url(u))}" target="_blank" rel="noopener">${t}</a>`).join('');
}

function render(){
  const all=D.products.filter(p=>p&&p.active!==false);
  const cats=['Semua',...new Set(all.map(p=>p.category).filter(Boolean))];
  if(!cats.includes(cat))cat='Semua';
  $('#chips').innerHTML=cats.length>2?cats.map(c=>`<button class="chip ${c===cat?'on':''}" data-c="${esc(c)}">${esc(c)}</button>`).join(''):'';
  const list=all.filter(p=>(cat==='Semua'||p.category===cat)&&((p.name||'')+' '+(p.desc||'')).toLowerCase().includes(q));
  $('#count').textContent=list.length+' produk';
  $('#empty').hidden=list.length>0;
  $('#empty').textContent=all.length?'Produk tidak ditemukan. Coba kata kunci atau kategori lain.':'Belum ada produk yang ditampilkan.';
  $('#grid').innerHTML=list.map(p=>`
    <article class="card" data-i="${D.products.indexOf(p)}" tabindex="0" role="button" aria-label="Lihat detail ${esc(p.name)}">
      <div class="ph">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" draggable="false">`:'🛍️'}${p.badge?`<span class="badge">${esc(p.badge)}</span>`:''}</div>
      <div class="body">
        <h2 class="name">${esc(p.name)}</h2>
        ${p.desc?`<div class="desc">${esc(p.desc)}</div>`:''}
        <div class="pr"><span class="price">${rp(p.price)}</span>${p.oldPrice>p.price?`<span class="old">${rp(p.oldPrice)}</span>`:''}</div>
        <span class="more">Lihat detail</span>
        <a class="buy" href="${esc(url(p.shopee))}" target="_blank" rel="noopener nofollow">Beli di Shopee</a>
      </div>
    </article>`).join('');
}

/* ---------- Popup detail produk ---------- */
function openP(i){
  const p=D.products[i];if(!p)return;
  opener=document.activeElement;
  const off=p.oldPrice>p.price?Math.round((1-p.price/p.oldPrice)*100):0;
  $('#mBody').innerHTML=`
    <div class="m-ph">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}" draggable="false">`:'<span>🛍️</span>'}${p.badge?`<span class="badge">${esc(p.badge)}</span>`:''}</div>
    <div class="m-info">
      ${p.category?`<span class="m-cat">${esc(p.category)}</span>`:''}
      <h2 id="mName">${esc(p.name)}</h2>
      <div class="m-price"><span class="price">${rp(p.price)}</span>${off?`<span class="old">${rp(p.oldPrice)}</span><span class="off">-${off}%</span>`:''}</div>
      <h3>Deskripsi produk</h3>
      <p class="m-desc">${p.desc?esc(p.desc):'Belum ada deskripsi untuk produk ini.'}</p>
      <a class="buy" href="${esc(url(p.shopee))}" target="_blank" rel="noopener nofollow">Beli di Shopee</a>
      <small class="m-note">Pembayaran dan pengiriman diproses oleh Shopee.</small>
    </div>`;
  $('#modal').hidden=false;document.body.classList.add('lock');$('#mClose').focus();
}
function closeP(){
  const m=$('#modal');if(m.hidden)return;
  m.hidden=true;document.body.classList.remove('lock');
  if(opener&&opener.focus)opener.focus();opener=null;
}
$('#grid').addEventListener('click',e=>{const c=e.target.closest('.card');if(c&&!e.target.closest('.buy'))openP(+c.dataset.i)});
$('#grid').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.classList.contains('card')){e.preventDefault();openP(+e.target.dataset.i)}});
$('#mClose').onclick=closeP;
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeP()});

/* ---------- Balon WhatsApp ---------- */
function whatsapp(){
  const cs=(Array.isArray(D.store.contacts)?D.store.contacts:[]).filter(c=>c&&tel(c.phone).length>=9);
  $('#wa').hidden=!cs.length;
  $('#waList').innerHTML=cs.map(c=>{
    const txt=`Halo ${c.name||''}, saya tertarik dengan produk di katalog ${D.store.name||''}.`;
    const ini=((c.name||c.role||'?').trim()[0]||'?').toUpperCase();
    return `<a class="wa-item" href="https://wa.me/${tel(c.phone)}?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">
      <span class="wa-av">${esc(ini)}</span><span><b>${esc(c.name||c.role)}</b><small>${esc(c.role||'Seller')}</small></span></a>`}).join('');
}
$('#waBtn').onclick=()=>{$('#waPanel').hidden=!$('#waPanel').hidden};
document.addEventListener('click',e=>{if(!e.target.closest('#wa'))$('#waPanel').hidden=true});

$('#chips').addEventListener('click',e=>{const b=e.target.closest('.chip');if(b){cat=b.dataset.c;render()}});
$('#q').addEventListener('input',e=>{q=e.target.value.trim().toLowerCase();render()});
load();
})();
