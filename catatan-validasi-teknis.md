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

## Rumus koordinat

```text
x_ratio = clamp(x_pixel / lebar_asli, 0, 1)
y_ratio = clamp(y_pixel / tinggi_asli, 0, 1)
x_pixel = x_ratio * lebar_asli
y_pixel = y_ratio * tinggi_asli
```

## Keputusan yang belum ditutup

- Payload nyata `GET /api/v1/me` menunggu endpoint spike pada CodeIgniter.
- Volume aset final perlu dipastikan pada deployment server.
- Batas ukuran/dimensi upload ditetapkan setelah menerima contoh denah operasional.
- Benchmark 500 penanda dicatat pada browser dan perangkat operasional, bukan hanya mesin pengembangan.
