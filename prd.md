# Product Requirements Document — Peta Interaktif Airport Technology

**Status:** Draf awal  
**Tanggal:** 17 Agustus 2026  
**Pemilik produk:** Airport Technology UPG  
**Aplikasi baru:** `interactive_app`  
**Sistem sumber:** Aplikasi Airport Technology berbasis CodeIgniter 4 dan PostgreSQL

## 1. Ringkasan

Peta Interaktif Airport Technology adalah aplikasi web berbasis Vite dan React yang menyederhanakan akses terhadap data peralatan pada aplikasi CodeIgniter serta menampilkan posisi peralatan secara visual di atas denah yang diunggah pengguna.

Pengguna berwenang dapat mengunggah gambar denah, mengatur ikon, meletakkan ikon pada denah dengan editor drag-and-drop, dan menghubungkan setiap penanda dengan satu data peralatan yang sudah tercatat di PostgreSQL. Pengguna lain dapat membuka peta, mencari peralatan, melihat status dan detail ringkasnya, lalu menuju detail atau proses kerja pada aplikasi utama.

Aplikasi React tidak menjadi sumber data baru untuk peralatan. CodeIgniter tetap menangani autentikasi, otorisasi, validasi, aturan bisnis, API, dan akses database.

## 2. Latar belakang

Aplikasi yang ada sudah menangani:

- autentikasi berbasis sesi dan peran `admin`, `supervisor`, serta `teknisi`;
- data peralatan, kategori, fasilitas, gedung, dan lokasi;
- foto peralatan;
- pemindahan lokasi dan histori peralatan;
- maintenance preventive dan corrective;
- status teknis dan status pengguna;
- pencarian serta pemindaian kode peralatan.

Namun, pencarian saat ini berpusat pada tabel dan formulir. Pengguna belum memiliki representasi spasial yang mudah dipahami untuk menjawab pertanyaan seperti “di bagian mana perangkat ini berada?”, “peralatan mana yang bermasalah di ruangan ini?”, atau “apa kondisi seluruh perangkat pada denah ini?”.

## 3. Visi produk

Menyediakan antarmuka visual yang cepat dan sederhana untuk menemukan, memahami, dan membuka data peralatan berdasarkan posisi fisiknya, tanpa menduplikasi aturan bisnis aplikasi utama.

## 4. Sasaran

### 4.1 Sasaran utama

1. Menampilkan peralatan pada denah berdasarkan lokasi visualnya.
2. Memungkinkan administrator mengelola denah dan penanda tanpa mengubah kode aplikasi.
3. Menghubungkan setiap penanda dengan data peralatan yang sudah ada.
4. Menyediakan pencarian, filter, dan ringkasan status langsung dari peta.
5. Mempertahankan satu sumber data dan aturan bisnis melalui CodeIgniter dan PostgreSQL.
6. Mendukung desktop, tablet, dan penggunaan dasar pada ponsel.

### 4.2 Indikator keberhasilan awal

- Pengguna dapat menemukan peralatan tertentu dari pencarian hingga penanda aktif dalam paling banyak tiga interaksi.
- Administrator dapat membuat satu denah dan menempatkan penanda tanpa bantuan pengembang.
- Seluruh penanda selalu mengarah ke ID peralatan yang valid.
- Perubahan status peralatan pada aplikasi utama terlihat pada peta tanpa input ulang.
- Waktu muat peta operasional pada jaringan lokal tidak melebihi tiga detik untuk target awal 500 penanda.
- Tidak ada kredensial database yang dikirim ke browser.

## 5. Bukan sasaran versi awal

- Menggantikan seluruh halaman CodeIgniter sekaligus.
- Menyimpan salinan mandiri data peralatan di aplikasi React.
- Pemetaan geografis berbasis GPS, koordinat bumi, atau PostGIS.
- Editor CAD, BIM, atau gambar vektor lengkap.
- Kolaborasi editor waktu nyata oleh banyak pengguna.
- Aplikasi mobile native dan penggunaan penuh secara offline.
- Menjalankan proses maintenance lengkap langsung dari peta pada MVP.

## 6. Pengguna dan hak akses

| Peran | Kebutuhan | Hak pada MVP |
|---|---|---|
| Admin | Mengatur seluruh peta dan penggunaannya | Lihat, buat, ubah, arsipkan peta; kelola ikon; letakkan dan hapus penanda |
| Supervisor | Memantau dan mengoreksi pemetaan | Lihat seluruh peta; cari/filter; letakkan atau memperbarui penanda jika diizinkan kebijakan |
| Teknisi | Menemukan peralatan dan membuka pekerjaan | Lihat peta; cari/filter; buka detail peralatan dan maintenance |

Otorisasi wajib diperiksa pada API CodeIgniter. Menyembunyikan tombol di React bukan pengamanan yang cukup.

## 7. Arsitektur produk

### 7.1 Bentuk arsitektur

Arsitektur mengikuti topologi hibrida:

```text
Browser
  ├─ Halaman CodeIgniter (HTML/SSR)
  └─ Aplikasi Vite + React (/peta)
                 │
                 ▼
        REST API CodeIgniter (/api/v1)
                 │
        Service dan Model bersama
                 │
                 ▼
              PostgreSQL
```

### 7.2 Keputusan arsitektur

- CodeIgniter tetap menjadi application server dan pemilik API.
- React hanya mengakses data melalui `/api/v1`; React tidak terhubung langsung ke PostgreSQL.
- Produksi menggunakan origin yang sama, misalnya `https://airport-tech.farlabs.my.id/peta`, agar sesi, CSRF, CORS, dan operasional tetap sederhana.
- Pada pengembangan lokal, Vite menggunakan proxy ke CodeIgniter.
- Build React dapat disajikan sebagai aset statis oleh web server yang sama atau container frontend terpisah di belakang reverse proxy yang sama.
- Autentikasi MVP memakai sesi CodeIgniter yang sudah ada. JWT baru dipertimbangkan jika aplikasi harus berada pada origin atau klien yang berbeda.
- Data peta baru dibuat melalui migration CodeIgniter agar skema database tetap memiliki satu jalur perubahan resmi.

### 7.3 Teknologi yang direncanakan

- Vite + React + TypeScript untuk frontend.
- React Konva/Konva untuk kanvas 2D, drag-and-drop, zoom, resize, dan event penanda.
- REST JSON pada CodeIgniter 4.
- PostgreSQL yang sama dengan aplikasi utama.
- Penyimpanan berkas yang dikelola server untuk gambar denah dan ikon; database hanya menyimpan metadata dan lokasi berkas.
- Pengujian unit frontend, pengujian API CodeIgniter, dan pengujian alur utama end-to-end.

Konva dipilih untuk MVP karena mendukung objek kanvas, layer, drag-and-drop, transformasi, dan binding resmi React. Referensi: [Konva](https://konvajs.org/docs/) dan [React Konva](https://konvajs.org/docs/react/index.html).

## 8. Ruang lingkup fungsional MVP

### 8.1 Daftar dan navigasi peta

- Menampilkan daftar peta aktif.
- Menampilkan nama, gedung/lokasi, gambar mini, status, dan waktu pembaruan.
- Membuka peta dalam mode lihat.
- Mendukung peta bertingkat melalui relasi gedung/lokasi dan label lantai atau area.
- Menyediakan perpindahan antarpeta tanpa kembali ke halaman utama.

### 8.2 Pengelolaan gambar dasar peta

- Admin dapat mengunggah PNG, JPEG, atau WebP.
- Admin mengisi nama peta dan memilih gedung/lokasi terkait.
- Sistem membaca dan menyimpan ukuran asli gambar.
- Sistem membuat gambar mini untuk daftar peta.
- Gambar pengganti membuat revisi baru atau memerlukan konfirmasi karena posisi penanda dapat berubah.
- Peta dapat diarsipkan tanpa menghapus histori dan berkas secara langsung.

### 8.3 Editor peta

- Pan dan zoom kanvas.
- Palet ikon di sisi editor.
- Drag ikon dari palet ke denah atau klik untuk menambahkan.
- Pilih, pindahkan, ubah ukuran, putar, duplikasi, atau hapus penanda.
- Snap-to-grid bersifat opsional dan dapat diaktifkan pengguna.
- Undo/redo minimal untuk perubahan yang belum disimpan.
- Indikator perubahan belum disimpan.
- Konfirmasi saat meninggalkan editor dengan perubahan belum disimpan.
- Simpan perubahan secara atomik melalui API.

### 8.4 Ikon khusus

- Admin dapat mengunggah ikon PNG atau WebP dengan latar transparan.
- Admin dapat memberi nama, kategori, ukuran default, dan status aktif.
- Sistem menyediakan ikon bawaan sebagai fallback.
- SVG tidak diterima pada MVP untuk mengurangi risiko konten aktif; dukungan SVG hanya boleh ditambahkan dengan sanitasi yang tervalidasi.
- Ikon yang sudah digunakan tidak boleh dihapus permanen; ikon dapat dinonaktifkan.

### 8.5 Penanda dan tautan peralatan

- Setiap penanda wajib terhubung ke satu `peralatan.id` yang aktif.
- Pemilih peralatan mendukung pencarian berdasarkan nama, kode/scan code, kategori, gedung, lokasi, merek, model, dan status.
- Sistem memperingatkan jika peralatan sudah ditempatkan pada peta yang sama.
- Satu peralatan dapat ditempatkan pada lebih dari satu peta hanya bila kebijakan bisnis mengizinkan, misalnya peta ringkasan dan peta detail.
- Penanda menyimpan posisi `x` dan `y` sebagai nilai ternormalisasi `0..1`, bukan piksel absolut.
- Penanda menyimpan ukuran relatif, rotasi, urutan layer, ikon, dan catatan opsional.
- Detail peralatan dan status selalu dibaca dari API saat peta dibuka atau disegarkan.

### 8.6 Mode lihat

- Klik/tap penanda membuka panel detail ringkas.
- Panel menampilkan minimal nama, kode, kategori, gedung/lokasi, merek/model, status, foto utama jika tersedia, dan pembaruan terakhir.
- Tautan membuka halaman detail peralatan pada aplikasi CodeIgniter.
- Jika diizinkan, tautan membuka pembuatan atau daftar maintenance yang sudah ada.
- Warna/status visual penanda dapat mengikuti kondisi peralatan tanpa mengganti ikon sumber.
- Legenda menjelaskan arti warna dan status.
- Penanda yang tidak lagi valid ditampilkan sebagai masalah data hanya bagi admin/supervisor, bukan menyebabkan peta gagal dimuat.

### 8.7 Pencarian dan filter

- Pencarian nama atau kode peralatan menyorot dan memusatkan penanda.
- Filter berdasarkan gedung, lokasi, kategori, fasilitas, status teknis, dan status pengguna.
- Tombol reset filter.
- Jumlah hasil dan keadaan “tidak ditemukan” yang jelas.
- URL menyimpan peta dan filter penting agar tampilan dapat dibagikan kepada pengguna yang berhak.

### 8.8 Audit

- Catat pengguna dan waktu untuk pembuatan, perubahan, pengarsipan peta, perubahan ikon, serta penambahan/pemindahan/penghapusan penanda.
- Audit menyimpan perubahan sebelum dan sesudah untuk posisi dan relasi penting.
- Log tidak menyimpan cookie, token, atau isi berkas biner.

## 9. Model data yang diusulkan

Nama akhir mengikuti konvensi database aplikasi setelah design review.

### 9.1 `peta`

| Kolom | Tujuan |
|---|---|
| `id` | Primary key |
| `nama` | Nama peta |
| `lokasi_id` | Relasi opsional ke tabel `lokasi`; gedung dapat diturunkan dari hierarchy lokasi |
| `label_area` | Lantai, zona, atau keterangan tambahan |
| `file_path` | Lokasi gambar dasar |
| `thumbnail_path` | Lokasi gambar mini |
| `mime_type` | Tipe berkas tervalidasi |
| `width_px`, `height_px` | Dimensi asli untuk perhitungan rasio |
| `versi` | Nomor revisi peta |
| `is_active` | Status aktif/arsip |
| `created_by`, `updated_by` | Pengguna pelaku |
| `created_at`, `updated_at` | Waktu audit |

### 9.2 `ikon_peta`

| Kolom | Tujuan |
|---|---|
| `id` | Primary key |
| `nama` | Nama ikon |
| `file_path` | Lokasi aset ikon |
| `mime_type` | PNG atau WebP tervalidasi |
| `default_width`, `default_height` | Ukuran relatif/default editor |
| `kategori_peralatan_id` | Ikon default opsional untuk kategori |
| `is_active` | Status ikon |
| audit columns | Pelaku dan waktu perubahan |

### 9.3 `penanda_peta_peralatan`

| Kolom | Tujuan |
|---|---|
| `id` | Primary key |
| `peta_id` | Relasi ke peta |
| `peralatan_id` | Relasi ke peralatan yang menjadi sumber detail |
| `ikon_peta_id` | Ikon yang digunakan |
| `x_ratio`, `y_ratio` | Posisi ternormalisasi `0..1` |
| `width_ratio`, `height_ratio` | Ukuran relatif terhadap kanvas |
| `rotation_deg` | Rotasi ikon |
| `z_index` | Urutan tampilan |
| `catatan` | Keterangan opsional |
| `lock_version` | Pencegah perubahan bersamaan menimpa data |
| audit columns | Pelaku dan waktu perubahan |

Constraint awal:

- foreign key menggunakan perilaku `RESTRICT` atau soft-delete/arsip sesuai aturan aplikasi;
- `x_ratio` dan `y_ratio` dibatasi antara 0 dan 1;
- kombinasi `peta_id + peralatan_id` unik pada MVP;
- index pada `peta_id`, `peralatan_id`, dan kolom filter penting;
- tidak menyimpan salinan nama atau status peralatan di tabel penanda.

### 9.4 `audit_peta`

Menyimpan aksi, jenis entitas, ID entitas, pelaku, waktu, dan perubahan JSON terpilih. Tabel ini dapat ditunda sampai milestone audit, tetapi audit minimum harus tersedia sebelum produksi.

## 10. Kontrak API awal

Seluruh endpoint menggunakan prefix `/api/v1`, JSON konsisten, pemeriksaan sesi, role filter, CSRF untuk operasi tulis, validasi server, dan status HTTP yang tepat.

### 10.1 Sesi

- `GET /api/v1/me` — identitas, peran, dan kemampuan pengguna saat ini.
- Login/logout tetap memakai mekanisme CodeIgniter yang ada pada MVP.

### 10.2 Referensi dan peralatan

- `GET /api/v1/peralatan` — daftar ringkas, pencarian, filter, dan pagination.
- `GET /api/v1/peralatan/{id}` — detail ringkas untuk panel peta.
- `GET /api/v1/referensi/lokasi` — hierarchy gedung/lokasi.
- `GET /api/v1/referensi/kategori-peralatan` — pilihan kategori.

### 10.3 Peta

- `GET /api/v1/peta`
- `POST /api/v1/peta`
- `GET /api/v1/peta/{id}` — metadata dan kumpulan penanda.
- `PATCH /api/v1/peta/{id}`
- `POST /api/v1/peta/{id}/gambar`
- `POST /api/v1/peta/{id}/arsip`

### 10.4 Ikon

- `GET /api/v1/ikon-peta`
- `POST /api/v1/ikon-peta`
- `PATCH /api/v1/ikon-peta/{id}`
- `POST /api/v1/ikon-peta/{id}/nonaktifkan`

### 10.5 Penanda

- `POST /api/v1/peta/{id}/penanda`
- `PATCH /api/v1/peta/{id}/penanda/{penandaId}`
- `DELETE /api/v1/peta/{id}/penanda/{penandaId}`
- `PUT /api/v1/peta/{id}/penanda-batch` — simpan kumpulan perubahan editor secara atomik.

Respons error minimum:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Data belum valid.",
    "fields": {}
  }
}
```

## 11. Aturan integrasi dengan aplikasi utama

1. `peralatan`, `lokasi`, kategori, pengguna, maintenance, dan foto tetap dimiliki modul CodeIgniter yang ada.
2. API memanggil service/model bersama; controller API tidak menyalin aturan bisnis controller web.
3. Pemindahan lokasi peralatan tidak otomatis memindahkan koordinat penanda tanpa kebijakan eksplisit. Sistem menandai ketidaksesuaian untuk diperiksa.
4. Peralatan yang dinonaktifkan tetap mempertahankan histori penanda tetapi tidak muncul sebagai peralatan aktif baru.
5. Penghapusan lokasi/peta/ikon yang masih direferensikan ditolak atau diarsipkan.
6. Tautan dari React ke detail CodeIgniter hanya menggunakan URL internal yang telah ditentukan, bukan URL bebas dari data pengguna.

## 12. Keamanan dan pengelolaan berkas

- Validasi MIME berdasarkan isi berkas, bukan hanya ekstensi.
- Batasi ukuran, dimensi, jumlah piksel, dan nama berkas.
- Beri nama fisik acak; jangan menggunakan nama unggahan sebagai path.
- Tolak SVG pada MVP dan hilangkan metadata gambar yang tidak diperlukan.
- Simpan berkas di lokasi yang tidak mengizinkan eksekusi script.
- Terapkan CSRF, session cookie `Secure`, `HttpOnly`, dan kebijakan `SameSite` yang sesuai.
- Terapkan role dan ownership pada setiap endpoint tulis.
- Jangan meletakkan password, token, dump SQL, atau konfigurasi produksi di repo frontend.
- Rate-limit upload dan endpoint pencarian jika kelak diekspos ke internet.
- Catat audit, tetapi jangan mencatat data autentikasi sensitif.

## 13. Pengalaman pengguna

### 13.1 Tata letak mode lihat

- Header: pemilih peta, pencarian, filter, dan profil.
- Sidebar kiri: daftar hasil/peralatan dan filter.
- Area utama: kanvas peta.
- Panel kanan atau bottom sheet: detail penanda terpilih.
- Legenda status selalu dapat dibuka.

### 13.2 Tata letak editor

- Toolbar atas: simpan, batal, undo, redo, zoom, grid, dan mode preview.
- Palet kiri: ikon dan pencarian peralatan.
- Kanvas tengah: gambar dasar dan penanda.
- Inspector kanan: peralatan tertaut, ikon, posisi, ukuran, rotasi, dan catatan.

### 13.3 Aksesibilitas

- Semua operasi penting memiliki alternatif keyboard/form selain drag-and-drop.
- Fokus keyboard terlihat dan urutan fokus logis.
- Ikon tidak menjadi satu-satunya pembeda status; gunakan label atau pola/warna tambahan.
- Kontras teks dan kontrol memenuhi WCAG 2.1 AA.
- Pengguna dapat memilih penanda dari daftar walaupun sulit mengoperasikan kanvas.

## 14. Kebutuhan nonfungsional

### 14.1 Performa

- Lazy-load gambar dan detail peralatan.
- Pisahkan layer gambar dasar dan layer penanda agar perubahan ikon tidak merender ulang seluruh peta.
- Gunakan thumbnail pada daftar.
- Pagination atau pencarian server-side untuk data peralatan.
- Target awal: 500 penanda per peta tanpa penurunan interaksi yang nyata pada perangkat operasional.

### 14.2 Keandalan

- Simpan batch editor dalam transaksi database.
- Gunakan `lock_version` atau pemeriksaan `updated_at` untuk konflik edit.
- Gagal mengunggah atau menyimpan tidak boleh meninggalkan record/file yatim.
- Backup database dan direktori aset peta harus menjadi satu prosedur terjadwal.

### 14.3 Observabilitas

- Endpoint `/health` tetap tersedia.
- Log API mencatat request ID, status, durasi, pengguna, dan endpoint tanpa payload sensitif.
- Metrik minimum: error API, durasi API, kegagalan upload, dan jumlah peta/penanda.

### 14.4 Kompatibilitas

- Dua versi stabil terbaru Chrome/Edge desktop.
- Tablet Android yang digunakan operasional.
- Mode lihat responsif pada ponsel; editor penuh diprioritaskan untuk desktop/tablet landscape.

## 15. Tahapan pengembangan

### Fase 0 — Validasi teknis

- Inventaris hierarchy lokasi dan data peralatan nyata.
- Pastikan strategi same-origin dan sesi CodeIgniter.
- Buat proof-of-concept satu gambar, satu ikon draggable, zoom/pan, dan penyimpanan koordinat ternormalisasi.
- Uji peta dengan dimensi besar dan 500 penanda sintetis.

**Kriteria keluar:** posisi tetap tepat setelah resize/zoom dan sesi CodeIgniter dapat digunakan oleh API.

### Fase 1 — Fondasi API dan data

- Migration tabel peta, ikon, dan penanda.
- Endpoint `/me`, referensi, pencarian peralatan, dan peta read-only.
- Pengujian otorisasi serta kontrak JSON.

**Kriteria keluar:** pengguna login dapat membuka peta read-only dari data PostgreSQL tanpa akses database langsung dari React.

### Fase 2 — Viewer MVP

- Daftar peta, viewer, zoom/pan, pencarian, filter, detail penanda, dan tautan ke aplikasi utama.
- State loading, kosong, error, dan akses ditolak.

**Kriteria keluar:** alur menemukan peralatan dan membuka detail lulus uji penerimaan pengguna.

### Fase 3 — Editor MVP

- Upload denah dan ikon.
- Penempatan, pemindahan, transformasi, penghapusan, serta batch save penanda.
- Validasi konflik dan perubahan belum disimpan.

**Kriteria keluar:** admin dapat membangun satu peta operasional lengkap tanpa intervensi database.

### Fase 4 — Produksi dan penguatan

- Audit, thumbnail, backup aset, monitoring, rate limiting, dan optimasi performa.
- Dokumentasi admin dan prosedur pemulihan.
- Deploy melalui Docker/reverse proxy yang sama dengan aplikasi utama.

**Kriteria keluar:** backup-restore teruji, audit tersedia, pemeriksaan keamanan lulus, dan rollback terdokumentasi.

### Fase lanjutan

- Status real-time atau pembaruan berkala.
- Deep link QR menuju penanda tertentu.
- Layer zona/area, jalur, atau anotasi.
- Ekspor gambar/PDF.
- Peta geografis eksternal dan PostGIS hanya jika kebutuhan koordinat bumi sudah nyata.

## 16. Kriteria penerimaan MVP

1. Pengguna yang belum login tidak dapat membaca API peta.
2. Teknisi tidak dapat membuat atau mengubah peta/ikon/penanda bila tidak diberi hak.
3. Admin dapat mengunggah denah valid dan sistem menolak tipe atau ukuran berbahaya.
4. Admin dapat mengunggah ikon transparan dan menggunakannya pada penanda.
5. Admin dapat mencari peralatan, menempatkannya, menyimpan, memuat ulang halaman, dan mendapatkan posisi yang sama.
6. Posisi tetap tepat saat viewport berubah ukuran.
7. Klik penanda menampilkan data terbaru dari peralatan terkait.
8. Pencarian menyorot dan memusatkan penanda yang benar.
9. Filter status dan lokasi menghasilkan kumpulan penanda yang benar.
10. Peralatan yang tidak valid tidak membuat seluruh peta gagal.
11. Konflik edit tidak menimpa perubahan pengguna lain secara diam-diam.
12. Operasi batch gagal secara keseluruhan jika salah satu perubahan tidak valid.
13. Audit mencatat aksi editor penting sebelum produksi.
14. Backup dan restore database serta aset peta berhasil diuji.

## 17. Strategi pengujian

- Unit test untuk konversi koordinat, filter, reducer/state editor, dan validasi frontend.
- API test untuk autentikasi, role, validasi, transaksi, conflict handling, dan respons error.
- Integration test untuk upload berkas serta pembersihan file jika transaksi gagal.
- End-to-end test untuk login, membuka peta, mencari penanda, mengedit, menyimpan, dan memuat ulang.
- Uji visual/responsif pada desktop, tablet, dan ponsel.
- Uji performa dengan gambar besar dan jumlah penanda target.
- Uji backup/restore sebelum produksi.

## 18. Deployment awal

- Repository `interactive_app` berdiri terpisah untuk source frontend.
- Perubahan API dan migration tetap berada di repository CodeIgniter.
- CI frontend menjalankan lint, type-check, unit test, dan build.
- CI backend menjalankan PHPUnit dan migration check.
- Artifact React dibangun secara reproducible; server tidak melakukan development build manual.
- Reverse proxy melayani `/peta` dan meneruskan `/api/v1` ke CodeIgniter pada origin yang sama.
- Rilis frontend dan backend yang mengubah kontrak API harus kompatibel selama proses deployment.
- Rollback frontend tidak boleh membutuhkan rollback database yang destruktif.

## 19. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Denah diganti dan rasio berbeda | Posisi penanda bergeser | Revisi peta, preview migrasi posisi, dan konfirmasi admin |
| Duplikasi aturan bisnis di React/API | Data tidak konsisten | Panggil service/model bersama di CodeIgniter |
| Upload berbahaya | Kompromi server/browser | MIME sniffing, batas ukuran/piksel, nama acak, tanpa SVG pada MVP |
| Banyak penanda menurunkan performa | Editor lambat | Layer terpisah, caching gambar, benchmark Fase 0 |
| Edit bersamaan | Perubahan tertimpa | Optimistic locking dan respons konflik `409` |
| Relasi peralatan/lokasi berubah | Peta tidak akurat | Deteksi mismatch dan daftar masalah untuk admin |
| Frontend berbeda origin | Masalah sesi/CORS/CSRF | Gunakan same-origin pada MVP |
| Database dan aset dibackup terpisah | Restore tidak konsisten | Satu prosedur backup terkoordinasi dan uji restore |

## 20. Keputusan yang perlu dikonfirmasi

1. Apakah supervisor boleh mengedit peta atau hanya admin?
2. Apakah satu peralatan boleh muncul pada lebih dari satu peta?
3. Apakah peta merepresentasikan gedung, lantai, ruangan, area luar, atau seluruhnya?
4. Berapa ukuran dan resolusi terbesar gambar denah yang nyata?
5. Berapa jumlah maksimum peta dan penanda per peta dalam tiga tahun?
6. Apakah status warna mengikuti `status`, `user_status`, kondisi maintenance terbaru, atau kombinasi prioritas?
7. Apakah detail peralatan cukup sebagai panel ringkas dan tautan, atau proses maintenance perlu dilakukan langsung di React?
8. Apakah akses aplikasi hanya melalui LAN/Tailscale atau juga internet melalui Cloudflare Tunnel?
9. Apakah file peta/ikon disimpan pada volume server saat ini atau object storage?
10. Berapa lama histori revisi peta dan audit harus disimpan?

## 21. Definition of Done produk

MVP dianggap selesai ketika seluruh kriteria penerimaan lulus, dokumentasi penggunaan dan pemulihan tersedia, backup-restore teruji, hak akses ditinjau, tidak ada rahasia atau dump data di repository, dan pengguna operasional menyetujui alur viewer serta editor pada perangkat nyata.
