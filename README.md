# Katalog Instagram + Shopee (tanpa database)

- `index.html`  : halaman publik (taruh linknya di bio Instagram)
- `admin.html`  : dashboard admin (PWA, ada popup install)
- `data/products.json` : "database" (di-commit oleh admin)
- `images/`     : foto produk (diunggah admin lewat GitHub API)

## Cara pakai
1. Buat repo GitHub (mis. `katalog`), unggah semua isi folder ini ke branch `main`.
2. Settings > Pages > Deploy from branch > `main` / root.
3. Buat token: GitHub > Settings > Developer settings > Fine-grained tokens.
   Pilih repo katalog saja, izin **Contents: Read and write**.
4. Buka `https://USERNAME.github.io/katalog/admin.html`, masuk memakai token.
5. Tambah produk, lalu klik **Publikasikan**. Katalog diperbarui dalam 1-2 menit.
6. Tempel `https://USERNAME.github.io/katalog/` di bio Instagram.

## Catatan keamanan
- Token disimpan di browser perangkat admin (localStorage). Pakai token khusus repo ini dan jangan dibagikan.
- Siapa pun yang menemukan `admin.html` tidak bisa mengubah apa pun tanpa token.

## Fitur tambahan
- Katalog: klik kanan, seleksi teks, copy, dan drag dinonaktifkan; klik kartu produk untuk popup detail & deskripsi.
- Admin > Info toko: unggah foto header dan atur kontak WhatsApp (Seller / Agen / Distributor) yang tampil sebagai balon chat di katalog.
- Catatan: proteksi salin hanya menghalangi pengguna awam. Siapa pun yang ahli tetap bisa mengambil konten lewat tools browser.
