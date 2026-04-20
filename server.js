const express = require('express');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = 4446;

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0, setHeaders: (res) => { res.setHeader('Cache-Control', 'no-store'); } }));

// ── Helpers ───────────────────────────────────────────────────────────────────
function base(host) { return host.replace(/\/+$/, ''); }

function apiUrl(host, username, password, action, extra = '') {
  return `${base(host)}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=${action}${extra}`;
}

function makeSitename(host) {
  return host.replace(/^https?:\/\//, '').replace(/[/:]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function makeLibFilename(host, username) {
  const site = makeSitename(host);
  const now  = new Date();
  const d    = now.toISOString().slice(0, 10);                      // 2026-04-18
  const t    = now.toTimeString().slice(0, 8).replace(/:/g, '-');   // 14-30-22
  return `${site}--${username}--${d}_${t}.json`;
}

function libDir() { return __dirname; }

function listLibraries() {
  try {
    return fs.readdirSync(libDir())
      .filter(f => f.endsWith('.json') && f.includes('--'))
      .map(filename => {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(libDir(), filename), 'utf8'));
          return {
            filename,
            host:         raw.host,
            username:     raw.username,
            sitename:     raw.sitename || makeSitename(raw.host || ''),
            downloaded_at: raw.downloaded_at,
            counts:       raw.counts || {},
            complete:     raw.complete || false
          };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => (b.downloaded_at || 0) - (a.downloaded_at || 0));
  } catch { return []; }
}

const TIMEOUT     = 20000;
const LIB_TIMEOUT = 300000; // 5 min for big fetches
const HEADERS     = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

// ── Connect ───────────────────────────────────────────────────────────────────
app.post('/api/connect', async (req, res) => {
  const { host, username, password } = req.body;
  if (!host || !username || !password)
    return res.status(400).json({ error: 'host, username and password are required' });
  try {
    const url = `${base(host)}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const { data } = await axios.get(url, { timeout: TIMEOUT, headers: HEADERS });
    if (data && data.user_info) {
      res.json({ success: true, user_info: data.user_info, server_info: data.server_info });
    } else {
      res.status(401).json({ success: false, error: 'Invalid credentials or unsupported provider' });
    }
  } catch (err) { res.status(502).json({ success: false, error: err.message }); }
});

// ── Live ──────────────────────────────────────────────────────────────────────
app.get('/api/live/categories', async (req, res) => {
  const { host, username, password } = req.query;
  try {
    const { data } = await axios.get(apiUrl(host, username, password, 'get_live_categories'), { timeout: TIMEOUT, headers: HEADERS });
    res.json(data);
  } catch (err) { res.status(502).json({ error: err.message }); }
});

app.get('/api/live/streams', async (req, res) => {
  const { host, username, password, category_id } = req.query;
  try {
    const extra = category_id ? `&category_id=${category_id}` : '';
    const { data } = await axios.get(apiUrl(host, username, password, 'get_live_streams', extra), { timeout: TIMEOUT, headers: HEADERS });
    res.json(data);
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ── VOD ───────────────────────────────────────────────────────────────────────
app.get('/api/vod/categories', async (req, res) => {
  const { host, username, password } = req.query;
  try {
    const { data } = await axios.get(apiUrl(host, username, password, 'get_vod_categories'), { timeout: TIMEOUT, headers: HEADERS });
    res.json(data);
  } catch (err) { res.status(502).json({ error: err.message }); }
});

app.get('/api/vod/streams', async (req, res) => {
  const { host, username, password, category_id } = req.query;
  try {
    const extra = category_id ? `&category_id=${category_id}` : '';
    const { data } = await axios.get(apiUrl(host, username, password, 'get_vod_streams', extra), { timeout: TIMEOUT, headers: HEADERS });
    res.json(data);
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ── Series ────────────────────────────────────────────────────────────────────
app.get('/api/series/categories', async (req, res) => {
  const { host, username, password } = req.query;
  try {
    const { data } = await axios.get(apiUrl(host, username, password, 'get_series_categories'), { timeout: TIMEOUT, headers: HEADERS });
    res.json(data);
  } catch (err) { res.status(502).json({ error: err.message }); }
});

app.get('/api/series/list', async (req, res) => {
  const { host, username, password, category_id } = req.query;
  try {
    const extra = category_id ? `&category_id=${category_id}` : '';
    const { data } = await axios.get(apiUrl(host, username, password, 'get_series', extra), { timeout: TIMEOUT, headers: HEADERS });
    res.json(data);
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ── Library: list saved files ─────────────────────────────────────────────────
app.get('/api/library/list', (req, res) => {
  res.json(listLibraries());
});

// ── Library: start – create file + fetch all categories ──────────────────────
app.post('/api/library/start', async (req, res) => {
  const { host, username, password } = req.body;
  const filename = makeLibFilename(host, username);
  const lp       = path.join(libDir(), filename);

  // Fetch all category lists upfront so they're available offline later
  let categories = { live: [], vod: [], series: [] };
  try {
    const [lc, vc, sc] = await Promise.all([
      axios.get(apiUrl(host, username, password, 'get_live_categories'),   { timeout: TIMEOUT, headers: HEADERS }),
      axios.get(apiUrl(host, username, password, 'get_vod_categories'),    { timeout: TIMEOUT, headers: HEADERS }),
      axios.get(apiUrl(host, username, password, 'get_series_categories'), { timeout: TIMEOUT, headers: HEADERS })
    ]);
    categories.live   = Array.isArray(lc.data) ? lc.data : [];
    categories.vod    = Array.isArray(vc.data) ? vc.data : [];
    categories.series = Array.isArray(sc.data) ? sc.data : [];
  } catch { /* categories stay empty if provider fails */ }

  const lib = {
    filename, host, username, password,
    sitename:     makeSitename(host),
    downloaded_at: Date.now(),
    complete:     false,
    categories,
    counts:       {},
    live:         [],
    vod:          [],
    series:       []
  };

  fs.writeFileSync(lp, JSON.stringify(lib), 'utf8');
  res.json({ success: true, filename });
});

// ── Library: fetch one type and save into the file ────────────────────────────
app.post('/api/library/fetch', async (req, res) => {
  const { host, username, password, type, filename } = req.body;
  const lp = path.join(libDir(), filename);

  const actionMap = { live: 'get_live_streams', vod: 'get_vod_streams', series: 'get_series' };
  const action    = actionMap[type];
  if (!action) return res.status(400).json({ error: 'Unknown type' });

  try {
    const { data }  = await axios.get(apiUrl(host, username, password, action), { timeout: LIB_TIMEOUT, headers: HEADERS });
    const streams   = Array.isArray(data) ? data : [];

    let lib = {};
    try { lib = JSON.parse(fs.readFileSync(lp, 'utf8')); } catch {}

    lib[type]          = streams;
    lib.counts         = lib.counts || {};
    lib.counts[type]   = streams.length;
    lib.downloaded_at  = Date.now();
    lib.complete       = !!(lib.live?.length >= 0 && lib.vod?.length >= 0 && lib.series?.length >= 0);

    fs.writeFileSync(lp, JSON.stringify(lib), 'utf8');
    res.json({ success: true, count: streams.length });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});

// ── Library: open a saved file ────────────────────────────────────────────────
app.get('/api/library/open', (req, res) => {
  const { filename } = req.query;
  // Safety: only allow filenames in the lib dir, no path traversal
  const lp = path.join(libDir(), path.basename(filename));
  if (!fs.existsSync(lp)) return res.status(404).json({ error: 'Not found' });
  try {
    res.json(JSON.parse(fs.readFileSync(lp, 'utf8')));
  } catch { res.status(500).json({ error: 'Could not read file' }); }
});

// ── Library: delete a saved file ─────────────────────────────────────────────
app.delete('/api/library/file', (req, res) => {
  const { filename } = req.query;
  const lp = path.join(libDir(), path.basename(filename));
  if (fs.existsSync(lp)) fs.unlinkSync(lp);
  res.json({ success: true });
});

// ── M3U Editor: parse ─────────────────────────────────────────────────────────
function parseM3U(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const channels = [];
  let current = null;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#EXTINF:')) {
      const ci      = t.indexOf(',');
      const meta    = ci >= 0 ? t.slice(0, ci) : t;
      const rawName = ci >= 0 ? t.slice(ci + 1).trim() : '';
      const tvgName = (meta.match(/tvg-name="([^"]*)"/) || [])[1] || '';
      const name    = rawName || tvgName;
      current = {
        name,
        tvg_id:   (meta.match(/tvg-id="([^"]*)"/)     || [])[1] || '',
        tvg_name: tvgName || rawName,
        tvg_logo: (meta.match(/tvg-logo="([^"]*)"/)   || [])[1] || '',
        group:    (meta.match(/group-title="([^"]*)"/) || [])[1] || '',
        ch_num:   (meta.match(/tvg-chno="([^"]*)"/)   || [])[1] || '',
        duration: (meta.match(/^#EXTINF:(-?\d+)/)     || [])[1] || '-1',
      };
    } else if (!t.startsWith('#') && current) {
      current.url = t;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}

function buildM3U(channels) {
  let m3u = '#EXTM3U\n';
  for (const ch of channels) {
    const chno = ch.ch_num ? ` tvg-chno="${ch.ch_num}"` : '';
    m3u += `#EXTINF:${ch.duration || '-1'}${chno} tvg-id="${ch.tvg_id || ''}" tvg-name="${ch.name || ''}" tvg-logo="${ch.tvg_logo || ''}" group-title="${ch.group || ''}",${ch.name || ''}\n`;
    m3u += `${ch.url}\n`;
  }
  return m3u;
}

app.post('/api/m3u/parse', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'No content provided' });
  try { res.json(parseM3U(content)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/m3u/export', (req, res) => {
  const { channels, filename } = req.body;
  if (!channels?.length) return res.status(400).json({ error: 'No channels' });
  res.setHeader('Content-Type', 'application/x-mpegURL');
  res.setHeader('Content-Disposition', `attachment; filename="${filename || 'playlist-edited.m3u'}"`);
  res.send(buildM3U(channels));
});

// ── Generate M3U ──────────────────────────────────────────────────────────────
app.post('/api/generate-m3u', (req, res) => {
  const { host, username, password, streams } = req.body;
  if (!streams || !streams.length)
    return res.status(400).json({ error: 'No streams selected' });

  const b   = base(host);
  let m3u   = '#EXTM3U\n';

  for (const s of streams) {
    const name  = (s.name || 'Unknown').replace(/,/g, ' ');
    const logo  = s.stream_icon || s.cover || '';
    const group = (s.category || 'Uncategorized').replace(/"/g, "'");
    const tvgId = s.epg_channel_id || '';
    let url = '';

    if (s.type === 'live') {
      url  = `${b}/live/${username}/${password}/${s.stream_id}.m3u8`;
      m3u += `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${name}" tvg-logo="${logo}" group-title="${group}",${name}\n${url}\n`;
    } else if (s.type === 'vod') {
      const ext = s.container_extension || 'mp4';
      url  = `${b}/movie/${username}/${password}/${s.stream_id}.${ext}`;
      m3u += `#EXTINF:-1 tvg-name="${name}" tvg-logo="${logo}" group-title="${group}",${name}\n${url}\n`;
    } else if (s.type === 'series' || s.type === 'series_episode') {
      const ext = s.container_extension || 'mkv';
      url  = `${b}/series/${username}/${password}/${s.stream_id}.${ext}`;
      m3u += `#EXTINF:-1 tvg-name="${name}" tvg-logo="${logo}" group-title="${group}",${name}\n${url}\n`;
    }
  }

  res.setHeader('Content-Type', 'application/x-mpegURL');
  res.setHeader('Content-Disposition', 'attachment; filename="playlist.m3u"');
  res.send(m3u);
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✅  IPTV Manager  →  http://localhost:${PORT}\n`);
});
