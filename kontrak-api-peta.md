# Kontrak API Peta Interaktif

Status: implementasi awal read-only, 27 Agustus 2026.

## Ketentuan umum

- Base path: `/api/v1` pada origin yang sama dengan CodeIgniter.
- Autentikasi: cookie sesi CodeIgniter; request frontend memakai `credentials: same-origin`.
- Sukses: `{ "data": ... }`.
- Gagal: `{ "error": { "code": "...", "message": "..." } }`.
- Waktu menggunakan ISO 8601 dengan offset zona waktu aplikasi.
- Endpoint daftar peta belum dipaginasi karena hanya memuat peta berstatus `terbit`, diurutkan gedung lalu lantai. Pagination ditambahkan setelah volume nyata membutuhkannya.
- Kode error yang disepakati: `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, dan `UPLOAD_INVALID`.

## Endpoint read-only

### `GET /api/v1/me`

Mengembalikan pengguna sesi dan capability `lihat_peta`, `edit_peta`, serta `periksa_masalah_pemetaan`.

### `GET /api/v1/peta`

Mengembalikan daftar peta terbit. Setiap item berisi identitas peta, gedung, lantai, revisi, dimensi asli, URL gambar/thumbnail, dan waktu perubahan.

### `GET /api/v1/peta/{id}`

Mengembalikan:

```json
{
  "data": {
    "peta": {
      "id": 3,
      "nama_peta": "Terminal Utama Lantai 1",
      "kode_lantai": "L1",
      "nama_lantai": "Lantai 1",
      "width_px": 2400,
      "height_px": 1600,
      "gedung": { "id": 1, "kode": "TU", "nama": "Terminal Utama" }
    },
    "lokasi": [{ "id": 9, "kode": null, "nama_lokasi": "Ruang Server" }],
    "penanda": [{
      "id": 18,
      "x_ratio": 0.25,
      "y_ratio": 0.75,
      "size_ratio": 0.04,
      "rotation_deg": 0,
      "ikon": { "id": 2, "nama": "UPS", "file_url": "/assets/uploads/ikon/ups.webp" },
      "peralatan": { "id": 12, "nama_peralatan": "UPS Terminal", "is_aktif": true }
    }]
  }
}
```

Koordinat adalah pusat ikon terhadap dimensi file asli; `size_ratio` dihitung terhadap sisi terpendek gambar.

### `GET /api/v1/peralatan/{id}/peta`

Resolver deep-link dari CodeIgniter/QR:

- penanda ditemukan: `hubungan = "penanda"` dan posisi penanda disertakan;
- belum memiliki penanda tetapi lokasinya tercakup peta: `hubungan = "cakupan_lokasi"`;
- satu pilihan: `default_peta_id` berisi ID peta;
- beberapa atau tidak ada pilihan: `default_peta_id = null`.

## Respons error

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Peralatan tidak ditemukan."
  }
}
```

`401` selalu JSON untuk `/api/*`, sedangkan halaman HTML biasa tetap mengarahkan pengguna ke `/login`.

## Tabel sumber

- `peta`: satu gedung dan satu lantai per revisi gambar;
- `peta_lokasi`: cakupan `SUBLOKASI` pada peta;
- `ikon_peta`: aset ikon, opsional terhubung ke kategori peralatan;
- `penanda_peta_peralatan`: satu peralatan maksimal satu kali pada satu peta.

Data identitas/status peralatan tetap dibaca dari tabel CodeIgniter dan tidak diduplikasi ke tabel peta.
