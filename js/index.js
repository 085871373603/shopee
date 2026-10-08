(()=>{
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp=n=>'Rp'+Number(n||0).toLocaleString('id-ID');
const url=u=>/^https?:\/\//i.test(u||'')?u:'#';
const tel=v=>{let d=String(v||'').replace(/\D/g,'');if(d.startsWith('0'))d='62'+d.slice(1);else if(d.startsWith('8'))d='62'+d;return d};
const DAY=864e5,BEST=/laris|best\s*seller|favorit|populer|\bhot\b/i;
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const FM={populer:'pop',baru:'new',diskon:'sale'},SORTS=['','baru','populer','murah','mahal'];

/* State filter dibaca dari URL, sehingga link seperti index.html?f=populer bisa ditaruh di bio/story Instagram */
const P=new URLSearchParams(location.search);
let D={store:{},products:[]},newDays=14,opener=null;
let flt=FM[P.get('f')]||(P.get('kat')?'cat:'+P.get('kat'):'all'),q=(P.get('q')||'').slice(0,60),sort=SORTS.includes(P.get('urut'))?P.get('urut'):'';

/* ---------- Anti salin ---------- */
const field=t=>{const el=t&&t.nodeType===1?t:t&&t.parentElement;return !!(el&&el.closest('input,textarea,select'))};
['contextmenu','copy','cut','dragstart'].forEach(ev=>document.addEventListener(ev,e=>{if(!field(e.target))e.preventDefault()}));
document.addEventListener('selectstart',e=>{if(!field(e.target))e.preventDefault()});
document.addEventListener('keydown',e=>{
  const k=(e.key||'').toLowerCase(),m=e.ctrlKey||e.metaKey;
  if(k==='escape'){closeP();$('#waPanel').hidden=true;return}
  if(k==='f12'||(m&&['u','s','p'].includes(k))||(m&&e.shiftKey&&['i','j','c'].includes(k))||(m&&['c','x','a'].includes(k)&&!field(e.target)))e.preventDefault();
});
document.addEventListener('error',e=>{
  const t=e.target;if(!t||t.tagName!=='IMG')return;
  if(t.id==='logo'){t.hidden=true;return}
  if(t.closest('.ph,.m-ph'))t.replaceWith('🛍️');
},true);

/* ---------- Algoritma label produk ----------
   Baru    : umur produk (sejak createdAt) <= newDays (atur di admin, default 14 hari)
   Populer : ditandai admin (popular), atau label berisi "Terlaris/Best Seller/Hot/Favorit"
   Diskon  : harga coret > harga jual
   Skor populer = flag populer (100) + diskon (maks 30) + bonus kebaruan (maks 20, menurun tiap hari)
   Kategori lama bernama "Baru"/"Populer" otomatis dikonversi menjadi label, bukan kategori. */
function enrich(p){
  const cat=String(p.category||'').trim(),lNew=/^baru$/i.test(cat),lPop=/^populer$/i.test(cat),t=Date.parse(p.createdAt);
  p._off=p.oldPrice>p.price?Math.round((1-p.price/p.oldPrice)*100):0;
  p._age=isNaN(t)?(lNew?0:1e9):Math.max(0,(Date.now()-t)/DAY);
  p._new=p._age<=newDays;
  p._pop=p.popular===true||lPop||BEST.test(p.badge||'');
  p._cat=lNew||lPop?'':cat;
  p._score=(p._pop?100:0)+Math.min(p._off,60)*.5+(p._new?Math.max(0,20-p._age):0);
  p._name=norm(p.name);p._cn=norm(p._cat);
  p._hay=norm([p.name,p._cat,p.badge,p.desc].join(' '));   // dihitung sekali, pencarian tinggal includes()
}

async function load(){
  try{
    const r=await fetch('data/products.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw 0;
    D=await r.json();
    if(!D||typeof D!=='object')D={};
    D.store=D.store||{};D.products=(Array.isArray(D.products)?D.products:[]).filter(p=>p&&typeof p==='object');
  }catch(e){$('#grid').innerHTML='';$('#count').textContent='';$('#empty').hidden=false;$('#empty').textContent='Katalog belum bisa dimuat. Muat ulang halaman.';return}
  newDays=Math.min(90,Math.max(1,+D.store.newDays||14));
  D.products.forEach(enrich);
  header();$('#q').value=q;$('#sort').value=sort;render();whatsapp();
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
    hero.style.backgroundImage=`linear-gradient(180deg,rgba(20,33,61,.40),rgba(20,33,61,.85)),url("${String(s.headerImage).replace(/["\\\n\r]/g,'')}")`;
    hero.classList.add('has-img');
  }else{hero.style.backgroundImage='';hero.classList.remove('has-img')}
  const links=[];
  if(s.shopeeStore)links.push(['Toko Shopee',s.shopeeStore]);
  if(s.instagram)links.push(['Instagram',s.instagram]);
  $('#links').innerHTML=links.map(([t,u])=>`<a href="${esc(url(u))}" target="_blank" rel="noopener">${t}</a>`).join('');
}

const SORT_FN={
  rel:(a,b)=>b._rel-a._rel,
  baru:(a,b)=>a._age-b._age,
  populer:(a,b)=>b._score-a._score,
  diskon:(a,b)=>b._off-a._off,
  murah:(a,b)=>a.price-b.price,
  mahal:(a,b)=>b.price-a.price
};
function syncURL(){
  const u=new URLSearchParams();
  if(flt==='pop')u.set('f','populer');else if(flt==='new')u.set('f','baru');else if(flt==='sale')u.set('f','diskon');else if(flt.startsWith('cat:'))u.set('kat',flt.slice(4));
  if(q)u.set('q',q);if(sort)u.set('urut',sort);
  try{history.replaceState(null,'',location.pathname+(u.toString()?'?'+u:''))}catch(e){}
}

function render(){
  const all=D.products.filter(p=>p.active!==false);
  const nPop=all.filter(p=>p._pop).length,nNew=all.filter(p=>p._new).length,nSale=all.filter(p=>p._off>0).length;
  const cats=new Map();all.forEach(p=>{if(p._cat)cats.set(p._cat,(cats.get(p._cat)||0)+1)});
  const valid=flt==='all'||(flt==='pop'&&nPop)||(flt==='new'&&nNew)||(flt==='sale'&&nSale)||(flt.startsWith('cat:')&&cats.has(flt.slice(4)));
  if(!valid)flt='all';

  const chip=(k,label,n,cls='')=>`<button class="chip ${cls} ${flt===k?'on':''}" data-f="${esc(k)}" aria-pressed="${flt===k}">${label}<small>${n}</small></button>`;
  let h='';
  if(nPop||nNew||nSale||cats.size>1){
    h=chip('all','Semua',all.length);
    if(nPop)h+=chip('pop','🔥 Populer',nPop,'smart');
    if(nNew)h+=chip('new','✨ Baru',nNew,'smart');
    if(nSale)h+=chip('sale','🏷️ Diskon',nSale,'smart');
    if(cats.size)h+='<span class="sep"></span>'+[...cats].map(([c,n])=>chip('cat:'+c,esc(c),n)).join('');
  }
  $('#chips').innerHTML=h;

  const tk=norm(q).split(/\s+/).filter(Boolean);
  const inFilter=p=>flt==='all'||(flt==='pop'?p._pop:flt==='new'?p._new:flt==='sale'?p._off>0:p._cat===flt.slice(4));
  const order=new Map(all.map((p,i)=>[p,i]));
  const list=all.filter(p=>inFilter(p)&&tk.every(t=>p._hay.includes(t)));
  if(tk.length)list.forEach(p=>{p._rel=tk.reduce((s,t)=>s+1+(p._name.includes(t)?3:0)+(p._cn.includes(t)?2:0),0)});
  const key=sort||(tk.length?'rel':({pop:'populer',new:'baru',sale:'diskon'})[flt]||'');
  if(key)list.sort((a,b)=>SORT_FN[key](a,b)||order.get(a)-order.get(b));   // seri -> urutan pilihan toko

  $('#count').textContent=list.length+' produk';
  $('#empty').hidden=list.length>0;
  $('#empty').innerHTML=all.length?'Produk tidak ditemukan. <button class="link" id="reset">Hapus filter</button>':'Belum ada produk yang ditampilkan.';
  $('#grid').innerHTML=list.map(p=>{
    const bd=p.badge||(p._new?'Baru':p._pop?'Populer':'');
    return `
    <article class="card" data-i="${D.products.indexOf(p)}" tabindex="0" role="button" aria-label="Lihat detail ${esc(p.name)}">
      <div class="ph">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" draggable="false">`:'🛍️'}${bd?`<span class="badge">${esc(bd)}</span>`:''}</div>
      <div class="body">
        <h2 class="name">${esc(p.name)}</h2>
        ${p.desc?`<div class="desc">${esc(p.desc)}</div>`:''}
        <div class="pr"><span class="price">${rp(p.price)}</span>${p._off?`<span class="old">${rp(p.oldPrice)}</span>`:''}</div>
        <span class="more">Lihat detail</span>
        <a class="buy" href="${esc(url(p.shopee))}" target="_blank" rel="noopener nofollow">Beli di Shopee</a>
      </div>
    </article>`}).join('');
  syncURL();
}

/* ---------- Popup detail produk ---------- */
function openP(i){
  const p=D.products[i];if(!p)return;
  opener=document.activeElement;
  $('#mBody').innerHTML=`
    <div class="m-ph">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}" draggable="false">`:'<span>🛍️</span>'}${p.badge?`<span class="badge">${esc(p.badge)}</span>`:''}</div>
    <div class="m-info">
      <div class="m-tags">${p._new?'<span class="pill n">✨ Baru</span>':''}${p._pop?'<span class="pill p">🔥 Populer</span>':''}${p._cat?`<span class="m-cat">${esc(p._cat)}</span>`:''}</div>
      <h2 id="mName">${esc(p.name)}</h2>
      <div class="m-price"><span class="price">${rp(p.price)}</span>${p._off?`<span class="old">${rp(p.oldPrice)}</span><span class="off">-${p._off}%</span>`:''}</div>
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

/* ---------- Kontrol filter ---------- */
$('#chips').addEventListener('click',e=>{const b=e.target.closest('.chip');if(b){flt=b.dataset.f;render()}});
$('#sort').addEventListener('change',e=>{sort=e.target.value;render()});
$('#empty').addEventListener('click',e=>{if(e.target.id==='reset'){flt='all';q='';sort='';$('#q').value='';$('#sort').value='';render()}});
let tm;$('#q').addEventListener('input',e=>{clearTimeout(tm);tm=setTimeout(()=>{q=e.target.value.trim().slice(0,60);render()},150)});
load();
})();
