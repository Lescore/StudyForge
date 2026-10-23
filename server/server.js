import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_NAME, APP_VERSION, PUBLIC_DIR, ensureDataDirs, resolveDataDir } from './config.js';
import { openDatabase, tableCounts } from './db.js';
import { Router, makeContext } from './http-util.js';
import { HttpError } from './util.js';
import { registerCoreRoutes } from './api.js';
import { registerLearnRoutes } from './api-learn.js';
import { registerOrganizeRoutes } from './api-organize.js';
import { registerFileRoutes } from './api-files.js';
import { registerTransferRoutes } from './api-transfer.js';
import { registerCalendarRoutes } from './api-calendar.js';
import { registerToolRoutes } from './api-tools.js';
import { reindexMissingText } from './file-text.js';
import { tokenMatches } from './instance.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'"
  ].join('; ')
};

function isLoopbackHostname(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]';
}

function serveStatic(req, res, url, isHead = false) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Ungültige Adresse.');
    return true;
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  if (pathname.includes('\0')) return false;
  const relative = pathname.replace(/^\/+/, '');
  const target = path.resolve(PUBLIC_DIR, relative);
  const root = path.resolve(PUBLIC_DIR);
  if (target !== root && !target.startsWith(root + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Zugriff verweigert.');
    return true;
  }
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const ext = path.extname(target).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const cache = ext === '.woff' || ext === '.woff2' ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': cache
  });
  if (isHead) {
    res.end();
    return true;
  }
  fs.createReadStream(target).pipe(res);
  return true;
}

/**
 * Startet die Anwendung. Gibt ein Objekt mit Server, DB und Hilfsfunktionen zurück
 * (wird auch von den Tests genutzt).
 */
export function createApp({ dataDir = resolveDataDir(), host = '127.0.0.1', shutdownToken = null, onShutdown = null } = {}) {
  const dirs = ensureDataDirs(dataDir);
  const db = openDatabase(dataDir);
  const router = new Router();
  const context = {
    db,
    dirs,
    dataDir,
    counts: () => tableCounts(db)
  };
  registerCoreRoutes(router, context);
  registerLearnRoutes(router, context);
  registerOrganizeRoutes(router);
  registerFileRoutes(router);
  registerCalendarRoutes(router);
  registerToolRoutes(router);
  registerTransferRoutes(router, context);

  // Sauberes Beenden durch stop.sh/stop.cmd. Nur aktiv, wenn der Starthelfer
  // einen Schlüssel vergeben hat; ohne passenden Schlüssel wird abgelehnt.
  if (shutdownToken && onShutdown) {
    router.add('POST', '/api/shutdown', (ctx) => {
      if (!tokenMatches(shutdownToken, ctx.req.headers['x-studyforge-token'])) {
        throw new HttpError(403, 'Ungültiger Schlüssel zum Beenden.');
      }
      ctx.json(200, { ok: true, pid: process.pid });
      setImmediate(() => onShutdown());
    });
  }

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Ungültige Anfrage.');
      return;
    }

    // DNS-Rebinding-Schutz: nur Loopback-Hostnamen akzeptieren.
    const hostname = (req.headers.host || '').replace(/:\d+$/, '');
    if (!isLoopbackHostname(hostname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('StudyForge ist nur über Loopback erreichbar.');
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        // CSRF-Schutz: schreibende Anfragen mit fremdem Origin ablehnen.
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const origin = req.headers.origin;
          if (origin) {
            let originUrl;
            try {
              originUrl = new URL(origin);
            } catch {
              throw new HttpError(403, 'Ungültiger Origin.');
            }
            if (!isLoopbackHostname(originUrl.hostname)) {
              throw new HttpError(403, 'Schreibende Anfragen sind nur von der lokalen Oberfläche erlaubt.');
            }
          }
        }
        // HEAD wird wie GET behandelt; Node verwirft den Antwortinhalt selbst.
        const match = router.find(req.method === 'HEAD' ? 'GET' : req.method, url.pathname);
        if (!match) throw new HttpError(404, `Unbekannter API-Endpunkt: ${req.method} ${url.pathname}`);
        const ctx = makeContext({ req, res, url, db, dirs, dataDir, params: match.params, serverInfo: { port: server.address()?.port ?? null } });
        await match.handler(ctx);
      } catch (err) {
        if (!(err instanceof HttpError)) {
          console.error(`[StudyForge] Fehler bei ${req.method} ${url.pathname}:`, err);
        }
        if (res.headersSent) {
          res.end();
          return;
        }
        const status = err instanceof HttpError ? err.status : 500;
        const message = err instanceof HttpError ? err.message : 'Interner Fehler. Details stehen im Terminal.';
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ error: message, details: err instanceof HttpError ? err.details ?? null : null }));
      } finally {
        void started;
      }
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
      res.end('Methode nicht erlaubt.');
      return;
    }
    if (serveStatic(req, res, url, req.method === 'HEAD')) return;
    // Unbekannte Pfade: SPA-Fallback nur für Navigationen.
    if (req.headers.accept?.includes('text/html')) {
      const index = path.join(PUBLIC_DIR, 'index.html');
      const body = fs.readFileSync(index);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Nicht gefunden.');
  });

  server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  return {
    app: { db, dirs, router, host },
    server,
    db,
    dirs,
    dataDir,
    async listen(port = 0) {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve();
        });
      });
      const address = server.address();
      return { port: typeof address === 'object' && address ? address.port : port, host };
    },
    async close() {
      await new Promise((resolve) => server.close(() => resolve()));
      try {
        db.close();
      } catch {
        /* bereits geschlossen */
      }
    }
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argPort = process.argv.find((arg, i, arr) => arr[i - 1] === '--port');
  const argHost = process.argv.find((arg, i, arr) => arr[i - 1] === '--host');
  const argData = process.argv.find((arg, i, arr) => arr[i - 1] === '--data-dir');
  const port = Number(argPort || process.env.PORT || 4173);
  const host = argHost || process.env.HOST || '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost') {
    console.warn('Warnung: StudyForge sollte nur über Loopback betrieben werden. Netzwerkzugriff ist nicht vorgesehen.');
  }
  const instance = createApp({ dataDir: resolveDataDir(argData), host });
  let lastError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const info = await instance.listen(port + attempt);
      console.log('');
      console.log(`  ${APP_NAME} ${APP_VERSION} läuft.`);
      console.log(`  Oberfläche:      http://localhost:${info.port}`);
      console.log(`  Datenverzeichnis: ${instance.dataDir}`);
      console.log(`  Beenden mit Strg+C.`);
      console.log('');
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (err.code !== 'EADDRINUSE') break;
    }
  }
  if (lastError) {
    console.error('Start fehlgeschlagen:', lastError.message);
    process.exitCode = 1;
  } else {
    // Ältere Backups/Installationen: PDFs ohne Textebene im Index nachziehen.
    try {
      const indexed = reindexMissingText(instance.db, instance.dirs, { limit: 50 });
      if (indexed.attempted) {
        console.log(`  Textindizierung: ${indexed.indexed} von ${indexed.attempted} Dokument(en) ergänzt.`);
        console.log('');
      }
    } catch (err) {
      console.warn('Hinweis: Textindizierung konnte nicht abgeschlossen werden:', err.message);
    }
    const shutdown = async () => {
      console.log('\nStudyForge wird beendet. Daten sind gespeichert.');
      await instance.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}
