# Catatan Validasi Teknis M0

## Status awal

- Frontend: Vite, React, TypeScript, Konva, dan React Konva.
- Sistem koordinat: posisi pusat penanda disimpan sebagai rasio `0..1`.
- POC: pan, zoom relatif pointer, drag, resize, rotasi, fit-to-screen, dan render sintetis 500 penanda.
- Data POC sepenuhnya sintetis; tidak memakai database atau aset production.

## Hasil pemeriksaan 21 Agustus 2026

- Unit test koordinat: 3 lulus.
- Typecheck dan build production: lulus.
- Playwright: desktop `1440x900`, tablet `1024x768`, dan mobile `390x844` lulus tanpa console error.
- Zoom tombol: berubah dari 88% menjadi 101%.
- Render 500 penanda sintetis: sekitar 51 ms pada mesin pengembangan; hasil ini belum mewakili perangkat operasional.
- Bundle JavaScript awal: sekitar 506 kB minified atau 156 kB gzip, didominasi React dan Konva.

Graphify pada aplikasi sumber menunjukkan integrasi sesi berpusat pada `AuthFilter`, `RoleFilter`, dan `BaseController`. Spike `/api/v1/me` berikutnya harus mengembalikan JSON `401` untuk request API, bukan redirect halaman login.

## Hasil pemeriksaan 27 Agustus 2026

- `GET /api/v1/me` sudah tersedia dan shell React memakainya dengan cookie same-origin.
- API read-only daftar/detail peta dan resolver peralatan sudah tersedia serta dilindungi filter `auth`.
- PHPUnit fokus: 7 tes dan 19 assertion lulus; warning hanya karena driver code coverage tidak terpasang.
- Vitest: 5 tes lulus; typecheck dan build production lulus.
- Playwright memverifikasi sesi valid, deep-link peralatan, sesi `401`, desktop `1440x900`, dan mobile `390x844` tanpa console error atau horizontal overflow.
- Bundle JavaScript sekitar 508 kB minified atau 157 kB gzip; pemisahan bundle Konva ditunda sampai shell viewer/editor dipisahkan menjadi route nyata.

## Rumus koordinat

```text
x_ratio = clamp(x_pixel / lebar_asli, 0, 1)
y_ratio = clamp(y_pixel / tinggi_asli, 0, 1)
x_pixel = x_ratio * lebar_asli
y_pixel = y_ratio * tinggi_asli
```

## Hasil pemeriksaan viewer M2 — 27 Agustus 2026

- Viewer memuat daftar serta detail peta dari API dan memakai dimensi asli gambar sebagai ruang koordinat.
- Pemilih peta dikelompokkan per gedung dan lantai; deep-link menangani hasil satu, beberapa, atau tanpa peta.
- Pencarian nama/scan code dan filter kategori, fasilitas, status, serta user status tersimpan pada query string.
- Marker dapat dipilih dari kanvas atau daftar keyboard-accessible; pilihan memusatkan marker dan membuka ringkasan peralatan.
- Vitest: 7 tes lulus; typecheck dan build production lulus.
- Playwright: desktop `1440x900`, tablet `1024x768`, dan mobile `390x844` tanpa horizontal overflow; happy path terakhir tanpa console error.
- Build tetap memberi warning chunk utama sekitar 512 kB minified atau 158 kB gzip karena Konva belum dipisahkan dari viewer.

## Keputusan yang belum ditutup

- Volume aset final perlu dipastikan pada deployment server.
- Batas awal upload ditetapkan 12 MiB, 8.192 px per sisi, dan 40 megapiksel; perlu dikonfirmasi terhadap memory limit server saat endpoint upload dibuat.
- Benchmark 500 penanda dicatat pada browser dan perangkat operasional, bukan hanya mesin pengembangan.

## Validasi wizard peta M3 — 28 Agustus 2026

- API admin menyediakan referensi gedung/sublokasi aktif, create draft, dan upload gambar dengan CSRF same-origin.
- Server mendeteksi MIME serta dimensi dari isi file, membatasi 12 MiB/8192 px/40 MP, menyimpan checksum SHA-256, dan menolak penggantian gambar jika penanda sudah ada.
- Wizard lima langkah memvalidasi gedung, metadata lantai, cakupan, serta file; upload yang gagal dapat dicoba ulang tanpa membuat draft kedua.
- PHPUnit fokus: 4 tes dan 15 assertion lulus; Vitest: 9 tes, typecheck, dan build production lulus.
- Playwright menyelesaikan wizard memakai `TAMPAK ATAS BASEMENT.png` (1920×1080), mensimulasikan satu kegagalan upload, lalu berhasil pada retry; dialog juga tetap muat pada viewport 390×844.
- Thumbnail, turunan viewer 4096 px, pengelolaan ikon, serta editor penanda tetap menjadi pekerjaan berikutnya.

## Validasi editor penanda M4 — 28 Agustus 2026

- API admin menyediakan daftar peta editable, detail editor, kandidat peralatan sesuai `peta_lokasi`, palet ikon aktif, dan batch create/update/delete penanda.
- Batch memeriksa revisi/checksum gambar, peralatan serta ikon aktif, cakupan lokasi, koordinat, ukuran, rotasi, unique equipment, dan `lock_version`; konflik mengembalikan `409` tanpa menimpa data lokal.
- Migration menambahkan satu ikon bawaan terpercaya sehingga editor langsung dapat dipakai sebelum fitur upload ikon khusus selesai.
- Editor mendukung tambah di tengah peta, drag, input posisi/ukuran/rotasi, tombol geser keyboard, override ikon, catatan, hapus, dirty-state, konfirmasi keluar, save, dan reload konflik.
- PHPUnit fokus: 5 tes dan 23 assertion lulus. Vitest, typecheck, dan build production lulus; warning hanya chunk utama sekitar 530 kB minified/163 kB gzip.
- Playwright menambah penanda pada denah 1920×1080, menggeser lewat tombol, memutar, menyimpan/reload, mensimulasikan konflik, memeriksa konfirmasi keluar, dan memastikan tidak ada overflow pada 390×844.
- Undo/redo, upload ikon khusus, duplikasi gaya penanda, serta matriks portrait/persegi tetap menjadi increment berikutnya.

## Validasi sampel denah — 28 Agustus 2026

- Ditemukan 32 sampel: 7 PNG `1920×1080` (sekitar 1,8–2,1 MB) dan 25 JPEG `7680×4320` (33,18 MP; terbesar sekitar 8,1 MB).
- Seluruh sampel saat ini landscape 16:9; viewer tetap mempertahankan dukungan rasio lain melalui koordinat ternormalisasi.
- File lantai penuh dipakai sebagai peta utama. File bernama `PARSIAL` dipertahankan sebagai referensi lokal, bukan peta terbit terpisah, agar satu peralatan tidak memiliki marker ganda pada lantai yang sama.
- Gambar 33 MP perlu turunan viewer maksimal awal 4.096 px pada sisi panjang dan thumbnail; dimensi asli serta checksum tetap menjadi sumber koordinat/revisi.
- Folder `DENAH/` diabaikan Git karena merupakan aset operasional lokal, bukan source code.
- Playwright memuat langsung sampel `7680×4320` dan `1920×1080`; perpindahan peta, fit-to-screen, marker, dan responsif berjalan tanpa error console atau overflow.
- Waktu hingga viewer 500 marker siap sekitar 2,04 detik pada mesin pengembangan; denah nyata 33,18 MP sekitar 1,99 detik. Angka ini menjadi baseline, bukan SLA perangkat operasional.

## Validasi audit peta M5 — 28 Agustus 2026

- Migration `audit_peta` menyimpan jenis dan ID entitas, aksi, nilai relevan sebelum/sesudah, pengguna, serta waktu; sesi, token, dan isi file tidak disimpan.
- Pembuatan draft, upload gambar, serta tambah/ubah/hapus penanda dicatat dalam transaksi yang sama dengan mutasi sehingga kegagalan audit membatalkan perubahan data.
- Penyimpanan penanda tanpa perubahan tidak menambah audit maupun menaikkan `lock_version`.
- Endpoint admin `GET /api/v1/peta/{id}/audit` mengembalikan maksimal 100 entri terbaru; role teknisi ditolak.

## Validasi path produksi `/maps` — 28 Agustus 2026

- Vite memakai base `/maps/`; hasil build mengarah ke `/maps/assets/...` dan favicon `/maps/favicon.svg`.
- Container Nginx hanya melayani `/maps`, memiliki fallback SPA terbatas pada path tersebut, serta health check `/healthz`; `/api/v1` tetap menuju CodeIgniter pada origin yang sama.
- Compose mempublikasikan frontend pada port `8082`. Route Cloudflare Tunnel `^/maps(/.*)?$` harus ditempatkan sebelum route catch-all aplikasi pada port `8081`.
- Vitest 10 tes, typecheck, build production, validasi Compose, dan smoke test Playwright pada `http://127.0.0.1:4173/maps/` lulus.
- Image Docker belum dijalankan lokal karena Docker Desktop tidak aktif; build image dan health check container wajib dijalankan di server sebelum route Cloudflare diaktifkan.

## Validasi penerbitan peta — 29 Agustus 2026

- Admin dapat menerbitkan peta berstatus `siap_diedit` setelah minimal satu penanda tersimpan; teknisi tidak dapat menjalankan aksi ini.
- Service menolak penerbitan kedua pada gedung dan lantai yang sama serta mencatat aksi `TERBITKAN` pada audit.
- Setelah terbit, peta masuk ke daftar read-only teknisi dan label `(Draft)` hilang dari pemilih admin.
- PHPUnit: 7 tes dan 44 assertion lulus; Vitest: 13 tes, typecheck, build, dan pemeriksaan Playwright alur publikasi lulus.
