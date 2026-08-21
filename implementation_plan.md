# Rencana Implementasi Bertahap — Peta Interaktif Airport Technology

**Status:** Draf siap eksekusi  
**Tanggal:** 19 Agustus 2026  
**Acuan:** [`prd.md`](./prd.md)  
**Frontend:** `D:\Airport Technology UPG\Project\interactive_app`  
**Backend/API:** `D:\Airport Technology UPG\Project\airport-technology`

## 1. Tujuan dokumen

Dokumen ini memecah PRD menjadi tahapan implementasi yang dapat dikerjakan, diuji, dan dirilis secara terpisah. Setiap tahap harus menghasilkan increment yang berjalan dan memiliki kriteria keluar yang terukur.

Prinsip pelaksanaan:

1. CodeIgniter dan PostgreSQL tetap menjadi sumber data dan aturan bisnis.
2. React tidak mengakses database secara langsung.
3. Viewer dikerjakan sebelum editor.
4. Fitur minimum yang berfungsi didahulukan; fitur spekulatif ditunda.
5. Backend tetap kompatibel dengan aplikasi lama selama pengembangan.
6. Perubahan database hanya melalui migration CodeIgniter.
7. Setiap tahap menyertakan pengujian otomatis dan pemeriksaan tampilan.
8. Nama branch dan pesan commit menggunakan bahasa Indonesia yang literal serta mudah dipahami.

## 2. Keputusan awal untuk memulai

Keputusan berikut digunakan sebagai default sampai ada keputusan produk yang berbeda:

| Topik | Keputusan awal |
|---|---|
| Hak edit | Hanya `admin` yang dapat membuat dan mengubah peta, ikon, serta penanda |
| Supervisor | Mode lihat dan pemeriksaan data; hak edit dapat ditambahkan setelah MVP |
| Duplikasi peralatan | Satu peralatan hanya boleh muncul sekali pada peta yang sama |
| Bentuk peta | Denah raster untuk gedung, lantai, ruangan, atau area |
| Sistem koordinat | Rasio `0..1`; tidak menggunakan PostGIS pada MVP |
| Autentikasi | Sesi CodeIgniter pada origin yang sama |
| URL produksi | Frontend di `/peta`, API di `/api/v1` |
| Penyimpanan aset | Volume persisten server; metadata disimpan di PostgreSQL |
| Ikon MVP | PNG dan WebP; SVG ditolak |
| Status penanda | Menggunakan status peralatan dari API; aturan warna difinalkan saat viewer |
| Proses maintenance | Panel ringkas dan tautan menuju aplikasi CodeIgniter |
| Target kapasitas | Maksimal awal 500 penanda per peta |

## 3. Struktur pekerjaan lintas repository

### 3.1 Repository CodeIgniter

Berisi:

- migration tabel peta;
- model dan service peta;
- REST API `/api/v1`;
- autentikasi, role, validasi, upload, dan audit;
- pengujian PHPUnit;
- konfigurasi penyajian frontend/reverse proxy yang terkait backend.

Contoh nama branch:

- `fitur/api-peta-interaktif`
- `fitur/upload-peta-dan-ikon`
- `pemeliharaan/deployment-peta-interaktif`

### 3.2 Repository `interactive_app`

Berisi:

- source Vite + React + TypeScript;
- viewer dan editor Konva;
- klien API dan tipe kontrak;
- unit test frontend;
- skrip Playwright yang memang layak disimpan;
- Dockerfile/build configuration frontend.

Contoh nama branch:

- `fondasi/aplikasi-peta`
- `fitur/viewer-peta`
- `fitur/editor-peta`
- `pengujian/alur-peta-interaktif`

Contoh pesan commit:

- `Siapkan fondasi aplikasi React untuk peta interaktif`
- `Tambahkan API daftar peta dan detail penanda`
- `Tambahkan pencarian peralatan pada viewer peta`
- `Validasi unggahan gambar denah dan ikon`
- `Uji penyimpanan posisi penanda secara atomik`

Jangan menggunakan nama generik seperti `update`, `fix`, atau `misc`; gunakan nama yang menjelaskan tujuan pekerjaan.

## 4. Urutan dependensi

```text
Validasi teknis
  → kontrak API dan model data
  → migration + API read-only
  → fondasi React
  → viewer peta
  → upload aset
  → editor penanda
  → audit + penguatan
  → deployment produksi
```

Frontend boleh dikembangkan memakai fixture setelah kontrak API disepakati, tetapi integrasi akhir tidak boleh memakai mock.

## 5. Tahap 0 — Persiapan dan validasi teknis

**Tujuan:** menghapus risiko arsitektur terbesar sebelum membuat fitur produksi.

### 5.1 Pekerjaan

#### Backend

- [ ] Catat versi PHP, CodeIgniter, PostgreSQL, Nginx, Docker, dan skema deployment aktif.
- [ ] Inventaris endpoint, session cookie, CSRF, `AuthFilter`, dan `RoleFilter` yang dapat digunakan ulang.
- [ ] Inventaris field serta relasi `peralatan`, `lokasi`, `kategori_peralatan`, `kategori_fasilitas`, dan foto peralatan.
- [ ] Pastikan struktur hierarchy gedung/lokasi yang akan dipakai pemilih peta.
- [ ] Tetapkan direktori volume untuk aset peta dan ikon.
- [ ] Pastikan direktori aset tidak dapat mengeksekusi PHP/script.

#### Frontend

- [x] Buat proof-of-concept React + TypeScript + Konva tanpa fitur produksi.
- [x] Tampilkan satu gambar dasar dan satu ikon.
- [x] Implementasikan pan, zoom, drag, resize, dan rotasi.
- [x] Simpan posisi sebagai `x_ratio` dan `y_ratio`.
- [x] Buktikan posisi tetap sama pada viewport desktop dan tablet.
- [x] Render 500 penanda sintetis dan ukur waktu render/interaksi.

#### Integrasi

- [x] Buat endpoint sementara/read-only `GET /api/v1/me` atau spike setara.
- [ ] Buktikan request React memakai sesi CodeIgniter pada origin yang sama.
- [x] Buktikan request tanpa sesi memperoleh `401`, bukan redirect HTML.
- [ ] Verifikasi operasi tulis API dapat menggunakan perlindungan CSRF.

### 5.2 Artefak

- Catatan hasil validasi teknis.
- Contoh payload API `/me`.
- Rumus konversi piksel ↔ koordinat rasio beserta unit test.
- Hasil benchmark 500 penanda.
- Keputusan final tentang volume aset.

### 5.3 Pengujian

- [x] Unit test fungsi normalisasi koordinat.
- [x] PHPUnit untuk respons sesi valid/tidak valid.
- [x] Playwright screenshot desktop `1440×900`, tablet `1024×768`, dan mobile `390×844`.
- [x] Playwright memeriksa console error dan posisi penanda setelah resize.

### 5.4 Kriteria keluar

- [ ] Same-origin session terbukti bekerja.
- [x] Posisi penanda stabil setelah resize dan zoom.
- [x] 500 penanda memenuhi target performa awal.
- [ ] Tidak ada keputusan arsitektur kritis yang belum jelas.

## 6. Tahap 1 — Kontrak API dan desain database

**Tujuan:** mengunci batas antara CodeIgniter dan React sebelum implementasi paralel.

### 6.1 Pekerjaan

- [ ] Finalisasi nama tabel dan kolom sesuai konvensi aplikasi.
- [ ] Buat dokumen kontrak endpoint dan contoh JSON sukses/error.
- [ ] Tentukan pagination, filter, sorting, dan batas maksimum hasil.
- [ ] Tentukan representasi capability dari `/api/v1/me`.
- [ ] Tetapkan kode error: `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, dan `UPLOAD_INVALID`.
- [ ] Tetapkan format tanggal ISO 8601 dan zona waktu.
- [ ] Tetapkan aturan status warna viewer.
- [ ] Tetapkan batas upload, misalnya ukuran berkas dan jumlah piksel, berdasarkan data nyata Tahap 0.

### 6.2 Kontrak minimum

- `GET /api/v1/me`
- `GET /api/v1/peralatan`
- `GET /api/v1/peralatan/{id}`
- `GET /api/v1/referensi/lokasi`
- `GET /api/v1/referensi/kategori-peralatan`
- `GET /api/v1/peta`
- `GET /api/v1/peta/{id}`

Endpoint tulis didefinisikan sekarang tetapi diterapkan setelah jalur read-only stabil.

### 6.3 Kriteria keluar

- [ ] Contoh payload mencakup state normal, kosong, tidak valid, dan tidak berwenang.
- [ ] Field frontend dapat ditelusuri ke model/service backend yang menjadi sumbernya.
- [ ] Tidak ada data peralatan yang diduplikasi ke tabel peta.
- [ ] Kontrak disetujui sebelum frontend dan backend berjalan paralel.

## 7. Tahap 2 — Fondasi backend dan API read-only

**Tujuan:** menyediakan data peta yang aman dan stabil untuk viewer.

### 7.1 Migration database

- [ ] Buat tabel `peta`.
- [ ] Buat tabel `ikon_peta`.
- [ ] Buat tabel `penanda_peta_peralatan`.
- [ ] Tambahkan foreign key ke `lokasi`, `kategori_peralatan`, `peralatan`, dan `pengguna` sesuai kebutuhan.
- [ ] Tambahkan check constraint koordinat `0..1` jika didukung pola migration proyek.
- [ ] Tambahkan unique constraint `peta_id + peralatan_id`.
- [ ] Tambahkan index pada foreign key dan field filter.
- [ ] Pastikan `down()` aman untuk lingkungan pengembangan; produksi tidak mengandalkan rollback migration destruktif.

### 7.2 Model dan service

- [ ] Tambahkan `PetaModel`, `IkonPetaModel`, dan `PenandaPetaPeralatanModel`.
- [ ] Buat satu `PetaService` untuk orkestrasi use case peta.
- [ ] Gunakan `PeralatanService`/model yang ada untuk data peralatan; jangan menyalin query bisnis tanpa alasan.
- [ ] Buat query detail peta yang mengembalikan metadata, penanda, dan ringkasan peralatan secara efisien.
- [ ] Pastikan peralatan nonaktif/relasi rusak ditandai tanpa menggagalkan seluruh respons.

### 7.3 Controller dan route API

- [ ] Tambahkan route group `/api/v1`.
- [ ] Gunakan controller API terpisah dari controller HTML.
- [ ] Terapkan `auth` pada semua endpoint peta.
- [ ] Kembalikan JSON `401/403`, bukan halaman login.
- [ ] Implementasikan endpoint read-only minimum dari Tahap 1.
- [ ] Tambahkan pagination dan whitelist filter untuk endpoint peralatan.

### 7.4 Seed data pengembangan

- [ ] Buat satu denah fixture kecil atau seeder khusus environment test.
- [ ] Gunakan peralatan hasil seeder yang sudah ada.
- [ ] Jangan memasukkan gambar operasional, dump database, atau data sensitif ke repository.

### 7.5 Pengujian

- [ ] Migration test: tabel, constraint, dan index terbentuk.
- [ ] Feature test: pengguna tanpa sesi memperoleh `401`.
- [ ] Feature test: semua role dapat membaca endpoint yang diizinkan.
- [ ] Database test: daftar/detail peta memuat relasi peralatan yang benar.
- [ ] Feature test: filter dan pagination peralatan.
- [ ] Test untuk penanda yang peralatannya nonaktif atau tidak konsisten.

### 7.6 Kriteria keluar

- [ ] Migration berjalan pada database kosong dan salinan skema pengembangan.
- [ ] API read-only lulus seluruh PHPUnit terkait.
- [ ] Tidak ada query N+1 pada detail peta.
- [ ] API siap digunakan frontend tanpa mock.

## 8. Tahap 3 — Fondasi frontend React

**Tujuan:** membangun shell aplikasi yang kecil, dapat diuji, dan siap memakai API nyata.

### 8.1 Inisialisasi

- [ ] Inisialisasi Vite + React + TypeScript di `interactive_app`.
- [ ] Buat repository Git terpisah bila belum ada.
- [ ] Tambahkan `.gitignore` untuk `.env`, `node_modules`, build, screenshot sementara, video test, dan artefak lokal.
- [ ] Tambahkan `.env.example` tanpa rahasia.
- [ ] Konfigurasikan proxy `/api` dan login CodeIgniter untuk development.
- [ ] Tambahkan scripts `dev`, `build`, `lint`, `typecheck`, `test`, dan `test:e2e`.

### 8.2 Dependency minimum

- React dan React DOM.
- TypeScript dan Vite.
- Konva dan React Konva.
- React Router hanya jika kebutuhan navigasi tidak cukup dengan route sederhana.
- Library test frontend yang disediakan template/ekosistem proyek.

Jangan menambahkan state manager global, design system besar, atau data-fetching framework sebelum kebutuhan nyata muncul. `fetch`, state React, dan komponen lokal cukup untuk MVP awal.

### 8.3 Struktur awal

```text
src/
  api/
  components/
  features/
    auth/
    maps/
    equipment/
  pages/
  styles/
  types/
```

Struktur boleh tumbuh saat ada isi. Jangan membuat file kosong atau abstraksi satu implementasi.

### 8.4 Shell aplikasi

- [ ] Implementasikan bootstrap sesi melalui `/api/v1/me`.
- [ ] Tampilkan loading awal, akses ditolak, sesi berakhir, dan error jaringan.
- [ ] Buat header, area navigasi, serta container responsif.
- [ ] Buat error boundary pada batas halaman utama.
- [ ] Gunakan capability dari API untuk menampilkan kontrol editor.

### 8.5 Pengujian

- [ ] Unit test pemetaan respons API dan error.
- [ ] Build produksi berhasil tanpa warning penting.
- [ ] Playwright memeriksa sesi valid, sesi berakhir, dan tampilan responsif shell.
- [ ] Tidak ada console error atau request gagal yang tidak ditangani.

### 8.6 Kriteria keluar

- [ ] Frontend memakai API nyata.
- [ ] Build, lint, typecheck, dan test lulus.
- [ ] Shell dapat dibuka melalui origin/path yang direncanakan.

## 9. Tahap 4 — Viewer peta MVP

**Tujuan:** memberikan nilai operasional pertama tanpa editor.

### 9.1 Daftar peta

- [ ] Tampilkan daftar peta aktif.
- [ ] Tampilkan thumbnail, nama, lokasi, label area, dan waktu pembaruan.
- [ ] Sediakan state loading, kosong, error, dan retry.
- [ ] Buka peta berdasarkan URL yang dapat dibagikan ke pengguna berwenang.

### 9.2 Kanvas viewer

- [ ] Muat gambar dasar sesuai rasio aslinya.
- [ ] Render penanda berdasarkan koordinat ternormalisasi.
- [ ] Implementasikan pan, zoom, reset view, dan fit-to-screen.
- [ ] Pisahkan layer gambar dasar dan penanda.
- [ ] Batasi zoom dan pan agar pengguna tidak kehilangan peta.
- [ ] Tampilkan fallback jika gambar atau ikon gagal dimuat.

### 9.3 Pencarian dan filter

- [ ] Cari berdasarkan nama atau kode/scan code.
- [ ] Filter kategori, fasilitas, lokasi, status, dan user status.
- [ ] Sorot serta pusatkan penanda hasil.
- [ ] Tampilkan jumlah hasil dan tombol reset.
- [ ] Simpan filter penting pada query string.

### 9.4 Panel detail

- [ ] Tampilkan ringkasan peralatan dari API.
- [ ] Tampilkan foto utama bila tersedia.
- [ ] Tampilkan status dengan teks dan warna/pola.
- [ ] Tautkan ke detail peralatan CodeIgniter.
- [ ] Tautkan ke maintenance yang sudah ada bila relevan.
- [ ] Gunakan bottom sheet pada viewport sempit.

### 9.5 Aksesibilitas

- [ ] Daftar hasil dapat digunakan tanpa kanvas.
- [ ] Pemilihan dari daftar memusatkan penanda.
- [ ] Kontrol memiliki accessible name dan fokus terlihat.
- [ ] Status tidak dibedakan hanya dengan warna.
- [ ] Keyboard dapat membuka detail penanda.

### 9.6 Pengujian

- [ ] Unit test transformasi koordinat dan filter.
- [ ] Component test state viewer penting.
- [ ] Playwright: buka peta, cari peralatan, pusatkan penanda, buka detail, ikuti tautan.
- [ ] Playwright screenshot desktop, tablet, dan mobile.
- [ ] Playwright memeriksa gambar gagal, respons API kosong, `401`, `403`, dan `500`.
- [ ] Benchmark viewer dengan 500 penanda.

### 9.7 Kriteria keluar

- [ ] Pengguna dapat menemukan satu peralatan dalam maksimal tiga interaksi.
- [ ] Viewer berfungsi pada desktop, tablet, dan mode dasar mobile.
- [ ] Data status berasal dari backend dan tidak diduplikasi di frontend.
- [ ] Viewer dapat dirilis read-only jika editor belum selesai.

## 10. Tahap 5 — Pengelolaan peta dan aset

**Tujuan:** memungkinkan admin membuat peta dan ikon dengan upload yang aman.

### 10.1 Backend upload

- [ ] Implementasikan create/update/archive peta.
- [ ] Implementasikan upload gambar dasar.
- [ ] Implementasikan create/update/nonaktifkan ikon.
- [ ] Validasi MIME dari isi file, ekstensi, ukuran file, dimensi, dan total piksel.
- [ ] Tolak SVG serta tipe lain di luar PNG/JPEG/WebP.
- [ ] Gunakan nama file acak dan path yang tidak dapat dieksekusi.
- [ ] Buat thumbnail server-side.
- [ ] Hapus file baru jika transaksi database gagal.
- [ ] Jangan hapus file yang masih direferensikan.

### 10.2 Frontend admin

- [ ] Form buat/ubah peta.
- [ ] Pemilih hierarchy lokasi.
- [ ] Preview gambar sebelum upload.
- [ ] Progress, error validasi, dan retry upload.
- [ ] Daftar dan pengelolaan ikon.
- [ ] Konfirmasi arsip/nonaktifkan.

### 10.3 Pengujian

- [ ] PHPUnit menggunakan `FakeUploadedFile` mengikuti pola service foto yang sudah ada.
- [ ] Test tipe palsu, berkas terlalu besar, gambar rusak, dan dimensi berlebihan.
- [ ] Test pembersihan file ketika database gagal.
- [ ] Test role teknisi/supervisor ditolak untuk operasi admin.
- [ ] Playwright mengunggah denah valid dan menolak berkas invalid.

### 10.4 Kriteria keluar

- [ ] Admin dapat membuat peta dan ikon tanpa akses filesystem/database manual.
- [ ] Berkas invalid tidak tersimpan.
- [ ] Tidak ada file yatim pada semua skenario gagal yang diuji.

## 11. Tahap 6 — Editor penanda MVP

**Tujuan:** memungkinkan admin menyusun peta operasional lengkap.

### 11.1 Backend penanda

- [ ] Implementasikan create/update/delete penanda.
- [ ] Implementasikan batch save dalam satu transaksi.
- [ ] Validasi peralatan aktif, ikon aktif, peta aktif, koordinat, ukuran, dan rotasi.
- [ ] Terapkan unique constraint satu peralatan per peta.
- [ ] Terapkan optimistic locking dengan `lock_version` atau `updated_at`.
- [ ] Kembalikan `409 CONFLICT` bila editor menggunakan versi lama.
- [ ] Pastikan kegagalan satu item membatalkan seluruh batch.

### 11.2 Editor frontend

- [ ] Mode editor hanya tersedia berdasarkan capability API.
- [ ] Palet ikon dan pencarian peralatan.
- [ ] Tambahkan penanda dengan drag-and-drop atau tombol alternatif.
- [ ] Pilih, pindahkan, resize, rotasi, duplikasi, dan hapus penanda.
- [ ] Inspector untuk peralatan, ikon, posisi, ukuran, rotasi, dan catatan.
- [ ] Undo/redo hanya untuk perubahan lokal yang belum disimpan.
- [ ] Indikator dirty state dan konfirmasi sebelum keluar.
- [ ] Batch save dan penanganan conflict `409`.
- [ ] Reload/merge sederhana saat konflik; jangan membangun kolaborasi real-time.

### 11.3 Aturan koordinat

- [ ] Simpan posisi pusat ikon sebagai rasio terhadap ukuran gambar asli.
- [ ] Simpan ukuran sebagai rasio atau ukuran logis yang menghasilkan tampilan konsisten.
- [ ] Clamp posisi dan ukuran agar tidak keluar dari batas yang diizinkan.
- [ ] Uji round-trip piksel → rasio → piksel dengan toleransi yang ditetapkan.

### 11.4 Pengujian

- [ ] Unit test reducer/history undo-redo.
- [ ] Unit test clamp dan konversi koordinat.
- [ ] PHPUnit transaksi batch dan optimistic locking.
- [ ] Playwright: tambahkan, pindahkan, resize, rotasi, simpan, reload, lalu verifikasi posisi.
- [ ] Playwright: batalkan perubahan dan konfirmasi meninggalkan halaman.
- [ ] Playwright: simulasi konflik dua editor.
- [ ] Playwright: operasi keyboard alternatif.

### 11.5 Kriteria keluar

- [ ] Admin dapat membangun peta lengkap tanpa perubahan manual database.
- [ ] Posisi tetap sama setelah save/reload dan perubahan viewport.
- [ ] Konflik tidak menimpa data secara diam-diam.
- [ ] Batch save bersifat atomik.

## 12. Tahap 7 — Audit, konsistensi data, dan penguatan

**Tujuan:** memenuhi kebutuhan keamanan dan operasional sebelum produksi.

### 12.1 Audit

- [ ] Buat tabel `audit_peta`.
- [ ] Catat create/update/archive peta dan ikon.
- [ ] Catat tambah/pindah/ubah/hapus penanda.
- [ ] Simpan field sebelum/sesudah yang relevan, bukan seluruh payload sensitif.
- [ ] Sediakan tampilan audit minimum untuk admin atau query operasional terdokumentasi.

### 12.2 Konsistensi

- [ ] Deteksi penanda dengan peralatan nonaktif.
- [ ] Deteksi ketidaksesuaian lokasi peta dan lokasi peralatan.
- [ ] Tampilkan masalah hanya kepada admin/supervisor.
- [ ] Sediakan tindakan perbaikan manual yang eksplisit; jangan memindahkan koordinat otomatis.

### 12.3 Keamanan

- [ ] Review seluruh route API dan role matrix.
- [ ] Review CSRF, cookie, cache header, dan CORS.
- [ ] Pastikan error produksi tidak membocorkan stack trace/path.
- [ ] Rate-limit upload dan pencarian bila diperlukan berdasarkan penggunaan nyata.
- [ ] Periksa dependency frontend/backend dan rahasia pada repository.

### 12.4 Performa dan observabilitas

- [ ] Ukur query detail peta dan endpoint pencarian.
- [ ] Tambahkan index hanya berdasarkan query plan yang terbukti.
- [ ] Catat request ID, durasi, endpoint, status, dan pengguna tanpa payload sensitif.
- [ ] Tambahkan metrik/log kegagalan upload dan batch save.
- [ ] Jalankan kembali benchmark 500 penanda pada perangkat operasional.

### 12.5 Kriteria keluar

- [ ] Audit dapat menelusuri seluruh perubahan penting.
- [ ] Role matrix lulus pengujian negatif.
- [ ] Tidak ada temuan keamanan kritis/tinggi yang terbuka.
- [ ] Target performa PRD terpenuhi.

## 13. Tahap 8 — Container, deployment, dan backup

**Tujuan:** merilis aplikasi melalui infrastruktur yang sudah digunakan tanpa mengganggu aplikasi utama.

### 13.1 Build dan container

- [ ] Buat build frontend reproducible dengan lockfile.
- [ ] Gunakan multi-stage Docker build bila frontend menjadi container terpisah.
- [ ] Sajikan frontend pada `/peta` dan API pada `/api/v1` dengan origin yang sama.
- [ ] Pastikan fallback SPA hanya berlaku di `/peta`, bukan mengambil route CodeIgniter.
- [ ] Tambahkan health check frontend/container bila terpisah.
- [ ] Mount volume aset peta/ikon secara persisten pada backend.

### 13.2 CI

- [ ] Frontend: install bersih, lint, typecheck, unit test, dan build.
- [ ] Backend: Composer install, PHPUnit terkait, dan migration check.
- [ ] Jangan menyimpan `.env`, token, dump SQL, screenshot, video, atau data upload dalam artifact source.
- [ ] Simpan artifact Playwright hanya untuk kegagalan atau periode retensi terbatas.

### 13.3 Deployment aman

- [ ] Backup database dan aset sebelum migration/deploy.
- [ ] Deploy backend/API yang backward-compatible terlebih dahulu.
- [ ] Jalankan migration forward.
- [ ] Verifikasi API read-only.
- [ ] Deploy frontend.
- [ ] Jalankan smoke test Playwright terhadap URL produksi.
- [ ] Pantau log/error setelah rilis.
- [ ] Pertahankan image/container rilis sebelumnya untuk rollback aplikasi.

### 13.4 Backup dan restore

- [ ] Backup PostgreSQL dan direktori aset dalam satu job terkoordinasi.
- [ ] Catat timestamp/manifest pasangan backup.
- [ ] Uji restore pada lingkungan nonproduksi.
- [ ] Verifikasi database, gambar dasar, thumbnail, ikon, serta penanda setelah restore.
- [ ] Dokumentasikan RPO, RTO, lokasi backup, retensi, dan penanggung jawab.

### 13.5 Kriteria keluar

- [ ] URL LAN, Tailscale, dan Cloudflare yang disetujui dapat membuka aplikasi.
- [ ] Login, viewer, editor, upload, save, dan tautan aplikasi utama lulus smoke test.
- [ ] Rollback aplikasi terdokumentasi dan teruji.
- [ ] Restore database + aset berhasil.

## 14. Tahap 9 — Uji penerimaan dan rilis MVP

**Tujuan:** memastikan produk menyelesaikan kebutuhan pengguna, bukan hanya lulus test teknis.

### 14.1 Skenario penerimaan

- [ ] Teknisi login dan menemukan peralatan melalui peta.
- [ ] Teknisi membuka detail dan maintenance pada aplikasi utama.
- [ ] Admin membuat peta dari gambar operasional nyata.
- [ ] Admin mengunggah ikon khusus.
- [ ] Admin menempatkan, mengubah, menyimpan, dan memuat ulang penanda.
- [ ] Supervisor meninjau status dan ketidaksesuaian data.
- [ ] Pengguna menguji desktop dan tablet operasional.
- [ ] Tim infrastruktur menguji backup, restore, restart, dan rollback.

### 14.2 Dokumentasi rilis

- [ ] Panduan pengguna viewer.
- [ ] Panduan admin editor dan upload.
- [ ] Panduan deployment.
- [ ] Panduan backup/restore.
- [ ] Daftar keterbatasan MVP.
- [ ] Catatan versi dalam bahasa Indonesia.

### 14.3 Kriteria keluar

- [ ] Seluruh kriteria penerimaan PRD lulus atau memiliki pengecualian tertulis.
- [ ] Pemilik produk menyetujui viewer dan editor.
- [ ] Tim operasional mengetahui prosedur masalah dan rollback.
- [ ] MVP ditandai dengan tag versi yang jelas.

## 15. Matriks pengujian wajib

| Area | PHPUnit | Unit frontend | Playwright | Manual/UAT |
|---|---:|---:|---:|---:|
| Sesi dan role | Ya | Ya | Ya | Ya |
| Daftar/detail peta | Ya | Ya | Ya | Ya |
| Pencarian/filter | Ya | Ya | Ya | Ya |
| Koordinat/transformasi | Ya untuk validasi API | Ya | Ya | Ya |
| Upload denah/ikon | Ya | Terbatas | Ya | Ya |
| Batch save penanda | Ya | Ya | Ya | Ya |
| Konflik edit | Ya | Ya | Ya | Ya |
| Responsif/visual | Tidak | Terbatas | Ya | Ya |
| Backup/restore | Tidak | Tidak | Smoke test | Ya |

## 16. Gerbang kualitas setiap pull request

Setiap pull request wajib memenuhi:

- [ ] Scope kecil dan sesuai satu tahap/fitur.
- [ ] Nama branch serta commit berbahasa Indonesia dan deskriptif.
- [ ] Tidak ada rahasia, SQL dump, upload pengguna, atau artefak tool.
- [ ] Migration memiliki alasan, constraint, index, dan test yang relevan.
- [ ] Endpoint baru memiliki test autentikasi serta role negatif.
- [ ] Perubahan frontend lulus lint, typecheck, unit test, dan build.
- [ ] Perubahan UI diperiksa melalui Playwright pada viewport relevan.
- [ ] Screenshot/video test tidak di-commit kecuali fixture dokumentasi yang disengaja.
- [ ] Kontrak API atau dokumentasi diperbarui bila bentuk respons berubah.
- [ ] Tidak ada duplikasi aturan bisnis yang sudah tersedia pada service CodeIgniter.

## 17. Strategi penggunaan Playwright

### 17.1 Saat pengembangan

- Deteksi dev server aktif sebelum menjalankan test.
- Gunakan browser terlihat untuk debugging interaksi editor.
- Gunakan locator berbasis role, label, dan teks; hindari selector CSS rapuh.
- Simpan skrip reusable untuk alur login, viewer, dan editor.
- Simpan screenshot sementara di direktori artifact yang di-ignore.

### 17.2 Suite minimum yang dipertahankan

```text
e2e/
  login-dan-sesi.spec.*
  viewer-peta.spec.*
  pencarian-peralatan.spec.*
  editor-penanda.spec.*
  upload-denah-dan-ikon.spec.*
  akses-berdasarkan-peran.spec.*
  tampilan-responsif.spec.*
```

### 17.3 Smoke test deployment

1. Buka URL `/peta`.
2. Login menggunakan akun test yang disediakan secara aman.
3. Pastikan daftar peta tampil.
4. Buka satu peta dan pilih satu penanda.
5. Pastikan request API utama berhasil dan console bersih.
6. Untuk staging, lakukan satu perubahan penanda dan pulihkan datanya.
7. Ambil screenshot desktop dan mobile sebagai artifact pipeline, bukan source repository.

## 18. Definition of Done tiap fitur

Sebuah fitur dianggap selesai hanya jika:

- kebutuhan dan hak aksesnya jelas;
- implementasi backend/frontend selesai sesuai scope;
- happy path dan failure path penting diuji;
- UI memiliki state loading, kosong, error, dan akses ditolak bila relevan;
- akses keyboard dasar tersedia;
- log tidak membocorkan data sensitif;
- dokumentasi/kontrak diperbarui;
- hasil diperiksa pada browser nyata melalui Playwright;
- tidak meninggalkan TODO yang memblokir operasi.

## 19. Fitur yang sengaja ditunda

Fitur berikut tidak dibuat sebelum MVP terbukti memerlukannya:

- JWT dan refresh token;
- state manager global khusus;
- GraphQL;
- WebSocket/kolaborasi real-time;
- PostGIS;
- offline-first/PWA penuh;
- editor CAD/BIM;
- sanitasi dan dukungan SVG;
- object storage;
- ekspor PDF/gambar;
- anotasi area dan jalur;
- microservice terpisah untuk peta.

Tambahkan hanya jika ada kebutuhan operasional, metrik, atau batas teknis yang jelas.

## 20. Urutan pekerjaan pertama

Saat implementasi dimulai, jalankan urutan berikut:

1. Konfirmasi keputusan awal pada Bagian 2.
2. Buat branch backend `fitur/api-peta-interaktif` dari `main` terbaru.
3. Inisialisasi repository frontend pada branch `fondasi/aplikasi-peta`.
4. Kerjakan proof-of-concept koordinat dan sesi pada Tahap 0.
5. Dokumentasikan hasil benchmark dan payload `/api/v1/me`.
6. Finalisasi kontrak API serta skema tabel.
7. Implementasikan migration dan API read-only.
8. Implementasikan shell React dan viewer dengan API nyata.
9. Demonstrasikan viewer sebelum memulai upload/editor.
10. Lanjutkan upload dan editor hanya setelah gerbang viewer disetujui.

## 21. Target milestone

Estimasi final dibuat setelah Tahap 0 karena kapasitas data, kualitas denah, dan kebijakan role belum divalidasi. Urutan milestone tidak berubah:

| Milestone | Hasil yang dapat didemokan |
|---|---|
| M0 | Proof-of-concept kanvas, koordinat, performa, dan sesi |
| M1 | API read-only serta frontend shell |
| M2 | Viewer peta lengkap dengan pencarian dan detail |
| M3 | Upload denah serta ikon yang aman |
| M4 | Editor penanda dengan batch save dan conflict handling |
| M5 | Audit, deployment, backup/restore, dan UAT |

Viewer M2 dapat dirilis lebih awal sebagai versi read-only apabila memberikan manfaat operasional dan seluruh pemeriksaan keamanan telah lulus.
