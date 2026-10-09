(() => {
  'use strict';

  // =========================================================
  // [UTIL] FUNGSI BANTUAN UMUM
  // =========================================================

  // [UTIL-01] Ambil elemen DOM berdasarkan selector CSS.
  const $ = s => document.querySelector(s);

  // [UTIL-02] Escape karakter HTML agar teks produk aman ditampilkan.
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

  // [UTIL-03] Format angka menjadi mata uang Rupiah.
  const rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');

  // [UTIL-04] Validasi tautan HTTP/HTTPS.
  const url = u => /^https?:\/\//i.test(u || '') ? u : '#';

  // [UTIL-05] Normalisasi nomor telepon Indonesia ke format internasional 62.
  const tel = v => {
    let d = String(v || '').replace(/\D/g, '');
    if (d.startsWith('0')) d = '62' + d.slice(1);
    else if (d.startsWith('8')) d = '62' + d;
    return d;
  };

  // [UTIL-06] Konstanta waktu dan kata kunci produk populer.
  const DAY = 864e5;
  const BEST = /laris|best\s*seller|favorit|populer|\bhot\b/i;

  // [UTIL-07] Normalisasi teks untuk pencarian.
  const norm = s => String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // [FILTER-01] Pemetaan nilai filter.
  const FM = {
    populer: 'pop',
    baru: 'new',
    diskon: 'sale'
  };

  // [FILTER-02] Daftar jenis sortir yang didukung.
  const SORTS = ['', 'baru', 'populer', 'murah', 'mahal'];

  // =========================================================
  // [STATE] FILTER URL DAN STATUS HALAMAN
  // =========================================================

  // Filter dapat dibagikan melalui URL, misalnya ?f=populer.
  const P = new URLSearchParams(location.search);

  // [STATE-01] Data utama dan status modal.
  let D = { store: {}, products: [] };
  let newDays = 14;
  let opener = null;

  // [STATE-02] Inisialisasi filter, pencarian, dan sortir dari URL.
  let flt = FM[P.get('f')] || (P.get('kat') ? 'cat:' + P.get('kat') : 'all');
  let q = (P.get('q') || '').slice(0, 60);
  let sort = SORTS.includes(P.get('urut')) ? P.get('urut') : '';

  // =========================================================
  // [PROTECT] ANTI-SALIN DAN PEMBATASAN INTERAKSI BROWSER
  // =========================================================

  // [PROTECT-01] Kenali input yang harus tetap dapat digunakan.
  // Pencarian katalog tetap bisa diketik dan ditempeli teks.
  const field = t => {
    const el = t && t.nodeType === 1 ? t : t && t.parentElement;

    return !!(
      el && el.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]'
      )
    );
  };

  // [PROTECT-02] Blok klik kanan, salin, potong, tempel,
  // serta drag di luar input.
  ['contextmenu', 'copy', 'cut', 'paste', 'dragstart'].forEach(ev => {
    document.addEventListener(ev, e => {
      if (!field(e.target)) {
        e.preventDefault();
      }
    }, true);
  });

  // [PROTECT-03] Mencegah seleksi teks di konten non-input.
  document.addEventListener('selectstart', e => {
    if (!field(e.target)) {
      e.preventDefault();
    }
  }, true);

  // [PROTECT-04] Batasi shortcut browser umum dan shortcut developer tools.
  document.addEventListener('keydown', e => {
    const k = (e.key || '').toLowerCase();
    const m = e.ctrlKey || e.metaKey;

    // Escape menutup modal/detail dan panel WhatsApp.
    if (k === 'escape') {
      closeP();
      $('#waPanel').hidden = true;
      return;
    }

    // Blok F12 dan Shift+F10.
    if (k === 'f12' || (e.shiftKey && k === 'f10')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Blok simpan halaman, cetak, lihat source,
    // shortcut developer tools, dan penyalinan non-input.
    if (
      (m && ['u', 's', 'p'].includes(k)) ||
      (m && e.shiftKey && ['i', 'j', 'c'].includes(k)) ||
      (m && ['c', 'x', 'a'].includes(k) && !field(e.target))
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // [PROTECT-05] Terapkan atribut proteksi pada gambar.
  function protectImages(root) {
    const images = root instanceof HTMLImageElement
      ? [root]
      : (root && root.querySelectorAll ? root.querySelectorAll('img') : []);

    images.forEach(img => {
      img.setAttribute('draggable', 'false');
      img.style.setProperty('-webkit-user-drag', 'none');
      img.style.setProperty('-webkit-touch-callout', 'none');
      img.style.setProperty('user-select', 'none');
      img.style.setProperty('-webkit-user-select', 'none');
    });
  }

  // Terapkan perlindungan ke gambar yang sudah ada.
  protectImages(document);

  // [PROTECT-06] Amati gambar baru yang dibuat secara dinamis.
  const imageObserver = new MutationObserver(records => {
    records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          protectImages(node);
        }
      });
    });
  });

  if (document.documentElement) {
    imageObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // [PROTECT-07] Tambahkan CSS proteksi tanpa mengubah file CSS utama.
  if (!document.getElementById('catalog-browser-protection-style')) {
    const protectionStyle = document.createElement('style');

    protectionStyle.id = 'catalog-browser-protection-style';
    protectionStyle.textContent = `
      img, picture {
        -webkit-user-drag: none !important;
        -webkit-touch-callout: none !important;
        -webkit-user-select: none !important;
        user-select: none !important;
      }
    `;

    (document.head || document.documentElement)
      .appendChild(protectionStyle);
  }

  // =========================================================
  // [ERROR] FALLBACK GAMBAR YANG GAGAL DIMUAT
  // =========================================================

  // [ERROR-01] Sembunyikan logo rusak atau ganti thumbnail rusak.
  document.addEventListener('error', e => {
    const t = e.target;

    if (!t || t.tagName !== 'IMG') {
      return;
    }

    if (t.id === 'logo') {
      t.hidden = true;
      return;
    }

    if (t.closest('.ph, .m-ph')) {
      t.replaceWith('🛍️');
    }
  }, true);

  // =========================================================
  // [PRODUCT] ALGORITMA LABEL PRODUK
  // =========================================================
  // Baru    : umur produk sejak createdAt <= newDays (default 14 hari).
  // Populer : ditandai admin atau badge memuat Terlaris/Best Seller/Hot/Favorit.
  // Diskon  : harga coret lebih tinggi daripada harga jual.
  // Skor populer = populer (100) + bonus diskon (maks. 30) + kebaruan (maks. 20).
  // Kategori lama "Baru/Populer" diperlakukan sebagai label, bukan kategori.

  // [PRODUCT-01] Hitung metadata produk untuk filter dan pencarian.
  function enrich(p) {
    const cat = String(p.category || '').trim();
    const lNew = /^baru$/i.test(cat);
    const lPop = /^populer$/i.test(cat);
    const t = Date.parse(p.createdAt);

    p._off = p.oldPrice > p.price
      ? Math.round((1 - p.price / p.oldPrice) * 100)
      : 0;

    p._age = isNaN(t)
      ? (lNew ? 0 : 1e9)
      : Math.max(0, (Date.now() - t) / DAY);

    p._new = p._age <= newDays;
    p._pop = p.popular === true || lPop || BEST.test(p.badge || '');
    p._cat = lNew || lPop ? '' : cat;

    p._score = (p._pop ? 100 : 0) +
      Math.min(p._off, 60) * .5 +
      (p._new ? Math.max(0, 20 - p._age) : 0);

    p._name = norm(p.name);
    p._cn = norm(p._cat);
    p._hay = norm([p.name, p._cat, p.badge, p.desc].join(' '));
  }

  // =========================================================
  // [DATA] MEMUAT DATA KATALOG
  // =========================================================

  // [DATA-01] Ambil data/products.json lalu siapkan data toko dan produk.
  async function load() {
    try {
      const r = await fetch('data/products.json?t=' + Date.now(), {
        cache: 'no-store'
      });

      if (!r.ok) {
        throw 0;
      }

      D = await r.json();

      if (!D || typeof D !== 'object') {
        D = {};
      }

      D.store = D.store || {};
      D.products = (Array.isArray(D.products) ? D.products : [])
        .filter(p => p && typeof p === 'object');
    } catch (e) {
      $('#grid').innerHTML = '';
      $('#count').textContent = '';
      $('#empty').hidden = false;
      $('#empty').textContent = 'Katalog belum bisa dimuat. Muat ulang halaman.';
      return;
    }

    newDays = Math.min(90, Math.max(1, +D.store.newDays || 14));
    D.products.forEach(enrich);

    header();
    $('#q').value = q;
    $('#sort').value = sort;
    render();
    whatsapp();
  }

  // =========================================================
  // [HEADER] INFORMASI TOKO DAN TAUTAN SOSIAL
  // =========================================================

  // [HEADER-01] Tampilkan nama, logo, tema, header, dan tautan sosial toko.
  function header() {
    const s = D.store;

    document.title = (s.name || 'Katalog') + ' | Katalog Produk';
    $('#storeName').textContent = s.name || 'Katalog';
    $('#tagline').textContent = s.tagline || '';

    if (/^#[0-9a-f]{3,8}$/i.test(s.theme || '')) {
      document.documentElement.style.setProperty('--accent', s.theme);
      document.querySelector('meta[name=theme-color]').content = s.theme;
    }

    if (s.logo) {
      const l = $('#logo');
      l.src = s.logo;
      l.alt = s.name || '';
      l.hidden = false;
    }

    const hero = $('.hero');

    if (s.headerImage) {
      hero.style.backgroundImage =
        `linear-gradient(180deg,rgba(20,33,61,.40),rgba(20,33,61,.85)),url("${String(s.headerImage).replace(/["\\\n\r]/g, '')}")`;

      hero.classList.add('has-img');
    } else {
      hero.style.backgroundImage = '';
      hero.classList.remove('has-img');
    }

    const links = [];

    if (s.shopeeStore) {
      links.push(['Toko Shopee', s.shopeeStore]);
    }

    if (s.instagram) {
      links.push(['Instagram', s.instagram]);
    }

    $('#links').innerHTML = links.map(([t, u]) =>
      `<a href="${esc(url(u))}" target="_blank" rel="noopener">${t}</a>`
    ).join('');
  }

  // =========================================================
  // [SORT] URUTAN PRODUK DAN SINKRONISASI URL
  // =========================================================

  // [SORT-01] Fungsi pembanding untuk setiap pilihan sortir.
  const SORT_FN = {
    rel: (a, b) => b._rel - a._rel,
    baru: (a, b) => a._age - b._age,
    populer: (a, b) => b._score - a._score,
    diskon: (a, b) => b._off - a._off,
    murah: (a, b) => a.price - b.price,
    mahal: (a, b) => b.price - a.price
  };

  // [SORT-02] Perbarui parameter URL berdasarkan kondisi katalog saat ini.
  function syncURL() {
    const u = new URLSearchParams();

    if (flt === 'pop') {
      u.set('f', 'populer');
    } else if (flt === 'new') {
      u.set('f', 'baru');
    } else if (flt === 'sale') {
      u.set('f', 'diskon');
    } else if (flt.startsWith('cat:')) {
      u.set('kat', flt.slice(4));
    }

    if (q) {
      u.set('q', q);
    }

    if (sort) {
      u.set('urut', sort);
    }

    try {
      history.replaceState(
        null,
        '',
        location.pathname + (u.toString() ? '?' + u : '')
      );
    } catch (e) {}
  }

  // =========================================================
  // [RENDER] FILTER, PENCARIAN, SORTIR, DAN KARTU PRODUK
  // =========================================================

  // [RENDER-01] Render daftar filter dan produk sesuai pilihan pengguna.
  function render() {
    const all = D.products.filter(p => p.active !== false);

    const nPop = all.filter(p => p._pop).length;
    const nNew = all.filter(p => p._new).length;
    const nSale = all.filter(p => p._off > 0).length;

    const cats = new Map();

    all.forEach(p => {
      if (p._cat) {
        cats.set(p._cat, (cats.get(p._cat) || 0) + 1);
      }
    });

    const valid = flt === 'all' ||
      (flt === 'pop' && nPop) ||
      (flt === 'new' && nNew) ||
      (flt === 'sale' && nSale) ||
      (flt.startsWith('cat:') && cats.has(flt.slice(4)));

    if (!valid) {
      flt = 'all';
    }

    // Pembuat tombol filter.
    const chip = (k, label, n, cls = '') =>
      `<button class="chip ${cls} ${flt === k ? 'on' : ''}" data-f="${esc(k)}" aria-pressed="${flt === k}">${label}<small>${n}</small></button>`;

    let h = '';

    if (nPop || nNew || nSale || cats.size > 1) {
      h = chip('all', 'Semua', all.length);

      if (nPop) {
        h += chip('pop', '🔥 Populer', nPop, 'smart');
      }

      if (nNew) {
        h += chip('new', '✨ Baru', nNew, 'smart');
      }

      if (nSale) {
        h += chip('sale', '🏷️ Diskon', nSale, 'smart');
      }

      if (cats.size) {
        h += '<span class="sep"></span>' +
          [...cats].map(([c, n]) => chip('cat:' + c, esc(c), n)).join('');
      }
    }

    $('#chips').innerHTML = h;

    // Pecah kata pencarian untuk pencocokan semua kata.
    const tk = norm(q).split(/\s+/).filter(Boolean);

    // Periksa apakah produk sesuai dengan filter aktif.
    const inFilter = p =>
      flt === 'all' ||
      (flt === 'pop' ? p._pop :
        flt === 'new' ? p._new :
          flt === 'sale' ? p._off > 0 :
            p._cat === flt.slice(4));

    // Simpan urutan asli toko sebagai penentu apabila skor sama.
    const order = new Map(all.map((p, i) => [p, i]));

    const list = all.filter(p =>
      inFilter(p) && tk.every(t => p._hay.includes(t))
    );

    // Hitung relevansi hasil pencarian.
    if (tk.length) {
      list.forEach(p => {
        p._rel = tk.reduce((s, t) =>
          s + 1 +
          (p._name.includes(t) ? 3 : 0) +
          (p._cn.includes(t) ? 2 : 0), 0
        );
      });
    }

    // Tentukan sortir berdasarkan input atau filter aktif.
    const key = sort || (
      tk.length
        ? 'rel'
        : ({ pop: 'populer', new: 'baru', sale: 'diskon' })[flt] || ''
    );

    // Urutkan produk; jika seri, pertahankan urutan toko.
    if (key) {
      list.sort((a, b) =>
        SORT_FN[key](a, b) || order.get(a) - order.get(b)
      );
    }

    $('#count').textContent = list.length + ' produk';
    $('#empty').hidden = list.length > 0;

    $('#empty').innerHTML = all.length
      ? 'Produk tidak ditemukan. <button class="link" id="reset">Hapus filter</button>'
      : 'Belum ada produk yang ditampilkan.';

    // Render kartu produk.
    $('#grid').innerHTML = list.map(p => {
      const bd = p.badge || (p._new ? 'Baru' : p._pop ? 'Populer' : '');

      return `
      <article class="card" data-i="${D.products.indexOf(p)}" tabindex="0" role="button" aria-label="Lihat detail ${esc(p.name)}">
        <div class="ph">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" draggable="false">` : '🛍️'}${bd ? `<span class="badge">${esc(bd)}</span>` : ''}</div>
        <div class="body">
          <h2 class="name">${esc(p.name)}</h2>
          ${p.desc ? `<div class="desc">${esc(p.desc)}</div>` : ''}
          <div class="pr"><span class="price">${rp(p.price)}</span>${p._off ? `<span class="old">${rp(p.oldPrice)}</span>` : ''}</div>
          <span class="more">Lihat detail</span>
          <a class="buy" href="${esc(url(p.shopee))}" target="_blank" rel="noopener nofollow">Beli di Shopee</a>
        </div>
      </article>`;
    }).join('');

    syncURL();
  }

  // =========================================================
  // [MODAL] POPUP DETAIL PRODUK
  // =========================================================

  // [MODAL-01] Tampilkan detail produk terpilih.
  function openP(i) {
    const p = D.products[i];

    if (!p) {
      return;
    }

    opener = document.activeElement;

    $('#mBody').innerHTML = `
      <div class="m-ph">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" draggable="false">` : '<span>🛍️</span>'}${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}</div>
      <div class="m-info">
        <div class="m-tags">${p._new ? '<span class="pill n">✨ Baru</span>' : ''}${p._pop ? '<span class="pill p">🔥 Populer</span>' : ''}${p._cat ? `<span class="m-cat">${esc(p._cat)}</span>` : ''}</div>
        <h2 id="mName">${esc(p.name)}</h2>
        <div class="m-price"><span class="price">${rp(p.price)}</span>${p._off ? `<span class="old">${rp(p.oldPrice)}</span><span class="off">-${p._off}%</span>` : ''}</div>
        <h3>Deskripsi produk</h3>
        <p class="m-desc">${p.desc ? esc(p.desc) : 'Belum ada deskripsi untuk produk ini.'}</p>
        <a class="buy" href="${esc(url(p.shopee))}" target="_blank" rel="noopener nofollow">Beli di Shopee</a>
        <small class="m-note">Pembayaran dan pengiriman diproses oleh Shopee.</small>
      </div>`;

    $('#modal').hidden = false;
    document.body.classList.add('lock');
    $('#mClose').focus();
  }

  // [MODAL-02] Tutup popup dan kembalikan fokus ke elemen sebelumnya.
  function closeP() {
    const m = $('#modal');

    if (m.hidden) {
      return;
    }

    m.hidden = true;
    document.body.classList.remove('lock');

    if (opener && opener.focus) {
      opener.focus();
    }

    opener = null;
  }

  // [MODAL-03] Buka detail saat kartu diklik, kecuali tombol pembelian.
  $('#grid').addEventListener('click', e => {
    const c = e.target.closest('.card');

    if (c && !e.target.closest('.buy')) {
      openP(+c.dataset.i);
    }
  });

  // [MODAL-04] Dukung navigasi kartu dengan Enter atau Spasi.
  $('#grid').addEventListener('keydown', e => {
    if (
      (e.key === 'Enter' || e.key === ' ') &&
      e.target.classList.contains('card')
    ) {
      e.preventDefault();
      openP(+e.target.dataset.i);
    }
  });

  // Tombol close dan klik overlay untuk menutup modal.
  $('#mClose').onclick = closeP;

  $('#modal').addEventListener('click', e => {
    if (e.target.id === 'modal') {
      closeP();
    }
  });

  // =========================================================
  // [WHATSAPP] KONTAK SELLER, AGEN, DAN DISTRIBUTOR
  // =========================================================

  // [WHATSAPP-01] Bangun daftar kontak dari data Info Toko.
  function whatsapp() {
    const cs = (
      Array.isArray(D.store.contacts) ? D.store.contacts : []
    ).filter(c => c && tel(c.phone).length >= 9);

    $('#wa').hidden = !cs.length;

    $('#waList').innerHTML = cs.map(c => {
      const txt = `Halo ${c.name || ''}, Hallo Admin ${D.store.name || ''}.`;
      const ini = ((c.name || c.role || '?').trim()[0] || '?').toUpperCase();

      return `<a class="wa-item" href="https://wa.me/${tel(c.phone)}?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">
        <span class="wa-av">${esc(ini)}</span><span><b>${esc(c.name || c.role)}</b><small>${esc(c.role || 'Seller')}</small></span></a>`;
    }).join('');
  }

  // [WHATSAPP-02] Buka atau tutup panel kontak WhatsApp.
  $('#waBtn').onclick = () => {
    $('#waPanel').hidden = !$('#waPanel').hidden;
  };

  // Tutup panel ketika area di luar widget WhatsApp diklik.
  document.addEventListener('click', e => {
    if (!e.target.closest('#wa')) {
      $('#waPanel').hidden = true;
    }
  });

  // =========================================================
  // [CONTROLS] FILTER, SORTIR, DAN PENCARIAN
  // =========================================================

  // [CONTROLS-01] Pilih filter ketika chip kategori diklik.
  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('.chip');

    if (b) {
      flt = b.dataset.f;
      render();
    }
  });

  // [CONTROLS-02] Terapkan sortir ketika opsi diubah.
  $('#sort').addEventListener('change', e => {
    sort = e.target.value;
    render();
  });

  // [CONTROLS-03] Reset filter, pencarian, dan sortir.
  $('#empty').addEventListener('click', e => {
    if (e.target.id === 'reset') {
      flt = 'all';
      q = '';
      sort = '';

      $('#q').value = '';
      $('#sort').value = '';

      render();
    }
  });

  // [CONTROLS-04] Debounce pencarian agar render tidak berjalan setiap ketikan.
  let tm;

  $('#q').addEventListener('input', e => {
    clearTimeout(tm);

    tm = setTimeout(() => {
      q = e.target.value.trim().slice(0, 60);
      render();
    }, 150);
  });

  // =========================================================
  // [START] MULAI MEMUAT KATALOG
  // =========================================================

  load();
})();
