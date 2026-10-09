(() => {
  'use strict';

  // =========================================================
  // [UTIL] FUNGSI BANTUAN UMUM
  // =========================================================

  // [UTIL-01] Mengambil elemen DOM berdasarkan selector CSS.
  const $ = s => document.querySelector(s);

  // [UTIL-02] Mengamankan teks sebelum dimasukkan ke HTML.
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

  // [UTIL-03] Memformat angka menjadi mata uang Rupiah.
  const rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');

  // [UTIL-04] Memastikan tautan menggunakan HTTP atau HTTPS.
  const url = u => /^https?:\/\//i.test(u || '') ? u : '#';

  // [UTIL-05] Menormalisasi nomor telepon ke format internasional Indonesia.
  const tel = v => {
    let d = String(v || '').replace(/\D/g, '');

    if (d.startsWith('0')) {
      d = '62' + d.slice(1);
    } else if (d.startsWith('8')) {
      d = '62' + d;
    }

    return d;
  };

  // [UTIL-06] Menghapus karakter emoji dari label teks.
  // Ikon visual akan menggunakan SVG agar tampil konsisten.
  const cleanLabel = s => String(s ?? '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u200D]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // [UTIL-07] Konstanta waktu dan kata kunci populer.
  const DAY = 864e5;
  const BEST = /laris|best\s*seller|favorit|populer|\bhot\b/i;

  // [UTIL-08] Menormalisasi teks untuk pencarian.
  const norm = s => String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // =========================================================
  // [ICON] IKON SVG PENGGANTI EMOJI
  // =========================================================

  // [ICON-01] Kumpulan ikon SVG internal tanpa library ikon tambahan.
  // Ikon menggunakan currentColor agar warna mengikuti CSS.
  function iconSvg(name, extraClass = '') {
    const icons = {
      popular: `
        <path d="m3 17 6-6 4 4 8-9"></path>
        <path d="M15 6h6v6"></path>
      `,

      new: `
        <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z"></path>
        <path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z"></path>
      `,

      sale: `
        <path d="M20.59 13.41 11 3.83H4v7l9.59 9.58a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82Z"></path>
        <circle cx="7.5" cy="7.5" r=".8"></circle>
      `,

      bag: `
        <path d="M5 8h14l1 13H4L5 8Z"></path>
        <path d="M9 8V6a3 3 0 0 1 6 0v2"></path>
      `
    };

    return `
      <svg
        class="catalog-icon catalog-icon-${esc(name)} ${esc(extraClass)}"
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >${icons[name] || icons.bag}</svg>
    `;
  }

  // [ICON-02] Menentukan ikon yang sesuai dengan nama label produk.
  function badgeIcon(label) {
    const s = norm(cleanLabel(label));

    if (/diskon|sale|promo|hemat/.test(s)) {
      return iconSvg('sale');
    }

    if (/baru|new/.test(s)) {
      return iconSvg('new');
    }

    if (/populer|laris|best\s*seller|favorit|\bhot\b/.test(s)) {
      return iconSvg('popular');
    }

    return '';
  }

  // [ICON-03] Membuat ikon pengganti ketika gambar produk tidak tersedia.
  function placeholderIcon() {
    const span = document.createElement('span');

    span.className = 'catalog-placeholder';
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', 'Gambar produk tidak tersedia');
    span.innerHTML = iconSvg('bag');

    return span;
  }

  // =========================================================
  // [FILTER] PEMETAAN FILTER DAN SORTIR
  // =========================================================

  // [FILTER-01] Pemetaan nilai filter dari URL.
  const FM = {
    populer: 'pop',
    baru: 'new',
    diskon: 'sale'
  };

  // [FILTER-02] Daftar sortir yang didukung.
  const SORTS = ['', 'baru', 'populer', 'murah', 'mahal'];

  // =========================================================
  // [STATE] STATUS KATALOG
  // =========================================================

  // Parameter URL dapat digunakan untuk membagikan tampilan katalog.
  const P = new URLSearchParams(location.search);

  // [STATE-01] Data toko, daftar produk, dan status popup.
  let D = {
    store: {},
    products: []
  };

  let newDays = 14;
  let opener = null;

  // [STATE-02] Ambil filter, pencarian, dan sortir dari URL.
  let flt = FM[P.get('f')] ||
    (P.get('kat') ? 'cat:' + P.get('kat') : 'all');

  let q = (P.get('q') || '').slice(0, 60);

  let sort = SORTS.includes(P.get('urut'))
    ? P.get('urut')
    : '';

  // =========================================================
  // [ANIMATION] LIBRARY CSS DAN ANIMASI KATALOG
  // =========================================================

  // [ANIMATION-01] Memuat Animate.css satu kali melalui CDN.
  // Jika library sudah dimuat oleh HTML, tidak dibuat duplikat.
  function loadAnimationLibrary() {
    const exists = document.querySelector(
      'link[data-catalog-animate]'
    );

    if (exists) {
      return;
    }

    const link = document.createElement('link');

    link.rel = 'stylesheet';
    link.href =
      'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css';
    link.dataset.catalogAnimate = 'true';

    (document.head || document.documentElement)
      .appendChild(link);
  }

  // [ANIMATION-02] Menambahkan CSS tambahan untuk ikon,
  // label, kartu, dan dukungan pengguna yang mengurangi animasi.
  function installAnimationStyles() {
    if (document.getElementById('catalog-animation-style')) {
      return;
    }

    const style = document.createElement('style');

    style.id = 'catalog-animation-style';

    style.textContent = `
      /* Ikon SVG katalog */
      .catalog-icon {
        display: inline-block;
        width: 1em;
        height: 1em;
        flex: 0 0 auto;
        vertical-align: -0.12em;
      }

      .chip .catalog-icon {
        margin-right: 4px;
      }

      .catalog-product-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transform-origin: center;
      }

      .catalog-product-badge .catalog-icon {
        width: 0.95em;
        height: 0.95em;
      }

      .catalog-placeholder {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        color: #8993a4;
      }

      .catalog-placeholder .catalog-icon {
        width: 34px;
        height: 34px;
        opacity: 0.75;
      }

      /* Animasi masuk kartu produk */
      .catalog-card.animate__animated {
        animation-duration: 0.48s;
        animation-fill-mode: both;
      }

      /* Animasi masuk label produk */
      .catalog-product-badge.animate__animated {
        animation-duration: 0.55s;
        animation-fill-mode: both;
      }

      /* Animasi ringan untuk tombol filter pintar */
      .chip.smart {
        transition:
          transform 0.22s ease,
          filter 0.22s ease;
      }

      .chip.smart:hover {
        transform: translateY(-2px);
        filter: brightness(1.04);
      }

      /* Efek kartu saat disentuh atau diarahkan */
      .catalog-card {
        transition:
          transform 0.22s ease,
          box-shadow 0.22s ease;
      }

      .catalog-card:hover {
        transform: translateY(-3px);
      }

      /* Hormati pengaturan pengurangan animasi perangkat */
      @media (prefers-reduced-motion: reduce) {
        .catalog-card.animate__animated,
        .catalog-product-badge.animate__animated,
        .chip.smart {
          animation: none !important;
          transition: none !important;
        }
      }
    `;

    (document.head || document.documentElement)
      .appendChild(style);
  }

  loadAnimationLibrary();
  installAnimationStyles();

  // =========================================================
  // [PROTECT] ANTI-SALIN DAN PEMBATASAN INTERAKSI
  // =========================================================

  // [PROTECT-01] Menentukan elemen yang harus tetap bisa diketik.
  // Pencarian, select, dan kolom yang dapat diedit tetap berfungsi.
  const field = t => {
    const el = t && t.nodeType === 1
      ? t
      : t && t.parentElement;

    return !!(
      el && el.closest(
        'input, textarea, select, ' +
        '[contenteditable="true"], ' +
        '[contenteditable=""], ' +
        '[role="textbox"]'
      )
    );
  };

  // [PROTECT-02] Mencegah menu klik kanan, penyalinan, pemotongan,
  // penempelan di luar kolom input, dan drag elemen.
  [
    'contextmenu',
    'copy',
    'cut',
    'paste',
    'dragstart'
  ].forEach(ev => {
    document.addEventListener(ev, e => {
      if (!field(e.target)) {
        e.preventDefault();
      }
    }, true);
  });

  // [PROTECT-03] Membatasi seleksi teks pada konten non-input.
  document.addEventListener('selectstart', e => {
    if (!field(e.target)) {
      e.preventDefault();
    }
  }, true);

  // [PROTECT-04] Membatasi beberapa shortcut browser.
  document.addEventListener('keydown', e => {
    const k = (e.key || '').toLowerCase();
    const m = e.ctrlKey || e.metaKey;

    // Escape menutup popup dan panel WhatsApp.
    if (k === 'escape') {
      closeP();

      const panel = $('#waPanel');

      if (panel) {
        panel.hidden = true;
      }

      return;
    }

    // Blok shortcut F12 dan Shift+F10.
    if (k === 'f12' || (e.shiftKey && k === 'f10')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Blok shortcut simpan, cetak, lihat source,
    // dan shortcut developer tools.
    if (
      (m && ['u', 's', 'p'].includes(k)) ||
      (m && e.shiftKey && ['i', 'j', 'c'].includes(k)) ||
      (m && ['c', 'x', 'a'].includes(k) && !field(e.target))
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // [PROTECT-05] Menonaktifkan drag dan menu sentuh gambar.
  function protectImages(root) {
    const images = root instanceof HTMLImageElement
      ? [root]
      : (
          root && root.querySelectorAll
            ? root.querySelectorAll('img')
            : []
        );

    images.forEach(img => {
      img.setAttribute('draggable', 'false');

      img.style.setProperty('-webkit-user-drag', 'none');
      img.style.setProperty('-webkit-touch-callout', 'none');
      img.style.setProperty('user-select', 'none');
      img.style.setProperty('-webkit-user-select', 'none');
    });
  }

  // Terapkan perlindungan pada gambar yang sudah ada.
  protectImages(document);

  // [PROTECT-06] Mengawasi gambar yang ditambahkan secara dinamis.
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

  // [PROTECT-07] Tambahan CSS untuk perlindungan gambar.
  if (!document.getElementById('catalog-browser-protection-style')) {
    const protectionStyle = document.createElement('style');

    protectionStyle.id = 'catalog-browser-protection-style';

    protectionStyle.textContent = `
      img,
      picture {
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
  // [ERROR] PENANGANAN GAMBAR YANG GAGAL DIMUAT
  // =========================================================

  // [ERROR-01] Sembunyikan logo rusak dan ganti gambar produk
  // yang gagal dimuat dengan ikon SVG.
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
      t.replaceWith(placeholderIcon());
    }
  }, true);

  // =========================================================
  // [PRODUCT] ALGORITMA LABEL DAN METADATA PRODUK
  // =========================================================
  //
  // Baru    : produk berumur maksimal newDays hari.
  // Populer : produk ditandai populer atau memiliki badge populer.
  // Diskon  : harga normal lebih tinggi daripada harga jual.
  // Skor    : populer (100) + diskon (maks. 30) + kebaruan (maks. 20).
  //
  // [PRODUCT-01] Hitung metadata yang diperlukan filter dan pencarian.
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
    p._pop = p.popular === true ||
      lPop ||
      BEST.test(p.badge || '');

    p._cat = lNew || lPop ? '' : cat;

    p._score =
      (p._pop ? 100 : 0) +
      Math.min(p._off, 60) * 0.5 +
      (p._new ? Math.max(0, 20 - p._age) : 0);

    p._name = norm(p.name);
    p._cn = norm(p._cat);
    p._hay = norm([
      p.name,
      p._cat,
      p.badge,
      p.desc
    ].join(' '));
  }

  // =========================================================
  // [DATA] MEMUAT DATA KATALOG
  // =========================================================

  // [DATA-01] Mengambil data toko dan daftar produk dari JSON.
  async function load() {
    try {
      const r = await fetch(
        'data/products.json?t=' + Date.now(),
        { cache: 'no-store' }
      );

      if (!r.ok) {
        throw new Error('Data katalog gagal dimuat.');
      }

      D = await r.json();

      if (!D || typeof D !== 'object') {
        D = {};
      }

      D.store = D.store || {};

      D.products = (
        Array.isArray(D.products)
          ? D.products
          : []
      ).filter(p => p && typeof p === 'object');

    } catch (e) {
      $('#grid').innerHTML = '';
      $('#count').textContent = '';
      $('#empty').hidden = false;
      $('#empty').textContent =
        'Katalog belum bisa dimuat. Muat ulang halaman.';

      return;
    }

    newDays = Math.min(
      90,
      Math.max(1, +D.store.newDays || 14)
    );

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

  // [HEADER-01] Menampilkan nama toko, logo, tema, dan tautan sosial.
  function header() {
    const s = D.store;

    document.title =
      (s.name || 'Katalog') + ' | Katalog Produk';

    $('#storeName').textContent = s.name || 'Katalog';
    $('#tagline').textContent = s.tagline || '';

    if (/^#[0-9a-f]{3,8}$/i.test(s.theme || '')) {
      document.documentElement.style.setProperty(
        '--accent',
        s.theme
      );

      const themeMeta = document.querySelector(
        'meta[name="theme-color"]'
      );

      if (themeMeta) {
        themeMeta.content = s.theme;
      }
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
  // [SORT] PENGURUTAN PRODUK DAN SINKRONISASI URL
  // =========================================================

  // [SORT-01] Fungsi pembanding untuk setiap jenis sortir.
  const SORT_FN = {
    rel: (a, b) => b._rel - a._rel,
    baru: (a, b) => a._age - b._age,
    populer: (a, b) => b._score - a._score,
    diskon: (a, b) => b._off - a._off,
    murah: (a, b) => a.price - b.price,
    mahal: (a, b) => b.price - a.price
  };

  // [SORT-02] Memperbarui URL agar filter dapat dibagikan.
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
        location.pathname +
          (u.toString() ? '?' + u : '')
      );
    } catch (e) {}
  }

  // =========================================================
  // [RENDER] FILTER, PENCARIAN, SORTIR, DAN KARTU PRODUK
  // =========================================================

  // [RENDER-01] Membuat filter dan menampilkan produk sesuai kriteria.
  function render() {
    const all = D.products.filter(
      p => p.active !== false
    );

    const nPop = all.filter(p => p._pop).length;
    const nNew = all.filter(p => p._new).length;
    const nSale = all.filter(p => p._off > 0).length;

    const cats = new Map();

    all.forEach(p => {
      if (p._cat) {
        cats.set(
          p._cat,
          (cats.get(p._cat) || 0) + 1
        );
      }
    });

    const valid =
      flt === 'all' ||
      (flt === 'pop' && nPop) ||
      (flt === 'new' && nNew) ||
      (flt === 'sale' && nSale) ||
      (flt.startsWith('cat:') && cats.has(flt.slice(4)));

    if (!valid) {
      flt = 'all';
    }

    // [RENDER-02] Pembuat chip filter.
    const chip = (k, label, n, cls = '') =>
      `<button class="chip ${cls} ${flt === k ? 'on' : ''}" data-f="${esc(k)}" aria-pressed="${flt === k}">${label}<small>${n}</small></button>`;

    let h = '';

    if (nPop || nNew || nSale || cats.size > 1) {
      h = chip('all', 'Semua', all.length);

      if (nPop) {
        h += chip(
          'pop',
          iconSvg('popular') + ' Populer',
          nPop,
          'smart'
        );
      }

      if (nNew) {
        h += chip(
          'new',
          iconSvg('new') + ' Baru',
          nNew,
          'smart'
        );
      }

      if (nSale) {
        h += chip(
          'sale',
          iconSvg('sale') + ' Diskon',
          nSale,
          'smart'
        );
      }

      if (cats.size) {
        h += '<span class="sep"></span>' +
          [...cats].map(([c, n]) =>
            chip('cat:' + c, esc(c), n)
          ).join('');
      }
    }

    $('#chips').innerHTML = h;

    // [RENDER-03] Memecah kata pencarian untuk pencocokan.
    const tk = norm(q)
      .split(/\s+/)
      .filter(Boolean);

    // [RENDER-04] Memeriksa kecocokan produk dengan filter aktif.
    const inFilter = p =>
      flt === 'all' ||
      (
        flt === 'pop'
          ? p._pop
          : flt === 'new'
            ? p._new
            : flt === 'sale'
              ? p._off > 0
              : p._cat === flt.slice(4)
      );

    // [RENDER-05] Menyimpan urutan asli produk sebagai penentu seri.
    const order = new Map(
      all.map((p, i) => [p, i])
    );

    const list = all.filter(p =>
      inFilter(p) &&
      tk.every(t => p._hay.includes(t))
    );

    // [RENDER-06] Menghitung relevansi pencarian.
    if (tk.length) {
      list.forEach(p => {
        p._rel = tk.reduce((s, t) =>
          s +
          1 +
          (p._name.includes(t) ? 3 : 0) +
          (p._cn.includes(t) ? 2 : 0),
          0
        );
      });
    }

    // [RENDER-07] Menentukan sortir berdasarkan input pengguna.
    const key = sort || (
      tk.length
        ? 'rel'
        : ({
            pop: 'populer',
            new: 'baru',
            sale: 'diskon'
          })[flt] || ''
    );

    // [RENDER-08] Mengurutkan produk dengan urutan asli sebagai
    // penentu apabila dua produk memiliki nilai yang sama.
    if (key && SORT_FN[key]) {
      list.sort((a, b) =>
        SORT_FN[key](a, b) ||
        order.get(a) - order.get(b)
      );
    }

    $('#count').textContent =
      list.length + ' produk';

    $('#empty').hidden = list.length > 0;

    $('#empty').innerHTML = all.length
      ? 'Produk tidak ditemukan. <button class="link" id="reset">Hapus filter</button>'
      : 'Belum ada produk yang ditampilkan.';

    // [RENDER-09] Membuat kartu produk lengkap dengan animasi CSS.
    $('#grid').innerHTML = list.map((p, index) => {
      const bd = cleanLabel(
        p.badge ||
        (p._new ? 'Baru' : p._pop ? 'Populer' : '')
      );

      const badge = bd
        ? `
          <span class="badge catalog-product-badge
            animate__animated animate__fadeInDown">
            ${badgeIcon(bd)}
            <span>${esc(bd)}</span>
          </span>
        `
        : '';

      const image = p.image
        ? `
          <img
            src="${esc(p.image)}"
            alt="${esc(p.name)}"
            loading="lazy"
            draggable="false"
          >
        `
        : `
          <span class="catalog-placeholder"
            role="img"
            aria-label="Gambar produk tidak tersedia">
            ${iconSvg('bag')}
          </span>
        `;

      return `
        <article
          class="card catalog-card animate__animated animate__fadeInUp"
          style="animation-delay:${Math.min(index * 45, 360)}ms"
          data-i="${D.products.indexOf(p)}"
          tabindex="0"
          role="button"
          aria-label="Lihat detail ${esc(p.name)}"
        >
          <div class="ph">
            ${image}
            ${badge}
          </div>

          <div class="body">
            <h2 class="name">${esc(p.name)}</h2>

            ${
              p.desc
                ? `<div class="desc">${esc(p.desc)}</div>`
                : ''
            }

            <div class="pr">
              <span class="price">${rp(p.price)}</span>
              ${
                p._off
                  ? `<span class="old">${rp(p.oldPrice)}</span>`
                  : ''
              }
            </div>

            <span class="more">Lihat detail</span>

            <a
              class="buy"
              href="${esc(url(p.shopee))}"
              target="_blank"
              rel="noopener nofollow"
            >Beli di Shopee</a>
          </div>
        </article>
      `;
    }).join('');

    // [RENDER-10] Terapkan perlindungan pada gambar yang baru dibuat.
    protectImages($('#grid'));

    // [RENDER-11] Perbarui URL sesuai filter yang aktif.
    syncURL();
  }

  // =========================================================
  // [MODAL] POPUP DETAIL PRODUK
  // =========================================================

  // [MODAL-01] Menampilkan informasi lengkap produk terpilih.
  function openP(i) {
    const p = D.products[i];

    if (!p) {
      return;
    }

    opener = document.activeElement;

    const modalBadge = cleanLabel(p.badge || '');

    const image = p.image
      ? `
        <img
          src="${esc(p.image)}"
          alt="${esc(p.name)}"
          draggable="false"
        >
      `
      : `
        <span class="catalog-placeholder"
          role="img"
          aria-label="Gambar produk tidak tersedia">
          ${iconSvg('bag')}
        </span>
      `;

    const badge = modalBadge
      ? `
        <span class="badge catalog-product-badge
          animate__animated animate__fadeInDown">
          ${badgeIcon(modalBadge)}
          <span>${esc(modalBadge)}</span>
        </span>
      `
      : '';

    $('#mBody').innerHTML = `
      <div class="m-ph">
        ${image}
        ${badge}
      </div>

      <div class="m-info">
        <div class="m-tags">
          ${
            p._new
              ? `<span class="pill n">${iconSvg('new')} Baru</span>`
              : ''
          }

          ${
            p._pop
              ? `<span class="pill p">${iconSvg('popular')} Populer</span>`
              : ''
          }

          ${
            p._cat
              ? `<span class="m-cat">${esc(p._cat)}</span>`
              : ''
          }
        </div>

        <h2 id="mName">${esc(p.name)}</h2>

        <div class="m-price">
          <span class="price">${rp(p.price)}</span>

          ${
            p._off
              ? `
                <span class="old">${rp(p.oldPrice)}</span>
                <span class="off">-${p._off}%</span>
              `
              : ''
          }
        </div>

        <h3>Deskripsi produk</h3>

        <p class="m-desc">
          ${
            p.desc
              ? esc(p.desc)
              : 'Belum ada deskripsi untuk produk ini.'
          }
        </p>

        <a
          class="buy"
          href="${esc(url(p.shopee))}"
          target="_blank"
          rel="noopener nofollow"
        >Beli di Shopee</a>

        <small class="m-note">
          Pembayaran dan pengiriman diproses oleh Shopee.
        </small>
      </div>
    `;

    $('#modal').hidden = false;
    document.body.classList.add('lock');
    $('#mClose').focus();

    // Pastikan gambar detail juga mendapat proteksi.
    protectImages($('#mBody'));
  }

  // [MODAL-02] Menutup popup dan mengembalikan fokus sebelumnya.
  function closeP() {
    const m = $('#modal');

    if (!m || m.hidden) {
      return;
    }

    m.hidden = true;
    document.body.classList.remove('lock');

    if (opener && opener.focus) {
      opener.focus();
    }

    opener = null;
  }

  // [MODAL-03] Membuka detail produk ketika kartu diklik.
  // Klik tombol beli tidak membuka popup.
  $('#grid').addEventListener('click', e => {
    const c = e.target.closest('.card');

    if (c && !e.target.closest('.buy')) {
      openP(+c.dataset.i);
    }
  });

  // [MODAL-04] Mendukung keyboard Enter dan Spasi pada kartu produk.
  $('#grid').addEventListener('keydown', e => {
    if (
      (e.key === 'Enter' || e.key === ' ') &&
      e.target.classList.contains('card')
    ) {
      e.preventDefault();
      openP(+e.target.dataset.i);
    }
  });

  // [MODAL-05] Menutup popup melalui tombol tutup.
  $('#mClose').onclick = closeP;

  // [MODAL-06] Menutup popup ketika latar overlay diklik.
  $('#modal').addEventListener('click', e => {
    if (e.target.id === 'modal') {
      closeP();
    }
  });

  // =========================================================
  // [WHATSAPP] KONTAK SELLER, AGEN, DAN DISTRIBUTOR
  // =========================================================

  // [WHATSAPP-01] Membuat daftar kontak WhatsApp dari data toko.
  function whatsapp() {
    const cs = (
      Array.isArray(D.store.contacts)
        ? D.store.contacts
        : []
    ).filter(c =>
      c && tel(c.phone).length >= 9
    );

    $('#wa').hidden = !cs.length;

    $('#waList').innerHTML = cs.map(c => {
      const txt =
        `Halo ${c.name || ''}, Hallo Admin ${D.store.name || ''}.`;

      const ini = (
        (c.name || c.role || '?').trim()[0] || '?'
      ).toUpperCase();

      return `
        <a
          class="wa-item"
          href="https://wa.me/${tel(c.phone)}?text=${encodeURIComponent(txt)}"
          target="_blank"
          rel="noopener"
        >
          <span class="wa-av">${esc(ini)}</span>

          <span>
            <b>${esc(c.name || c.role)}</b>
            <small>${esc(c.role || 'Seller')}</small>
          </span>
        </a>
      `;
    }).join('');
  }

  // [WHATSAPP-02] Membuka dan menutup panel kontak WhatsApp.
  $('#waBtn').onclick = () => {
    $('#waPanel').hidden = !$('#waPanel').hidden;
  };

  // [WHATSAPP-03] Menutup panel saat pengguna mengklik area lain.
  document.addEventListener('click', e => {
    if (!e.target.closest('#wa')) {
      $('#waPanel').hidden = true;
    }
  });

  // =========================================================
  // [CONTROLS] FILTER, SORTIR, DAN PENCARIAN
  // =========================================================

  // [CONTROLS-01] Mengubah filter ketika chip diklik.
  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('.chip');

    if (b) {
      flt = b.dataset.f;
      render();
    }
  });

  // [CONTROLS-02] Mengubah sortir ketika pilihan dropdown berubah.
  $('#sort').addEventListener('change', e => {
    sort = e.target.value;
    render();
  });

  // [CONTROLS-03] Mengembalikan filter dan pencarian ke kondisi awal.
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

  // [CONTROLS-04] Menunda render sedikit agar pencarian lebih ringan.
  let tm;

  $('#q').addEventListener('input', e => {
    clearTimeout(tm);

    tm = setTimeout(() => {
      q = e.target.value.trim().slice(0, 60);
      render();
    }, 150);
  });

  // =========================================================
  // [START] MEMULAI KATALOG
  // =========================================================

  // [START-01] Memuat data dan menampilkan katalog.
  load();

})();
