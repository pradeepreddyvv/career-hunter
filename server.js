/**
 * Career Hunter — Local Dev Server
 * - Serves ui/ as static files on port 8080
 * - Mocks /webhook/profile-store (profile + API key storage)
 * - Proxies other /webhook/* and /api/* → n8n at port 5678 (if running)
 *
 * Usage: node server.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;
const N8N_URL = process.env.N8N_URL || 'http://localhost:5678';
const UI_DIR = path.join(__dirname, 'ui');
const DATA_DIR = path.join(__dirname, 'local_data');

// Ensure data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ── Simple file-backed store ──────────────────────────────────────────────────
function readStore(name) {
  const f = path.join(DATA_DIR, `${name}.json`);
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch { return {}; }
}
function writeStore(name, data) {
  fs.writeFileSync(path.join(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

// ── JSON body reader ──────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function jsonOk(res, data) {
  const body = JSON.stringify(data);
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}
function jsonErr(res, msg, status = 400) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ error: msg }));
}

// ── /webhook/profile-store mock ───────────────────────────────────────────────
async function handleProfileStore(req, res) {
  const qs = new URL('http://x' + req.url).searchParams;
  const type = qs.get('type') || 'profile';

  if (req.method === 'GET') {
    const store = readStore('profile_store');
    return jsonOk(res, { ok: true, data: store[type] || {} });
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const store = readStore('profile_store');
    store[type] = { ...(store[type] || {}), ...body };
    writeStore('profile_store', store);
    return jsonOk(res, { ok: true });
  }

  jsonErr(res, 'Method not allowed', 405);
}

// ── Static file server ────────────────────────────────────────────────────────
function serveStatic(req, res) {
  let filePath = path.join(UI_DIR, req.url === '/' ? '/career_hub.html' : req.url);
  filePath = filePath.split('?')[0];

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      return res.end(`Not found: ${req.url}`);
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
}

// ── n8n proxy (fallback for other /webhook/* routes) ─────────────────────────
function proxy(req, res) {
  const target = new URL(N8N_URL);
  const options = {
    hostname: target.hostname,
    port: target.port || 80,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: target.host },
  };

  const mod = target.protocol === 'https:' ? https : http;
  const proxyReq = mod.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'n8n not reachable', hint: 'Run: npx n8n' }));
  });

  req.pipe(proxyReq);
}

// ── /webhook/jobs-api mock ────────────────────────────────────────────────────
function handleJobsApi(req, res) {
  const store = readStore('jobs');
  return jsonOk(res, store.jobs || []);
}

// ── /webhook/batch-results mock ───────────────────────────────────────────────
function handleBatchResults(req, res) {
  const store = readStore('batch_results');
  return jsonOk(res, store.results || []);
}

// ── /webhook/job-docs mock ────────────────────────────────────────────────────
async function handleJobDocs(req, res) {
  const qs = new URL('http://x' + req.url).searchParams;
  const jobKey = qs.get('job_key');
  const store = readStore('job_docs');

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (body.bulk && body.docs) {
      Object.assign(store, body.docs);
      writeStore('job_docs', store);
      return jsonOk(res, { ok: true, saved: Object.keys(body.docs).length });
    }
    store[body.job_key || `job_${Date.now()}`] = body;
    writeStore('job_docs', store);
    return jsonOk(res, { ok: true });
  }

  if (jobKey) return jsonOk(res, store[jobKey] || {});
  return jsonOk(res, { all: Object.keys(store).map(k => ({ job_key: k, ...(store[k].metadata || {}) })) });
}

// ── /webhook/interview-api mock ───────────────────────────────────────────────
async function handleInterviewApi(req, res) {
  const store = readStore('interview');
  store.sessions = store.sessions || [];
  store.practice = store.practice || {};

  if (req.method === 'POST') {
    const body = await readBody(req);
    const { action } = body;
    if (action === 'save_session') {
      const s = { ...body, id: body.id || `s_${Date.now()}`, savedAt: new Date().toISOString() };
      const idx = store.sessions.findIndex(x => x.id === s.id);
      if (idx >= 0) store.sessions[idx] = s; else store.sessions.push(s);
      writeStore('interview', store);
      return jsonOk(res, { ok: true, session: s });
    }
    if (action === 'delete_session') {
      store.sessions = store.sessions.filter(s => s.id !== body.id);
      writeStore('interview', store);
      return jsonOk(res, { ok: true });
    }
    if (action === 'save_practice') {
      store.practice = { ...store.practice, ...body.data };
      writeStore('interview', store);
      return jsonOk(res, { ok: true });
    }
  }
  return jsonOk(res, { sessions: store.sessions, practice: store.practice });
}

// ── /webhook/interview-data mock (interview_recorder) ────────────────────────
async function handleInterviewData(req, res) {
  const store = readStore('interview_data');
  if (req.method === 'POST') {
    const body = await readBody(req);
    const key = body.key || `d_${Date.now()}`;
    store[key] = body;
    writeStore('interview_data', store);
    return jsonOk(res, { ok: true });
  }
  return jsonOk(res, store);
}

// ── /webhook/leetcode-live mock ───────────────────────────────────────────────
async function handleLeetcodeLive(req, res) {
  if (req.method === 'POST') {
    const body = await readBody(req);
    const store = readStore('leetcode');
    store.submissions = store.submissions || [];
    store.submissions.unshift({ ...body, receivedAt: new Date().toISOString() });
    if (store.submissions.length > 500) store.submissions = store.submissions.slice(0, 500);
    writeStore('leetcode', store);
    return jsonOk(res, { ok: true });
  }
  const store = readStore('leetcode');
  return jsonOk(res, store.submissions || []);
}

// ── /webhook/track-applied mock ───────────────────────────────────────────────
async function handleTrackApplied(req, res) {
  const store = readStore('applications');
  store.applications = store.applications || [];
  if (req.method === 'POST') {
    const body = await readBody(req);
    const app = { ...body, id: body.id || `app_${Date.now()}`, trackedAt: new Date().toISOString() };
    const idx = store.applications.findIndex(a => a.id === app.id);
    if (idx >= 0) store.applications[idx] = app; else store.applications.push(app);
    writeStore('applications', store);
    return jsonOk(res, { ok: true, application: app });
  }
  return jsonOk(res, { applications: store.applications });
}

// ── Nav page redirects — serve the matching local HTML file ──────────────────
const NAV_PAGES = {
  '/webhook/career-hub':              '/career_hub.html',
  '/webhook/dashboard':               '/career_hub.html',
  '/webhook/interview-recorder':      '/interview_recorder.html',
  '/webhook/interview-coach':         'http://localhost:3000',
  '/webhook/interview-coach-api':     'http://localhost:3000',
};

function handleNavRedirect(target, req, res) {
  if (target.startsWith('http')) {
    res.writeHead(302, { 'Location': target, 'Access-Control-Allow-Origin': '*' });
    return res.end();
  }
  // Serve the local HTML file directly
  const filePath = path.join(UI_DIR, target);
  fs.readFile(filePath, (err, data) => {
    if (err) return jsonErr(res, 'Page not found', 404);
    res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  });
}

// ── Main router ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    return res.end();
  }

  const url = req.url.split('?')[0];

  // Mocked endpoints (no n8n needed)
  if (url === '/webhook/profile-store' ||
      url === '/webhook/profile-store-save') return handleProfileStore(req, res);
  if (url === '/webhook/jobs-api')        return handleJobsApi(req, res);
  if (url === '/webhook/batch-results')   return handleBatchResults(req, res);
  if (url === '/webhook/job-docs' ||
      url === '/webhook/job-docs-upload') return handleJobDocs(req, res);
  if (url === '/webhook/interview-api')   return handleInterviewApi(req, res);
  if (url === '/webhook/interview-data')  return handleInterviewData(req, res);
  if (url === '/webhook/leetcode-live')   return handleLeetcodeLive(req, res);
  if (url === '/webhook/track-applied')   return handleTrackApplied(req, res);
  if (url === '/webhook/analyze-jobs')    return jsonOk(res, { ok: true, results: [] });

  // Nav page redirects
  if (NAV_PAGES[url]) return handleNavRedirect(NAV_PAGES[url], req, res);

  // Proxy anything else to n8n (if running)
  if (url.startsWith('/webhook/') || url.startsWith('/api/')) return proxy(req, res);

  // Static UI files
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n Career Hunter — Local Dev Server`);
  console.log(` Career Hub:        http://localhost:${PORT}/career_hub.html`);
  console.log(` Interview Coach:   http://localhost:${PORT}/interview_coach.html`);
  console.log(` Recording Studio:  http://localhost:${PORT}/interview_recorder.html`);
  console.log(` Dashboard:         http://localhost:${PORT}/career_dashboard.html`);
  console.log(``);
  console.log(` Data stored in: ${DATA_DIR}/`);
  console.log(``);
});
