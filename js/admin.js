(() => {
  'use strict';

  // =========================================================
  // [UTIL] FUNGSI BANTUAN UMUM
  // =========================================================

  // [UTIL-01] Ambil satu elemen DOM berdasarkan selector CSS.
  const $ = s => document.querySelector(s);

  // [UTIL-02] Escape karakter khusus sebelum dimasukkan ke HTML.
  const esc = s =>
    String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

  // [UTIL-03] Format angka menjadi mata uang Rupiah.
  const rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');

  // [UTIL-04] Ubah nama menjadi slug untuk nama file gambar.
  const slug = s =>
    (s || 'img')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || 'img';

  // [UTIL-05] Encode teks UTF-8 ke Base64 untuk GitHub API.
  const toB64 = s => {
    const b = new TextEncoder().encode(s);
    let r = '';

    for (let i = 0; i < b.length; i += 0x8000) {
      r += String.fromCharCode.apply(
        null,
        b.subarray(i, i + 0x8000)
      );
    }

    return btoa(r);
  };

  // [UTIL-06] Decode Base64 dari GitHub menjadi teks UTF-8.
  const fromB64 = s => {
    const b = atob(s.replace(/\s/g, ''));

    return new TextDecoder().decode(
      Uint8Array.from(b, c => c.charCodeAt(0))
    );
  };

  // [UTIL-07] Tambahkan HTTPS apabila URL tidak memiliki protokol.
  const fixUrl = v => {
    v = (v || '').trim();

    return v && !/^https?:\/\//i.test(v)
      ? 'https://' + v
      : v;
  };

  // [UTIL-08] Validasi URL HTTP atau HTTPS.
  const validUrl = v => {
    try {
      const u = new URL(v);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch (e) {
      return false;
    }
  };

  // [UTIL-09] Ubah error API menjadi pesan yang mudah dipahami.
  const errMsg = e =>
    e.status === 401
      ? 'Token tidak valid atau kedaluwarsa. Klik Keluar lalu masuk dengan token baru.'
      : e.status === 403
        ? 'Token tidak punya izin tulis, atau akses GitHub dibatasi sementara.'
        : e.message;

  // =========================================================
  // [STORAGE] PENYIMPANAN KONFIGURASI LOKAL
  // =========================================================

  const LS = 'katalog_admin_cfg';

  // [STORAGE-01] Baca, simpan, dan hapus konfigurasi localStorage.
  const ls = {
    get() {
      try {
        return JSON.parse(localStorage.getItem(LS) || '{}') || {};
      } catch (e) {
        return {};
      }
    },

    set(v) {
      try {
        localStorage.setItem(LS, JSON.stringify(v));
      } catch (e) {}
    },

    del() {
      try {
        localStorage.removeItem(LS);
      } catch (e) {}
    }
  };

  // =========================================================
  // [STATE] KONFIGURASI DAN STATUS APLIKASI
  // =========================================================

  // [CONFIG-01] Tebak owner dan repo saat memakai GitHub Pages.
  const guess = () => {
    const h = location.hostname;

    if (!h.endsWith('.github.io')) {
      return {};
    }

    const seg = location.pathname.split('/')[1];

    return {
      owner: h.split('.')[0],
      repo: seg && !seg.includes('.') ? seg : h
    };
  };

  // Konfigurasi awal aplikasi.
  let cfg = {
    branch: 'main',
    ...guess(),
    ...ls.get()
  };

  // Data utama, SHA GitHub, dan status perubahan.
  let data = {
    store: {},
    products: []
  };

  let sha = null;
  let loaded = false;
  let dirty = false;
  let storeEdited = false;

  // Status form serta file yang dipilih.
  let edit = -1;
  let pFile = null;
  let lFile = null;
  let hFile = null;
  let hDel = false;

  // Menyimpan Blob URL untuk preview gambar sebelum deploy selesai.
  const prev = {};

  // [IMAGE-01] Pilih sumber gambar preview atau URL aslinya.
  const src = p => prev[p] || p;

  // Kata kunci label populer.
  const BEST = /laris|best\s*seller|favorit|populer|\bhot\b/i;

  // [PRODUCT-01] Tentukan apakah produk masih berlabel Baru.
  const isNew = p => {
    const t = Date.parse(p.createdAt);

    return /^baru$/i.test(p.category || '') ||
      (!isNaN(t) &&
        (Date.now() - t) / 864e5 <= (+data.store.newDays || 14));
  };

  // [PRODUCT-02] Tentukan apakah produk termasuk Populer.
  const isPop = p =>
    p.popular === true ||
    /^populer$/i.test(p.category || '') ||
    BEST.test(p.badge || '');

  // Status panduan dan instalasi aplikasi.
  let cOn = false;
  let ci = 0;
  let installReady = false;
  let coachTimer = null;

  // =========================================================
  // [UI] NOTIFIKASI DAN STATUS TOMBOL
  // =========================================================

  let tt;

  // [UI-01] Tampilkan notifikasi sementara.
  function toast(m, bad) {
    const t = $('#toast');

    t.textContent = m;
    t.className = 'toast show' + (bad ? ' bad' : '');

    clearTimeout(tt);
    tt = setTimeout(() => {
      t.className = 'toast';
    }, 3600);
  }

  // [UI-02] Aktifkan atau nonaktifkan indikator proses tombol.
  const busy = (b, on) => b.classList.toggle('busy', on);

  // [UI-03] Periksa apakah tombol sedang menjalankan proses.
  const isBusy = b => b.classList.contains('busy');

  // [STATE-01] Tandai perubahan produk yang belum dipublikasikan.
  function setDirty(v) {
    dirty = v;
    $('#publish').disabled = !v;
  }

  // Peringatan ketika pengguna meninggalkan halaman dengan perubahan.
  addEventListener('beforeunload', e => {
    if (dirty || storeEdited) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // [UTIL-10] Jeda singkat sebelum mencoba kembali request.
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // =========================================================
  // [GITHUB] INTEGRASI GITHUB REST API
  // =========================================================

  // [GITHUB-01] Kirim request GitHub dengan token autentikasi.
  async function api(path, method = 'GET', body, retry = true) {
    let r;

    try {
      r = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${path}`,
        {
          method,
          cache: 'no-store',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer ' + cfg.token,
            ...(body ? {
              'Content-Type': 'application/json'
            } : {})
          },
          body: body ? JSON.stringify(body) : undefined
        }
      );
    } catch (e) {
      throw new Error(
        'Tidak bisa terhubung ke GitHub. Periksa koneksi internet.'
      );
    }

    if (!r.ok) {
      // Coba satu kali lagi jika terjadi benturan commit.
      if (r.status === 409 && method === 'PUT' && retry) {
        await wait(900);
        return api(path, method, body, false);
      }

      const j = await r.json().catch(() => ({}));
      const e = new Error(j.message || r.statusText);

      e.status = r.status;
      throw e;
    }

    return r.json();
  }

  // [GITHUB-02] Muat data toko dan produk dari repositori.
  async function pull() {
    try {
      const j = await api(
        `/contents/data/products.json?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`
      );

      sha = j.sha;
      data = JSON.parse(fromB64(j.content));
    } catch (e) {
      if (e.status !== 404) {
        throw e;
      }

      // Jika file belum tersedia, mulai dengan katalog kosong.
      sha = null;
      data = {
        store: {
          name: 'Toko Saya',
          theme: '#ee4d2d'
        },
        products: []
      };
    }

    if (!data || typeof data !== 'object') {
      data = {};
    }

    data.store = data.store || {};
    data.products = Array.isArray(data.products)
      ? data.products
      : [];
  }

  // [GITHUB-03] Publikasikan perubahan data/products.json.
  async function publish() {
    const b = $('#publish');

    if (isBusy(b)) {
      return;
    }

    if (!loaded) {
      return toast(
        'Data belum termuat. Muat ulang halaman sebelum publikasi.',
        true
      );
    }

    if (storeEdited) {
      document.querySelector('.tab[data-t=store]').click();

      return toast(
        'Ada perubahan Informasi toko yang belum disimpan. Klik "Simpan info toko" dulu.',
        true
      );
    }

    busy(b, true);

    try {
      const body = {
        message: 'Update katalog ' + new Date().toISOString().slice(0, 16),
        content: toB64(JSON.stringify(data, null, 2)),
        branch: cfg.branch
      };

      if (sha) {
        body.sha = sha;
      }

      const j = await api('/contents/data/products.json', 'PUT', body);

      sha = j.content.sha;
      setDirty(false);

      toast('✅️Berhasil Dipublis. Katalog diperbarui dalam 1-2 menit.');
    } catch (e) {
      toast(
        e.status === 409 || e.status === 422
          ? 'Data di GitHub sudah berubah. Muat ulang halaman lalu coba lagi.'
          : 'Gagal publikasi: ' + errMsg(e),
        true
      );
    }

    busy(b, false);
  }

  // =========================================================
  // [IMAGE] KOMPRESI DAN UPLOAD GAMBAR
  // =========================================================

  // [IMAGE-02] Kompres gambar ke JPEG dan batasi dimensi maksimal.
  const shrink = (f, max) => new Promise((res, rej) => {
    const i = new Image();
    const u = URL.createObjectURL(f);

    i.onload = () => {
      URL.revokeObjectURL(u);

      if (!i.width || !i.height) {
        return rej(new Error('Ukuran gambar tidak valid'));
      }

      const k = Math.min(
        1,
        max / Math.max(i.width, i.height)
      );

      const c = document.createElement('canvas');

      c.width = Math.max(1, Math.round(i.width * k));
      c.height = Math.max(1, Math.round(i.height * k));

      const x = c.getContext('2d');

      x.fillStyle = '#fff';
      x.fillRect(0, 0, c.width, c.height);
      x.drawImage(i, 0, 0, c.width, c.height);

      c.toBlob(
        b => b
          ? res(b)
          : rej(new Error('Gagal memproses gambar')),
        'image/jpeg',
        .82
      );
    };

    i.onerror = () => {
      URL.revokeObjectURL(u);

      rej(new Error(
        'File bukan gambar yang didukung (gunakan JPG, PNG, atau WebP)'
      ));
    };

    i.src = u;
  });

  // [IMAGE-03] Konversi Blob menjadi Base64.
  const blobB64 = b => new Promise((res, rej) => {
    const f = new FileReader();

    f.onload = () => res(f.result.split(',')[1]);
    f.onerror = () => rej(new Error('Gagal membaca gambar'));

    f.readAsDataURL(b);
  });

  // [IMAGE-04] Upload gambar ke folder images/ dalam repositori.
  async function upload(file, max, name) {
    const blob = await shrink(file, max);
    const path = `images/${Date.now()}-${slug(name)}.jpg`;

    await api('/contents/' + path, 'PUT', {
      message: 'Upload ' + path,
      content: await blobB64(blob),
      branch: cfg.branch
    });

    prev[path] = URL.createObjectURL(blob);

    return path;
  }

  // =========================================================
  // [AUTH] LOGIN, MASUK DASHBOARD, DAN LOGOUT
  // =========================================================

  // [AUTH-01] Tampilkan form login GitHub.
  function showLogin() {
    $('#login').hidden = false;
    $('#app').hidden = true;

    $('#fOwner').value = cfg.owner || '';
    $('#fRepo').value = cfg.repo || '';
    $('#fBranch').value = cfg.branch || 'main';
    $('#fToken').value = '';
  }

  // [AUTH-02] Masuk ke dashboard dan muat data toko.
  async function enter() {
    $('#login').hidden = true;
    $('#app').hidden = false;

    try {
      await pull();
      loaded = true;
    } catch (e) {
      loaded = false;
      toast('Gagal memuat data: ' + errMsg(e), true);
    }

    renderList();
    fillStore();
    maybeCoach();
  }

  // [AUTH-03] Validasi token dan izin akses repositori.
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();

    const b = $('#loginBtn');

    if (isBusy(b)) {
      return;
    }

    busy(b, true);
    $('#loginErr').textContent = '';

    const old = cfg;

    cfg = {
      owner: $('#fOwner').value.trim(),
      repo: $('#fRepo').value.trim(),
      branch: $('#fBranch').value.trim() || 'main',
      token: $('#fToken').value.trim()
    };

    let ok = false;

    try {
      const r = await api('');

      if (r.permissions && r.permissions.push === false) {
        throw new Error(
          'Token tidak punya izin tulis ke repo ini. Aktifkan Contents: Read and write.'
        );
      }

      ls.set(cfg);
      ok = true;
    } catch (err) {
      cfg = old;

      $('#loginErr').textContent =
        err.status === 401
          ? 'Token salah atau kedaluwarsa.'
          : err.status === 404
            ? 'Repo tidak ditemukan. Periksa username, nama repo, dan izin token.'
            : errMsg(err);
    }

    busy(b, false);

    if (ok) {
      await enter();
    }
  });

  // [AUTH-04] Hapus konfigurasi lokal dan kembali ke login.
  $('#logout').onclick = () => {
    if (
      (dirty || storeEdited) &&
      !confirm('Ada perubahan Informasi yang belum dipublikasikan. Tetap keluar?')
    ) {
      return;
    }

    ls.del();

    cfg = {
      branch: 'main',
      ...guess()
    };

    data = {
      store: {},
      products: []
    };

    sha = null;
    loaded = false;

    setDirty(false);
    storeEdited = false;
    showLogin();
  };

  // Hubungkan tombol Publikasikan dengan fungsi publish().
  $('#publish').onclick = publish;

  // =========================================================
  // [NAV] PERGANTIAN TAB
  // =========================================================

  // [NAV-01] Kelola tab Produk dan Info Toko.
  document.querySelectorAll('.tab').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.tab').forEach(x => {
        x.classList.toggle('on', x === b);
      });

      $('#tab-products').hidden = b.dataset.t !== 'products';
      $('#tab-store').hidden = b.dataset.t !== 'store';
    };
  });

  // =========================================================
  // [PRODUCT] DAFTAR DAN PENGELOLAAN PRODUK
  // =========================================================

  // [PRODUCT-03] Render daftar produk dan status tampilannya.
  function renderList() {
    const L = data.products;
    const act = L.filter(p => p.active !== false).length;

    $('#stats').textContent =
      `${L.length} produk, ${act} tampil di katalog`;

    $('#list').innerHTML = L.length
      ? L.map((p, i) => `
    <article class="item ${p.active === false ? 'off' : ''}">
      <div class="th">${p.image ? `<img src="${esc(src(p.image))}" alt="">` : '🛍️'}</div>
      <div class="info"><b>${esc(p.name)}</b><span>${rp(p.price)}${p.category && !/^(baru|populer)$/i.test(p.category) ? ' • ' + esc(p.category) : ''}</span>
        <div class="tags"><span class="tag ${p.active === false ? 'off' : ''}">${p.active === false ? 'Disembunyikan' : 'Tampil'}</span>${isNew(p) ? '<span class="tag new">Baru</span>' : ''}${isPop(p) ? '<span class="tag pop">Populer</span>' : ''}</div></div>
      <div class="acts" data-i="${i}">
        <button data-a="up" title="Naikkan" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button data-a="down" title="Turunkan" ${i === L.length - 1 ? 'disabled' : ''}>↓</button>
        <button data-a="edit">Ubah</button><button data-a="del" class="del">Hapus</button>
      </div></article>`).join('')
      : '<div class="empty">Belum ada produk. Klik "Tambah produk" untuk mulai.</div>';
  }

  // [PRODUCT-04] Tampilkan ikon jika thumbnail produk gagal dimuat.
  document.addEventListener('error', e => {
    const t = e.target;

    if (t && t.tagName === 'IMG' && t.closest('.th')) {
      t.replaceWith('🛍️');
    }
  }, true);

  // [PRODUCT-05] Tangani edit, hapus, serta perubahan urutan produk.
  $('#list').addEventListener('click', e => {
    const b = e.target.closest('button[data-a]');

    if (!b) {
      return;
    }

    const i = +b.parentElement.dataset.i;
    const L = data.products;
    const a = b.dataset.a;

    if (a === 'edit') {
      return openModal(i);
    }

    if (a === 'del') {
      if (!confirm(`Hapus "${L[i].name}"?`)) {
        return;
      }

      L.splice(i, 1);
    } else if (a === 'up' && i > 0) {
      const t = L[i - 1];

      L[i - 1] = L[i];
      L[i] = t;
    } else if (a === 'down' && i < L.length - 1) {
      const t = L[i + 1];

      L[i + 1] = L[i];
      L[i] = t;
    }

    setDirty(true);
    renderList();
  });

  // [PRODUCT-06] Buka form kosong untuk membuat produk baru.
  $('#addBtn').onclick = () => openModal(-1);

  // =========================================================
  // [FORM] FORM TAMBAH DAN UBAH PRODUK
  // =========================================================

  // [FORM-01] Isi modal berdasarkan produk yang dipilih.
  function openModal(i) {
    edit = i;
    pFile = null;

    const p = i >= 0 ? data.products[i] : { active: true };

    // Kategori lama "Baru/Populer" diperlakukan sebagai label.
    const legacy = /^(baru|populer)$/i.test(p.category || '');

    $('#mTitle').textContent =
      i >= 0 ? 'Edit produk' : 'Tambah produk';

    $('#pName').value = p.name || '';
    $('#pPrice').value = p.price ?? '';
    $('#pOld').value = p.oldPrice || '';
    $('#pCat').value = legacy ? '' : (p.category || '');
    $('#pBadge').value = p.badge || '';
    $('#pDesc').value = p.desc || '';

    $('#pPopular').checked =
      p.popular === true || /^populer$/i.test(p.category || '');

    $('#pRenew').checked = false;
    $('#renewRow').hidden = i < 0;

    $('#newHint').textContent =
      `Produk otomatis berlabel Baru selama ${+data.store.newDays || 14} hari sejak dibuat (atur di tab Info toko). Label "Terlaris" atau "Best Seller" juga dihitung Populer.`;

    $('#pShopee').value = p.shopee || '';
    $('#pActive').checked = p.active !== false;
    $('#pFile').value = '';

    $('#pPrev').innerHTML = p.image
      ? `<img src="${esc(src(p.image))}" alt="">`
      : '🛍️';

    $('#cats').innerHTML = [
      ...new Set(
        data.products
          .map(x => x.category)
          .filter(c => c && !/^(baru|populer)$/i.test(c))
      )
    ].map(c => `<option value="${esc(c)}">`).join('');

    $('#modal').hidden = false;
    $('#pName').focus();
  }

  // [FORM-02] Tutup modal produk.
  const closeModal = () => {
    $('#modal').hidden = true;
  };

  $('#mClose').onclick = closeModal;

  // Tutup modal ketika area luar form diklik.
  $('#modal').addEventListener('click', e => {
    if (e.target.id === 'modal') {
      closeModal();
    }
  });

  // Tutup modal dengan tombol Escape.
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modal').hidden) {
      closeModal();
    }
  });

  // [FORM-03] Tampilkan preview foto produk yang dipilih.
  $('#pFile').onchange = e => {
    pFile = e.target.files[0] || null;

    if (pFile) {
      $('#pPrev').innerHTML =
        `<img src="${URL.createObjectURL(pFile)}" alt="">`;
    }
  };

  // [FORM-04] Validasi dan simpan produk ke state lokal.
  $('#pForm').addEventListener('submit', async e => {
    e.preventDefault();

    const b = $('#pSave');

    if (isBusy(b)) {
      return;
    }

    const name = $('#pName').value.trim();
    const shopee = fixUrl($('#pShopee').value);

    if (!name) {
      return toast('Nama produk wajib diisi', true);
    }

    if (!validUrl(shopee)) {
      return toast(
        'Link Shopee tidak valid. Salin ulang dari aplikasi atau situs Shopee.',
        true
      );
    }

    busy(b, true);

    try {
      const old = edit >= 0 ? data.products[edit] : {};
      let image = old.image || '';

      if (pFile) {
        b.textContent = 'Mengunggah Gambar...';
        image = await upload(pFile, 1000, name);
      }

      const wasLegacyNew =
        /^baru$/i.test(old.category || '') && !old.createdAt;

      const p = {
        id: old.id || 'p' + Date.now().toString(36),
        name,
        price: Math.max(0, +$('#pPrice').value || 0),
        oldPrice: Math.max(0, +$('#pOld').value || 0),
        category: $('#pCat').value.trim(),
        badge: $('#pBadge').value.trim(),
        desc: $('#pDesc').value.trim(),
        image,
        shopee,
        active: $('#pActive').checked,
        popular: $('#pPopular').checked,
        createdAt: (
          edit < 0 || $('#pRenew').checked || wasLegacyNew
        )
          ? new Date().toISOString()
          : (old.createdAt || '')
      };

      if (edit >= 0) {
        data.products[edit] = p;
      } else {
        data.products.push(p);
      }

      pFile = null;

      setDirty(true);
      renderList();
      closeModal();

      toast('Produk disimpan. Klik Publikasikan untuk menayangkan.');
    } catch (err) {
      toast('Gagal menyimpan: ' + errMsg(err), true);
    }

    b.textContent = 'Simpan produk';
    busy(b, false);
  });

  // =========================================================
  // [STORE] INFO TOKO DAN KONTAK
  // =========================================================

  const ROLES = ['Seller', 'Agen', 'Distributor'];

  // [STORE-01] Normalisasi nomor telepon Indonesia ke awalan 62.
  const normPhone = v => {
    let d = String(v || '').replace(/\D/g, '');

    if (d.startsWith('0')) {
      d = '62' + d.slice(1);
    } else if (d.startsWith('8')) {
      d = '62' + d;
    }

    return d;
  };

  // [STORE-02] Buat satu baris kontak toko.
  function contactRow(c = {}) {
    const d = document.createElement('div');

    d.className = 'crow';

    d.innerHTML = `
      <input class="cn" placeholder="Nama kontak" maxlength="40" value="${esc(c.name || '')}">
      <select class="cr" aria-label="Peran">${ROLES.map(r => `<option ${r === c.role ? 'selected' : ''}>${r}</option>`).join('')}</select>
      <input class="cp" type="tel" inputmode="tel" placeholder="08xxxxxxxxxx" value="${esc(c.phone || '')}">
      <button type="button" class="x cd" aria-label="Hapus kontak">×</button>
    `;

    return d;
  }

  // [STORE-03] Perbarui preview foto header toko.
  function setHdrPrev(p) {
    const h = $('#hdrPrev');

    h.style.backgroundImage = p ? `url("${src(p)}")` : '';
    h.textContent = p ? '' : 'Belum ada foto';
  }

  // [STORE-04] Isi form Info Toko dari data toko yang dimuat.
  function fillStore() {
    const s = data.store;

    $('#sName').value = s.name || '';
    $('#sTag').value = s.tagline || '';
    $('#sIg').value = s.instagram || '';
    $('#sShop').value = s.shopeeStore || '';
    $('#sNewDays').value = +s.newDays || 14;

    $('#sTheme').value =
      /^#[0-9a-f]{6}$/i.test(s.theme || '')
        ? s.theme
        : '#ee4d2d';

    $('#logoPrev').innerHTML = s.logo
      ? `<img src="${esc(src(s.logo))}" alt="">`
      : '🏪';

    setHdrPrev(s.headerImage);

    hFile = null;
    hDel = false;
    lFile = null;

    $('#hdrFile').value = '';
    $('#logoFile').value = '';

    $('#contacts').replaceChildren(
      ...(Array.isArray(s.contacts) ? s.contacts : []).map(contactRow)
    );

    storeEdited = false;
  }

  // [STORE-05] Tandai bahwa Info Toko memiliki perubahan.
  const markStore = () => {
    storeEdited = true;
  };

  $('#storeForm').addEventListener('input', markStore);
  $('#storeForm').addEventListener('change', markStore);

  // [STORE-06] Tampilkan preview logo toko.
  $('#logoFile').onchange = e => {
    lFile = e.target.files[0] || null;

    if (lFile) {
      $('#logoPrev').innerHTML =
        `<img src="${URL.createObjectURL(lFile)}" alt="">`;
    }
  };

  // [STORE-07] Tampilkan preview foto header toko.
  $('#hdrFile').onchange = e => {
    hFile = e.target.files[0] || null;

    if (hFile) {
      hDel = false;
      setHdrPrev(URL.createObjectURL(hFile));
    }
  };

  // [STORE-08] Tandai header untuk dihapus ketika Info Toko disimpan.
  $('#hdrDel').onclick = () => {
    hFile = null;
    hDel = true;
    $('#hdrFile').value = '';

    setHdrPrev('');
    markStore();
  };

  // [STORE-09] Tambahkan baris kontak baru.
  $('#addContact').onclick = () => {
    $('#contacts').append(contactRow());
    markStore();
  };

  // [STORE-10] Hapus baris kontak yang dipilih.
  $('#contacts').addEventListener('click', e => {
    if (e.target.closest('.cd')) {
      e.target.closest('.crow').remove();
      markStore();
    }
  });

  // [STORE-11] Validasi dan simpan Info Toko serta gambar terkait.
  $('#storeForm').addEventListener('submit', async e => {
    e.preventDefault();

    const b = e.target.querySelector('button.primary');

    if (isBusy(b)) {
      return;
    }

    const ig = fixUrl($('#sIg').value);
    const shop = fixUrl($('#sShop').value);

    if ((ig && !validUrl(ig)) || (shop && !validUrl(shop))) {
      return toast('Link Instagram atau Shopee tidak valid', true);
    }

    const rows = [...document.querySelectorAll('#contacts .crow')];

    const contacts = rows
      .map(r => ({
        role: r.querySelector('.cr').value,
        phone: normPhone(r.querySelector('.cp').value),
        name: r.querySelector('.cn').value.trim() ||
          r.querySelector('.cr').value
      }))
      .filter(c => c.phone.length >= 9 && c.phone.length <= 15);

    busy(b, true);

    try {
      const s = data.store;

      if (lFile) {
        s.logo = await upload(lFile, 400, 'logo');
        lFile = null;
      }

      if (hFile) {
        s.headerImage = await upload(hFile, 1600, 'header');
        hFile = null;
      } else if (hDel) {
        s.headerImage = '';
      }

      Object.assign(s, {
        name: $('#sName').value.trim(),
        tagline: $('#sTag').value.trim(),
        instagram: ig,
        shopeeStore: shop,
        theme: $('#sTheme').value,
        newDays: Math.min(
          90,
          Math.max(1, +$('#sNewDays').value || 14)
        ),
        contacts
      });

      fillStore();
      setDirty(true);

      toast(
        contacts.length < rows.length
          ? 'Tersimpan. Kontak dengan nomor tidak valid dilewati. Klik Publikasikan.'
          : 'Info toko disimpan. Klik Publikasikan untuk menayangkan.'
      );
    } catch (err) {
      toast('Gagal menyimpan: ' + errMsg(err), true);
    }

    busy(b, false);
  });

  // =========================================================
  // [PWA] SERVICE WORKER DAN POPUP INSTALASI
  // =========================================================

  // Daftarkan service worker jika browser mendukungnya.
  if ('serviceWorker' in navigator) {
    addEventListener('load', () => {
      navigator.serviceWorker
        .register('sw.js')
        .then(r => r.update())
        .catch(() => {});
    });
  }

  // [PWA-01] Periksa apakah aplikasi berjalan dalam mode terpasang.
  const standalone = () =>
    matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true;

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let dp = null;

  // [PWA-02] Tampilkan instruksi instalasi sesuai browser.
  function showInstall() {
    if (cOn || standalone() || sessionStorage.getItem('instLater')) {
      return;
    }

    if (dp) {
      $('#installBtn').hidden = false;

      $('#installTxt').textContent =
        'Install aplikasi agar admin bisa dibuka cepat di layar depan.';
    } else {
      $('#installBtn').hidden = true;

      $('#installTxt').textContent = ios
        ? 'Di Safari (ios), ketuk tombol Bagikan lalu pilih "Tambah ke Layar Utama".'
        : 'Buka menu browser (titik tiga) lalu pilih "Instal aplikasi" atau "Tambahkan ke layar utama".';
    }

    $('#install').hidden = false;
  }

  // Tangkap prompt instalasi PWA.
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    dp = e;
    showInstall();
  });

  // Sembunyikan popup jika aplikasi selesai terpasang.
  addEventListener('appinstalled', () => {
    $('#install').hidden = true;
    toast('Aplikasi admin terpasang');
  });

  // [PWA-03] Jalankan prompt instalasi yang disediakan browser.
  $('#installBtn').onclick = async () => {
    if (!dp) {
      return;
    }

    dp.prompt();

    try {
      await dp.userChoice;
    } catch (e) {}

    dp = null;
    $('#install').hidden = true;
  };

  // [PWA-04] Tutup popup instalasi untuk sesi saat ini.
  $('#installLater').onclick = () => {
    try {
      sessionStorage.setItem('instLater', '1');
    } catch (e) {}

    $('#install').hidden = true;
  };

  // Tampilkan popup instalasi setelah halaman selesai dimuat.
  setTimeout(() => {
    showInstall();
    installReady = true;
  }, 900);

  // =========================================================
  // [COACH] PANDUAN PENGGUNA BARU
  // =========================================================

  // [COACH-01] Bentuk kunci penyimpanan berdasarkan repo aktif.
  const CK = () => `katalog_coach_v1_${cfg.owner}/${cfg.repo}`;

  // [COACH-02] Periksa apakah panduan pernah diselesaikan.
  const coachDone = () => {
    try {
      return localStorage.getItem(CK()) === '1';
    } catch (e) {
      return false;
    }
  };

  // [COACH-03] Simpan status penyelesaian panduan.
  const markCoach = () => {
    try {
      localStorage.setItem(CK(), '1');
    } catch (e) {}
  };

  // Daftar langkah dan elemen yang disorot saat panduan berjalan.
  const STEPS = [
    {
      t: 'Selamat datang',
      p: 'Panduan singkat ini menunjukkan cara mengelola katalog. Hanya 3 langkah: lengkapi info toko, tambah produk, lalu publikasikan.'
    },
    {
      tab: 'store',
      sel: '#storeForm .logo-row',
      t: '1. Lengkapi Profil toko',
      p: 'Isi nama toko, deskripsi singkat, logo, serta link Instagram dan toko Shopee. Informasi ini tampil di bagian atas katalog.'
    },
    {
      tab: 'store',
      sel: '#hdrPrev',
      t: 'Foto header',
      p: 'Unggah foto lebar sebagai latar bagian atas katalog. Kosongkan jika ingin latar polos berwarna tema.'
    },
    {
      tab: 'store',
      sel: '#addContact',
      t: 'Balon WhatsApp',
      p: 'Tambahkan kontak Seller, Agen, atau Distributor. Pengunjung bisa langsung chat lewat balon WhatsApp di katalog. Klik "Simpan info toko" setelah selesai mengisi.'
    },
    {
      tab: 'products',
      sel: '#addBtn',
      t: '2. Tambah produk',
      p: 'Isi nama, harga, foto, dan link produk dari Shopee/ecommerce. Produk baru otomatis masuk filter "Baru". Centang "Tandai Populer" agar muncul di filter "Populer".'
    },
    {
      tab: 'products',
      sel: '#list',
      t: 'Kelola produk',
      p: 'Pakai ↑ ↓ untuk mengatur urutan dan Ubah untuk mengedit. Matikan "Tampilkan di katalog" untuk menyembunyikan produk tanpa menghapusnya.'
    },
    {
      sel: '#publish',
      t: '3. Publikasikan',
      p: 'Semua perubahan baru tayang setelah kamu klik Publikasikan. Titik putih pada tombol berarti masih ada perubahan yang belum dipublikasikan.'
    },
    {
      sel: '#viewBtn',
      t: 'Lihat hasilnya',
      p: 'Buka katalog untuk memeriksa tampilan. Perubahan muncul sekitar 1-2 menit setelah publikasi. Tempel link katalog di bio Instagram. Link khusus seperti ?f=populer atau ?f=baru bisa dipakai di story.'
    },
    {
      sel: '#coachBtn',
      t: 'Selesai! 🎉',
      p: 'Panduan ini bisa dibuka lagi kapan saja lewat tombol Panduan.'
    }
  ];

  // [COACH-04] Atur posisi sorotan dan kartu panduan.
  function place() {
    if (!cOn) {
      return;
    }

    const s = STEPS[ci];
    const el = s.sel && document.querySelector(s.sel);
    const co = $('#coach');
    const card = co.querySelector('.co-card');
    const hole = co.querySelector('.co-hole');
    const r = el && el.getBoundingClientRect();

    if (!r || !r.width) {
      co.classList.add('center');
      card.style.top = card.style.left = '';
      return;
    }

    co.classList.remove('center');

    const pad = 6;
    const vh = innerHeight;
    const vw = innerWidth;
    const h = Math.min(r.height, vh * .45);

    Object.assign(hole.style, {
      left: r.left - pad + 'px',
      top: r.top - pad + 'px',
      width: r.width + pad * 2 + 'px',
      height: h + pad * 2 + 'px'
    });

    const cw = card.offsetWidth;
    const ch = card.offsetHeight;

    let top = r.top + h + pad + 12;

    if (top + ch > vh - 8) {
      top = r.top - pad - 12 - ch;
    }

    if (top < 8) {
      top = Math.max(8, vh - ch - 8);
    }

    card.style.top = top + 'px';

    card.style.left =
      Math.min(
        Math.max(8, r.left + r.width / 2 - cw / 2),
        vw - cw - 8
      ) + 'px';
  }

  // [COACH-05] Render langkah panduan yang sedang aktif.
  function showStep() {
    const s = STEPS[ci];

    if (s.tab) {
      document.querySelector(`.tab[data-t=${s.tab}]`).click();
    }

    $('#coS').textContent = `Langkah ${ci + 1} dari ${STEPS.length}`;
    $('#coT').textContent = s.t;
    $('#coP').textContent = s.p;

    $('#coD').innerHTML = STEPS.map((_, k) =>
      `<i class="${k === ci ? 'on' : ''}"></i>`
    ).join('');

    $('#coBack').hidden = ci === 0;
    $('#coNext').textContent =
      ci === STEPS.length - 1 ? 'Selesai' : 'Lanjut';

    const el = s.sel && document.querySelector(s.sel);

    if (el && el.getBoundingClientRect().width) {
      el.scrollIntoView({ block: 'center' });
    }

    requestAnimationFrame(() => requestAnimationFrame(place));

    $('#coNext').focus({ preventScroll: true });
  }

  // [COACH-06] Mulai panduan dari langkah pertama.
  function startCoach() {
    if (cOn) {
      return;
    }

    cOn = true;
    ci = 0;

    $('#install').hidden = true;
    $('#coach').hidden = false;

    showStep();
  }

  // [COACH-07] Akhiri panduan dan simpan status selesai.
  function endCoach() {
    cOn = false;
    $('#coach').hidden = true;

    markCoach();

    document.querySelector('.tab[data-t=products]').click();
    scrollTo(0, 0);
  }

  // [COACH-08] Tampilkan panduan otomatis setelah popup instalasi selesai.
  function maybeCoach() {
    if (coachDone() || cOn || !loaded || coachTimer) {
      return;
    }

    // Tunggu popup instalasi selesai agar tidak bertumpuk.
    coachTimer = setInterval(() => {
      if (installReady && $('#install').hidden) {
        clearInterval(coachTimer);
        coachTimer = null;

        if (!coachDone() && !$('#app').hidden) {
          setTimeout(startCoach, 300);
        }
      }
    }, 400);
  }

  // Tombol navigasi panduan.
  $('#coNext').onclick = () => {
    if (ci >= STEPS.length - 1) {
      endCoach();
    } else {
      ci++;
      showStep();
    }
  };

  $('#coBack').onclick = () => {
    if (ci > 0) {
      ci--;
      showStep();
    }
  };

  $('#coSkip').onclick = endCoach;
  $('#coachBtn').onclick = startCoach;

  addEventListener('resize', place);
  addEventListener('scroll', place, true);

  // Navigasi panduan dengan tombol keyboard.
  addEventListener('keydown', e => {
    if (!cOn) {
      return;
    }

    if (e.key === 'Escape') {
      endCoach();
    } else if (e.key === 'ArrowRight') {
      $('#coNext').click();
    } else if (e.key === 'ArrowLeft' && ci > 0) {
      $('#coBack').click();
    }
  });

  // =========================================================
  // [START] MULAI APLIKASI
  // =========================================================

  cfg.token ? enter() : showLogin();

  // =========================================================
  // [ARINEX ADD-ON] PROTEKSI BROWSER
  // Anti-copy, anti-paste pada konten, anti-klik kanan,
  // pembatasan shortcut umum, dan proteksi interaksi gambar.
  //
  // Penting:
  // Proteksi browser bukan sistem keamanan mutlak.
  // Screenshot, developer tools, dan akses langsung ke file gambar
  // tetap mungkin dilakukan melalui cara lain.
  // =========================================================

  (function installBrowserProtection() {
    'use strict';

    // [PROTECT-01] Daftar elemen yang harus tetap bisa diedit.
    // Input admin tetap mengizinkan paste agar login dan formulir normal.
    const editableSelector =
      'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]';

    // Periksa apakah target event berada di area input yang dapat diedit.
    const isEditable = target =>
      target instanceof Element &&
      !!target.closest(editableSelector);

    // [PROTECT-02] Blok menu klik kanan di luar field yang dapat diedit.
    document.addEventListener('contextmenu', event => {
      if (!isEditable(event.target)) {
        event.preventDefault();
      }
    }, true);

    // [PROTECT-03] Cegah seleksi teks di konten halaman.
    document.addEventListener('selectstart', event => {
      if (!isEditable(event.target)) {
        event.preventDefault();
      }
    }, true);

    // [PROTECT-04] Blok salin, potong, dan tempel di luar area input.
    ['copy', 'cut', 'paste'].forEach(type => {
      document.addEventListener(type, event => {
        if (!isEditable(event.target)) {
          event.preventDefault();
        }
      }, true);
    });

    // [PROTECT-05] Cegah gambar dan tautan diseret ke tab lain.
    document.addEventListener('dragstart', event => {
      const target = event.target;

      if (
        target instanceof Element &&
        target.closest('img, picture, a, .th, #hdrPrev, #logoPrev')
      ) {
        event.preventDefault();
      }
    }, true);

    // [PROTECT-06] Batasi shortcut clipboard dan shortcut browser umum.
    // Shortcut copy/paste di form tetap diizinkan agar login berfungsi.
    document.addEventListener('keydown', event => {
      const key = String(event.key || '').toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      const inEditable = isEditable(event.target);

      // F12 dan Shift+F10.
      if (
        key === 'f12' ||
        (event.shiftKey && key === 'f10')
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (!modifier) {
        return;
      }

      // Blok Ctrl/Cmd+C, X, V, dan A di luar form.
      if (
        ['c', 'x', 'v', 'a'].includes(key) &&
        !inEditable
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // Blok Ctrl/Cmd+S, P, U, serta kombinasi developer tools umum.
      if (
        key === 's' ||
        key === 'p' ||
        key === 'u' ||
        (event.shiftKey && ['i', 'j', 'c'].includes(key))
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    // [PROTECT-07] Nonaktifkan drag dan callout pada gambar.
    function protectImages(root) {
      const images = root instanceof HTMLImageElement
        ? [root]
        : (root && root.querySelectorAll
          ? root.querySelectorAll('img')
          : []);

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

    // [PROTECT-08] Pantau gambar baru yang muncul di DOM.
    // Berguna untuk thumbnail produk yang dirender secara dinamis.
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

    // [PROTECT-09] Tambahkan CSS proteksi tanpa mengubah file CSS utama.
    // Field input, textarea, select, dan contenteditable dikecualikan.
    if (!document.getElementById('arinex-browser-protection-style')) {
      const protectionStyle = document.createElement('style');

      protectionStyle.id = 'arinex-browser-protection-style';

      protectionStyle.textContent = `
        html, body,
        body *:not(input):not(textarea):not(select):not([contenteditable="true"]):not([contenteditable=""]):not([role="textbox"]) {
          -webkit-touch-callout: none !important;
        }

        body,
        body *:not(input):not(textarea):not(select):not([contenteditable="true"]):not([contenteditable=""]):not([role="textbox"]) {
          -webkit-user-select: none !important;
          user-select: none !important;
        }

        img, picture {
          -webkit-user-drag: none !important;
          user-drag: none !important;
        }
      `;

      (document.head || document.documentElement)
        .appendChild(protectionStyle);
    }
  })();


  // =========================================================
  // [PROTECT-08] MENCEGAH ZOOM HALAMAN
  // =========================================================

  // Mencegah zoom melalui gesture pada perangkat sentuh.
  document.addEventListener('gesturestart', e => {
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('gesturechange', e => {
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('gestureend', e => {
    e.preventDefault();
  }, { passive: false });

  // Mencegah pinch-to-zoom melalui beberapa sentuhan.
  document.addEventListener('touchmove', e => {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });

  // Mencegah zoom melalui double-tap di perangkat sentuh.
  let lastTouchEnd = 0;

  document.addEventListener('touchend', e => {
    const now = Date.now();

    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }

    lastTouchEnd = now;
  }, { passive: false });

  // Mengunci skala viewport agar halaman tetap pada ukuran awal.
  function lockPageZoom() {
    let viewport = document.querySelector(
      'meta[name="viewport"]'
    );

    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.appendChild(viewport);
    }

    viewport.content =
      'width=device-width, initial-scale=1.0, ' +
      'maximum-scale=1.0, minimum-scale=1.0, ' +
      'user-scalable=no, viewport-fit=cover';
  }

  lockPageZoom();

  
})();
