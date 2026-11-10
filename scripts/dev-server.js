const http = require('http');
const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '..', '.env.local'));

const start = require('../api/game/start');
const pick = require('../api/game/pick');
const remove = require('../api/game/remove');
const reveal = require('../api/game/reveal');
const authConfig = require('../api/auth/config');
const authMe = require('../api/auth/me');
const authMiniapp = require('../api/auth/miniapp');
const authStart = require('../api/auth/start');
const authCallback = require('../api/auth/callback');
const walletSpend = require('../api/wallet/spend');
const leaderboard = require('../api/leaderboard');
const spin = require('../api/game/spin');

const routes = {
  '/api/game/start': start,
  '/api/game/pick': pick,
  '/api/game/remove': remove,
  '/api/game/reveal': reveal,
  '/api/auth/config': authConfig,
  '/api/auth/me': authMe,
  '/api/auth/miniapp': authMiniapp,
  '/api/auth/start': authStart,
  '/api/auth/callback': authCallback,
  '/api/wallet/spend': walletSpend,
  '/api/leaderboard': leaderboard,
  '/api/game/spin': spin,
};

const root = path.join(__dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const handler = routes[url.pathname];
  if (handler) return serveApi(req, res, handler);
  const filePath = path.normalize(path.join(root, url.pathname === '/' ? '/index.html' : url.pathname));
  if (!filePath.startsWith(root)) {
    res.statusCode = 403;
    res.end('forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('Content-Type', types[path.extname(filePath)] || 'application/octet-stream');
    res.end(data);
  });
});

server.listen(process.env.PORT || 3000, '127.0.0.1');

function serveApi(req, res, handler) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    req.body = raw ? JSON.parse(raw) : {};
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    };
    Promise.resolve(handler(req, res)).catch(() => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'server' }));
      }
    });
  });
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
