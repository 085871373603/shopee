(()=>{
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp=n=>'Rp'+Number(n||0).toLocaleString('id-ID');
const url=u=>/^https?:\/\//i.test(u||'')?u:'#';
let D={store:{},products:[]},cat='Semua',q='';

async function load(){
  try{
    const r=await fetch('data/products.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw 0;
    D=await r.json();
  }catch(e){$('#grid').innerHTML='';$('#empty').hidden=false;$('#empty').textContent='Katalog belum bisa dimuat. Muat ulang halaman.';return}
  header();render();
}

function header(){
  const s=D.store||{};
  document.title=(s.name||'Katalog')+' | Katalog Produk';
  $('#storeName').textContent=s.name||'Katalog';
  $('#tagline').textContent=s.tagline||'';
  if(s.theme){document.documentElement.style.setProperty('--accent',s.theme);document.querySelector('meta[name=theme-color]').content=s.theme}
  if(s.logo){const l=$('#logo');l.src=s.logo;l.alt=s.name||'';l.hidden=false}
  const links=[];
  if(s.shopeeStore)links.push(['Toko Shopee',s.shopeeStore]);
  if(s.instagram)links.push(['Instagram',s.instagram]);
  $('#links').innerHTML=links.map(([t,u])=>`<a href="${esc(url(u))}" target="_blank" rel="noopener">${t}</a>`).join('');
}

function render(){
  const all=(D.products||[]).filter(p=>p.active!==false);
  const cats=['Semua',...new Set(all.map(p=>p.category).filter(Boolean))];
  if(!cats.includes(cat))cat='Semua';
  $('#chips').innerHTML=cats.length>2?cats.map(c=>`<button class="chip ${c===cat?'on':''}" data-c="${esc(c)}">${esc(c)}</button>`).join(''):'';
  const list=all.filter(p=>(cat==='Semua'||p.category===cat)&&(p.name+' '+(p.desc||'')).toLowerCase().includes(q));
  $('#count').textContent=list.length+' produk';
  $('#empty').hidden=list.length>0;
  $('#grid').innerHTML=list.map(p=>`
    <article class="card">
      <div class="ph">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`:'🛍️'}${p.badge?`<span class="badge">${esc(p.badge)}</span>`:''}</div>
      <div class="body">
        <h2 class="name">${esc(p.name)}</h2>
        ${p.desc?`<div class="desc">${esc(p.desc)}</div>`:''}
        <div class="pr"><span class="price">${rp(p.price)}</span>${p.oldPrice>p.price?`<span class="old">${rp(p.oldPrice)}</span>`:''}</div>
        <a class="buy" href="${esc(url(p.shopee))}" target="_blank" rel="noopener nofollow">Beli di Shopee</a>
      </div>
    </article>`).join('');
}

$('#chips').addEventListener('click',e=>{const b=e.target.closest('.chip');if(b){cat=b.dataset.c;render()}});
$('#q').addEventListener('input',e=>{q=e.target.value.trim().toLowerCase();render()});
load();
})();
