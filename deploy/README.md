# Deployment `/maps`

Frontend dibangun dengan base path `/maps/` dan berjalan sebagai container statis pada port `8082`. API tetap dilayani aplikasi CodeIgniter pada `/api/v1`, sehingga session cookie dan CSRF tetap same-origin.

## Portainer

Deploy repository ini sebagai Git Stack menggunakan `compose.yaml`, lalu pastikan:

- `http://192.168.10.103:8082/maps/` mengembalikan frontend;
- `http://192.168.10.103:8082/healthz` mengembalikan `ok`;
- port `8082` hanya dibuka pada jaringan yang dibutuhkan.

## Cloudflare Tunnel

Buat route public hostname yang lebih spesifik sebelum route aplikasi utama:

| Hostname | Path | Service |
|---|---|---|
| `airport-tech.farlabs.my.id` | `^/maps(/.*)?$` | `http://192.168.10.103:8082` |
| `airport-tech.farlabs.my.id` | `*` | `http://192.168.10.103:8081` |

Hasilnya, browser membuka `https://airport-tech.farlabs.my.id/maps/`, sedangkan request `/api/v1/*` tetap menuju CodeIgniter pada port `8081`.
