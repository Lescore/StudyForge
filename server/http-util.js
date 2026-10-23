import { HttpError } from './util.js';

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const keys = [];
    const source = pattern
      .split('/')
      .map((part) => {
        if (part.startsWith(':')) {
          keys.push(part.slice(1));
          return '([^/]+)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    this.routes.push({ method, regex: new RegExp(`^${source}/?$`), keys, handler, pattern });
    return this;
  }

  find(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = route.regex.exec(pathname);
      if (!match) continue;
      const params = {};
      route.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(match[i + 1]);
      });
      return { handler: route.handler, params };
    }
    return null;
  }
}

export function sendBuffer(res, status, buffer, headers = {}) {
  if (res.writableEnded) return;
  res.writeHead(status, {
    'Content-Length': buffer.length,
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(buffer);
}

export function sendJson(res, status, value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  sendBuffer(res, status, body, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
}

export function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limitBytes) {
        done = true;
        req.destroy();
        reject(new HttpError(413, `Die Datei ist zu groß (max. ${Math.round(limitBytes / 1024 / 1024)} MB).`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!done) resolve(Buffer.concat(chunks));
    });
    req.on('error', (err) => {
      if (!done) reject(err);
    });
  });
}

export function makeContext({ req, res, url, db, dirs, dataDir, params, serverInfo }) {
  let cachedBody = null;
  const ctx = {
    req,
    res,
    url,
    db,
    dirs,
    dataDir,
    params,
    serverInfo,
    query: url.searchParams,
    send: (status, body, headers) => sendBuffer(res, status, body, headers),
    json: (status, value) => sendJson(res, status, value),
    fail: (status, message) => {
      throw new HttpError(status, message);
    },
    body: async (limit = 20 * 1024 * 1024) => {
      if (cachedBody) return cachedBody;
      cachedBody = await readBody(req, limit);
      return cachedBody;
    },
    jsonBody: async (limit = 10 * 1024 * 1024) => {
      const raw = await ctx.body(limit);
      if (!raw.length) throw new HttpError(400, 'Der Anfrageinhalt fehlt.');
      try {
        return JSON.parse(raw.toString('utf8'));
      } catch {
        throw new HttpError(400, 'Der Anfrageinhalt ist kein gültiges JSON.');
      }
    }
  };
  return ctx;
}
