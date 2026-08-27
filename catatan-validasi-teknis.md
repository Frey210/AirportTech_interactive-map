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
- Batas ukuran/dimensi upload ditetapkan setelah menerima contoh denah operasional.
- Benchmark 500 penanda dicatat pada browser dan perangkat operasional, bukan hanya mesin pengembangan.
