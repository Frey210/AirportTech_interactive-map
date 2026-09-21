# Deployment `/maps`

Frontend dibangun dengan base path `/maps/`. Pada server production saat ini, hasil build dipasang read-only dari `/opt/airport-stack/maps` ke `/var/www/html/public/maps` pada container CodeIgniter. Dengan demikian frontend, session, CSRF, dan API `/api/v1` tetap berada pada origin dan port `8081` yang sama.

## Deployment server

Script `deploy-maps.sh` mengambil branch repository menggunakan Deploy Key read-only, membangun image Docker, mengekstrak artifact frontend, mengganti direktori `/maps` secara atomik, lalu menjalankan health check LAN dan Tailscale.

```bash
sudo deploy-airport-maps --list
sudo deploy-airport-maps fitur/perbaikan-ui-peta
sudo deploy-airport-maps --current
```

Setelah deployment, pastikan:

- `http://192.168.10.70:8081/maps/` mengembalikan frontend;
- `http://100.90.2.119:8081/maps/` dapat dibuka melalui Tailscale;
- `https://airport-tech.farlabs.my.id/maps/` dapat dibuka dari internet;
- request `/api/v1/*` tetap menuju aplikasi CodeIgniter yang sama.

## Cloudflare Tunnel

Pertahankan satu route `airport-tech.farlabs.my.id` ke `http://192.168.10.70:8081`. Route path khusus `/maps` dan port `8082` tidak diperlukan pada arsitektur production yang aktif.

`compose.yaml` dan image Nginx tetap tersedia untuk pengujian lokal atau jika kelak frontend benar-benar dipisahkan menjadi container tersendiri.
