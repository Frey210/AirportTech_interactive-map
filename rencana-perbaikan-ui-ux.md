# Review dan rencana perbaikan UI/UX peta interaktif

Tanggal: 21 September 2026. Status: rencana untuk implementasi berikutnya.

## Dasar review

Review berdasarkan screenshot pengguna, `design_refrence.png`, `logo.png`, kode frontend lokal, serta route dan migrasi API backend. Belum merupakan pengujian interaksi browser production. Tidak ada perubahan aplikasi atau deployment pada tahap review ini.

Referensi memberi arah: identitas Injourney di header putih, navigasi teal gelap, permukaan netral terang, tulisan gelap, dan aksen merek secukupnya. Tata letak tabel pada referensi tidak perlu disalin ke viewer; denah tetap mendapat ruang terbesar.

## Temuan yang terverifikasi

| Temuan | Bukti kode | Dampak dan keputusan |
|---|---|---|
| Belum ada hapus peta | `src/api.ts` memiliki hapus ikon, tetapi route backend belum memiliki hapus peta | Tambahkan alur frontend dan backend, bukan sekadar tombol |
| Roda gigi menduplikasi Kelola ikon | Kedua handler di `src/App.tsx` memanggil `setShowIconWizard(true)` | Hapus roda gigi dari navigasi; satu akses Kelola ikon dalam pengelolaan peta |
| Peta dan filter membuka panel sama | Keduanya mengubah `menuOpen` | Pisahkan isi panel Peta dan Filter dengan satu state panel aktif |
| Kaca pembesar hanya memfokuskan pencarian atas | Handler memanggil `searchRef.current?.focus()` | Hapus dari sidebar; pertahankan pencarian atas dan navigasi keyboard |
| AT adalah tautan kembali | `.rail-brand` menuju `/dashboard` | Ganti ikon rumah dengan label Kembali ke aplikasi utama; validasi tujuan terhadap konfigurasi deployment |
| Kembali hilang di mobile | Media query menyembunyikan `.rail-brand` | Sediakan Beranda pada bottom bar |
| Batal/Tutup tampak nonaktif | `.secondary` masih memakai teks terang `#d7e3d9` dari tema gelap | Rapikan aturan tema dan state tombol; hindari menumpuk override lagi |
| Simpan kadang memang nonaktif | `disabled={!editorDirty || editorSaving}` | Pertahankan logika; beri alasan terlihat dan bedakan belum berubah dari sedang menyimpan |
| Tutup editor hilang di mobile | `.editor-commandbar .secondary` disembunyikan pada breakpoint mobile | Pertahankan akses Tutup dan Simpan di toolbar editor mobile |
| Status peta membingungkan | Label Draft hanya memeriksa `siap_diedit` pada selector | Beri label konsisten: Draft tanpa denah, Draft siap diedit, Terbit, Arsip |

## Navigasi yang diusulkan

| Kontrol | Fungsi tunggal | Desktop | Mobile |
|---|---|---|---|
| Beranda | Kembali ke aplikasi utama | Ikon rumah dengan tooltip/label aksesibel di rail | Item berlabel di bottom bar |
| Peta | Katalog gedung/lantai dan pengelolaan peta | Panel katalog, terpisah dari filter | Sheet katalog |
| Filter | Kategori, fasilitas, JBRD, status, user status, hasil | Panel filter dengan jumlah filter aktif | Sheet filter yang bisa digulir |
| Scan QR | Identifikasi peralatan | Tombol dekat pencarian | Item Scan QR di bottom bar |
| Pencarian | Saran nama/scan code/lokasi | Selalu di atas | Selalu di atas, lebar fleksibel |

Bottom bar berisi empat item: Beranda, Peta, Filter, Scan QR. Tidak ada tombol pencarian atau roda gigi tambahan. Panel Peta dan Filter saling menggantikan, tidak menumpuk. State aktif mengikuti panel yang benar-benar terbuka, bukan ikon peta yang selalu aktif.

Header menempatkan logo Injourney di pojok kiri atas pada bidang putih, proporsi asli dipertahankan. Desktop: tinggi awal 52–56 px; mobile: header ringkas sekitar 44–48 px, disesuaikan hasil uji. Ukuran ditentukan dari area visual logo, memperhitungkan padding transparan aset. Pencarian dan selector gedung/lantai tetap mudah dijangkau. Logo merupakan identitas, tombol Beranda merupakan navigasi.

Katalog Peta memuat thumbnail, nama, gedung/lantai, badge status, jumlah penanda, dan menu tindakan berlabel. Admin mendapat Tambah peta, Edit penanda, Terbitkan, Kelola ikon, dan Hapus. Kelola ikon adalah satu akses pustaka ikon, bukan pengaturan umum. Teknisi hanya melihat tindakan sesuai capability API. Pustaka ikon perlu dapat dibuka meskipun belum ada peta yang dipilih; saat ini bergantung pada `editorData`, sehingga pemuatan datanya perlu dipisahkan dari pilihan peta.

## Hapus peta: perilaku dan batas data

Hapus harus tersedia untuk draft maupun terbit. Jangan menyamakan Hapus dengan Arsip tanpa penjelasan. Rekomendasi rilis pertama adalah penghapusan peta secara eksplisit dengan konfirmasi dampak; arsip/pemulihan mandiri dapat menjadi pengembangan terpisah.

1. Admin membuka menu tindakan pada kartu peta lalu memilih Hapus peta.
2. Dialog menampilkan nama, gedung/lantai, status, jumlah penanda, dan peringatan bahwa peta terbit tidak lagi tersedia bagi teknisi.
3. Teks wajib menjelaskan: peta beserta penempatan peralatannya dihapus; master peralatan, riwayat maintenance, ikon bersama, dan peta lainnya tetap ada. Pemulihan memerlukan backup, bukan tombol undo yang belum tersedia.
4. Konfirmasi nama peta untuk peta terbit atau peta yang berisi penanda; draft kosong cukup konfirmasi biasa. Batal menjadi pilihan fokus awal.
5. API memeriksa sesi, role admin, CSRF, keberadaan peta, dan versi terbaru. Tolak konflik bila data berubah sejak dialog dibuka; jangan menghapus perubahan pengguna lain diam-diam.
6. Hapus relasi `peta_lokasi` dan penanda milik peta dalam transaksi. Periksa seluruh foreign key dan perilaku `audit_peta` sebelum implementasi; catatan audit penghapusan harus bertahan, tidak ikut hilang melalui cascade.
7. Bersihkan berkas denah/thumbnail setelah transaksi berhasil, hanya path terverifikasi milik peta tersebut dan tidak direferensikan peta lain. Kegagalan berkas dicatat dan bisa dicoba ulang; jangan mengembalikan status sukses palsu pada penghapusan database yang gagal.
8. Bersihkan pilihan peta, detail peralatan, dan parameter URL yang sudah tidak valid. Jika tidak ada peta tersisa, tampilkan empty state sesuai role. Deep-link lama menampilkan Peta tidak tersedia dan pilihan kembali ke katalog.

Kontrak usulan: `POST /api/v1/peta/{id}/hapus`, mengikuti pola mutasi saat ini, dengan token versi/konfirmasi yang disepakati pada implementasi. Capability khusus hapus atau pemetaan admin harus eksplisit dan divalidasi backend. Tidak ada bulk delete dalam rilis pertama.

## Tombol dan bahasa visual

Palet awal berikut merupakan usulan yang mendekati referensi, bukan hasil ekstraksi warna presisi dari screenshot:

| Token | Warna awal | Pemakaian |
|---|---|---|
| Primary | `#126F75` | Simpan/aksi utama, teks putih |
| Navigation | `#0D5359` | Rail teal gelap, ikon terang |
| Surface | `#FFFFFF` | Header, dialog, kartu |
| Background | `#F4F7F6` | Area aplikasi |
| Text | `#243638` | Isi dan tombol sekunder |
| Muted | `#52676B` | Keterangan |
| Danger | `#B42318` | Hapus dan error |

Verifikasi pasangan warna dan state hasil render sebelum rilis: teks normal minimal 4,5:1; indikator kontrol bermakna minimal 3:1. Aksen kuning/hijau merek tidak dipakai sebagai tulisan pucat di permukaan putih. Warna status peralatan tetap semantik dan disertai teks/legenda.

- Primary aktif: teal solid dan teks putih, satu aksi utama per kelompok.
- Secondary aktif: putih, teks gelap, border jelas; berlaku pada Batal dan Tutup editor.
- Disabled: atribut disabled sesuai logika dan tampilan berbeda; alasan seperti Belum ada perubahan terlihat di toolbar. Jangan memakai cursor wait untuk semua tombol nonaktif.
- Loading: Menyimpan… dengan indikator proses; cegah kiriman ganda.
- Error: tampilkan sebab dekat tindakan dan pertahankan input untuk percobaan ulang.
- Focus dan pressed: indikator jelas, tanpa pergeseran layout.

Tutup editor tetap aktif saat tidak sedang menyimpan. Bila ada perubahan belum tersimpan, tampilkan dialog Simpan dan tutup / Buang perubahan / Lanjut mengedit. Tutup setelah penyimpanan berhasil saja. Batal pada wizard membatalkan perubahan wizard yang belum disimpan; penghapusan ikon yang sudah berhasil tidak dianggap dapat di-undo hanya dengan menutup dialog.

## Mobile, editor, dan kanvas

- Bottom bar mengikuti safe area; tombol minimal 44 × 44 CSS px dengan label singkat.
- Sheet memiliki heading, tombol tutup, tinggi terbatas, dan area konten scroll. Pencarian dibatasi sekitar empat hasil terlihat sebelum scroll agar denah tetap terbaca.
- Toolbar editor menampilkan Tutup, Simpan, dan indikator perubahan pada mobile. Panel peralatan dan inspektor tidak terbuka saling menutupi.
- Detail peralatan berada di atas bottom bar. Penanda terpilih diposisikan dalam area kanvas yang tidak tertutup dengan pan seperlunya; jangan melakukan fit/zoom ulang setiap panel dibuka.
- Fit menghitung ruang tampilan aktual setelah header, panel, dan bottom bar; resize hanya menyesuaikan bila diperlukan. Pertahankan pinch zoom, deep-link, dan koordinat rasio gambar.
- Ketukan/scroll panel tidak menggeser denah di belakangnya. Tombol, sheet, dan pencarian dapat dioperasikan dengan keyboard; dialog mengembalikan fokus ke pemicunya.
- Hindari blur besar atau penghitungan ulang semua penanda tiap frame karena terdapat riwayat lag pada denah dengan banyak penanda.

## Tahapan implementasi dan kriteria selesai

### Tahap 1 — tombol dan navigasi (prioritas pertama)

- [x] Rapikan aturan light theme dan variasi primary/secondary/danger/disabled/loading di `src/styles.css`.
- [x] Hapus shortcut pencarian serta roda gigi duplikat; bedakan panel Peta dan Filter di `src/App.tsx`.
- [x] Tambahkan logo dan ikon Beranda desktop/mobile; verifikasi tautan terhadap base URL aplikasi utama.
- [x] Pastikan Tutup editor selalu tersedia di mobile dan alasan Simpan nonaktif terlihat.
- [ ] Uji role admin/teknisi, keyboard, kontras, viewport 360/390/768/1366 px, serta landscape.

### Tahap 2 — katalog dan siklus hidup peta

- [ ] Pisahkan pustaka ikon dari ketergantungan pemilihan peta.
- [x] Tampilkan badge draft/terbit konsisten dan tindakan sesuai role.
- [x] Finalisasi kontrak hapus dan audit; periksa foreign key, transaksi, serta kepemilikan berkas.
- [x] Implementasikan dialog hapus dan endpoint, termasuk konflik versi dan kegagalan request.
- [ ] Uji hapus draft kosong, draft berpenanda, dan peta terbit pada database uji; pastikan peralatan, maintenance, ikon bersama, dan peta lain tidak berubah.
- [ ] Uji akses tanpa izin, deep-link terhapus, peta terakhir dihapus, dan audit yang tetap tersedia. *(akses role dan audit selesai; deep-link serta peta terakhir belum)*

### Tahap 3 — tata letak responsif dan validasi rilis

- [ ] Rapikan sheet mobile, inspektor, detail card, dan kontrol zoom mengikuti ruang aktual.
- [ ] Uji pencarian + filter JBRD + QR + deep-link bersama perubahan navigasi.
- [ ] Uji editor bersih/kotor/menyimpan/gagal dan konfirmasi keluar tanpa kehilangan perubahan.
- [ ] Jalankan regresi pan/pinch/fit dengan sample denah operasional dan semua penanda terlihat.
- [ ] Playwright: screenshot desktop/mobile, klik navigasi, focus keyboard, dialog, state tombol, dan overflow; lengkapi uji pinch di perangkat sentuh. *(desktop/mobile, navigasi, dialog, dan state tombol selesai)*
- [ ] Perbarui kontrak API, panduan pengguna, dan catatan validasi; rilis melalui branch terpisah dengan backup serta verifikasi data sebelum/sesudah. *(kontrak API selesai)*

## Batas review

Penyebab CSS dan handler terverifikasi dari source; kontras hasil komposisi, benturan panel nyata, dan performa perangkat perlu dibuktikan pada browser saat implementasi. Rencana ini memakai prioritas skill UI/UX: kejelasan navigasi, state kontrol, aksesibilitas, lalu penataan visual. Tidak memerlukan library UI baru atau perubahan mesin kanvas.
