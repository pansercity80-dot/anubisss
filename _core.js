'use strict';
/* Inti /api/fetch: ambil HTML mentah dulu, lalu render lewat Browserless /content
   (Chrome sungguhan, hasilnya sama seperti tab Elements di DevTools) bila perlu. */
const dns = require('dns').promises;
const net = require('net');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const BL_URL = (process.env.BROWSERLESS_URL || 'https://production-sfo.browserless.io').replace(/\/$/, '');
const BL_TOKEN = process.env.BROWSERLESS_TOKEN || '';
const MAX_BIN = 6 * 1048576;

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
  }
  if (net.isIPv6(ip)) { const l = ip.toLowerCase(); return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:'); }
  return true;
}

async function safeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { throw new Error('Format link tidak valid.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Hanya link http atau https.');
  const h = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(h)) throw new Error('Alamat ini tidak diizinkan.');
  if (net.isIP(h)) { if (privateIp(h)) throw new Error('Alamat ini tidak diizinkan.'); return u; }
  const addrs = await dns.lookup(h, { all: true });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error('Alamat ini tidak diizinkan.');
  return u;
}

/* halaman kerangka JS atau kode diacak: perlu dirender browser */
function looksShell(html) {
  if (!html) return true;
  const scripts = (html.match(/<script\b/gi) || []).length;
  const text = html.replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (/<div[^>]+id=["'](root|app|__next|__nuxt|svelte)["'][^>]*>\s*<\/div>/i.test(html) && text.length < 400) return true;
  if (/<noscript[^>]*>[^<]*(enable javascript|aktifkan javascript|requires javascript)/i.test(html) && text.length < 600) return true;
  if (/eval\(function\(p,a,c,k,e,[dr]\)|document\.write\(\s*(un)?escape\(|atob\(["'][A-Za-z0-9+/=]{200,}/.test(html) && text.length < 800) return true;
  return scripts > 0 && text.length < 120;
}

async function timed(url, opt, ms) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, Object.assign({}, opt, { signal: ac.signal })); } finally { clearTimeout(t); }
}

async function viaBrowserless(url) {
  if (!BL_TOKEN) return null;
  try {
    const r = await timed(BL_URL + '/content?token=' + encodeURIComponent(BL_TOKEN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ url, gotoOptions: { waitUntil: 'networkidle2', timeout: 30000 } })
    }, 45000);
    if (!r.ok) return null;
    const html = await r.text();
    return html && html.length > 80 ? { html, finalUrl: url } : null;
  } catch (e) { return null; }
}

async function handle(q) {
  const raw = q.url, mode = q.render || 'auto';
  if (!raw) return { code: 400, json: { error: 'Parameter url wajib diisi.' } };
  let u;
  try { u = await safeUrl(raw); } catch (e) { return { code: 400, json: { error: e.message } }; }

  if (q.bin) {
    try {
      const r = await timed(u.href, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow' }, 20000);
      if (!r.ok) return { code: 200, json: { error: 'Status ' + r.status } };
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_BIN) return { code: 200, json: { error: 'File terlalu besar.' } };
      return { code: 200, json: { base64: buf.toString('base64'), contentType: r.headers.get('content-type') || '' } };
    } catch (e) { return { code: 200, json: { error: 'Gagal mengambil file.' } }; }
  }

  let plain = null;
  if (mode !== 'true') {
    try {
      const r = await timed(u.href, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'id,en;q=0.8' }, redirect: 'follow' }, 20000);
      plain = { status: r.status, body: await r.text(), finalUrl: r.url || u.href };
    } catch (e) { plain = null; }
  }

  const need = mode === 'true' || (mode !== 'false' && (!plain || plain.status >= 400 || looksShell(plain.body)));
  if (need) {
    const b = await viaBrowserless(u.href);
    if (b) return { code: 200, json: { status: 200, body: b.html, raw: plain ? plain.body : '', rendered: 'browserless', finalUrl: (plain && plain.finalUrl) || b.finalUrl } };
  }
  if (plain) return { code: 200, json: plain };
  return { code: 200, json: { error: 'Link tidak bisa dibuka dari server.' } };
}

module.exports = { handle, looksShell, safeUrl };
