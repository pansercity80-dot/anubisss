# Anubis: pasang render Browserless

1. Daftar di browserless.io, ambil API token dari dashboard.
2. Di Vercel atau Netlify, isi Environment Variable:
   - BROWSERLESS_TOKEN = token kamu
   - BROWSERLESS_URL   = (opsional) default https://production-sfo.browserless.io
3. Deploy folder ini. Endpoint /api/fetch langsung aktif.

Alur: server ambil HTML mentah dulu. Kalau halaman kerangka JS, kode diacak,
atau diblokir, server minta Browserless /content (Chrome sungguhan) dan
mengembalikan DOM akhir seperti tab Elements di DevTools.
Tanpa token, Anubis tetap jalan lewat jalur lama (sandbox browser dan proxy cadangan).
Token hanya ada di server, tidak pernah masuk index.html.
