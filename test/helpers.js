import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/server.js';

/**
 * Startet eine echte StudyForge-Instanz in einem temporären Datenverzeichnis.
 * So testen wir denselben HTTP-Weg, den auch die Oberfläche nutzt.
 */
export async function startApp(t, { dataDir } = {}) {
  const dir = dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'studyforge-test-'));
  const instance = createApp({ dataDir: dir });
  const { port } = await instance.listen(0);
  const base = `http://127.0.0.1:${port}`;

  const request = async (method, pathname, body, { headers = {}, raw = false } = {}) => {
    const init = { method, headers: { ...headers } };
    if (body !== undefined && body !== null) {
      if (Buffer.isBuffer(body)) {
        init.body = body;
        init.headers['Content-Type'] ??= 'application/octet-stream';
      } else if (typeof body === 'string') {
        init.body = body;
        init.headers['Content-Type'] ??= 'text/plain; charset=utf-8';
      } else {
        init.body = JSON.stringify(body);
        init.headers['Content-Type'] = 'application/json; charset=utf-8';
      }
    }
    const res = await fetch(base + pathname, init);
    const buffer = Buffer.from(await res.arrayBuffer());
    let json = null;
    if (!raw) {
      try {
        json = buffer.length ? JSON.parse(buffer.toString('utf8')) : null;
      } catch {
        json = null;
      }
    }
    return { status: res.status, headers: res.headers, buffer, json, text: () => buffer.toString('utf8') };
  };

  const client = {
    base,
    dataDir: dir,
    instance,
    get: (p, opts) => request('GET', p, undefined, opts),
    post: (p, body, opts) => request('POST', p, body, opts),
    patch: (p, body, opts) => request('PATCH', p, body, opts),
    put: (p, body, opts) => request('PUT', p, body, opts),
    del: (p, opts) => request('DELETE', p, undefined, opts),
    /** Erwartet 2xx und gibt JSON zurück, sonst aussagekräftiger Fehler. */
    async expect(method, p, body, opts) {
      const res = await request(method, p, body, opts);
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`${method} ${p} -> ${res.status}: ${res.text()}`);
      }
      return res;
    }
  };

  t.after(async () => {
    await instance.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  return client;
}

/** Legt ein Fach an und gibt es zurück. */
export async function makeSubject(app, name = 'Netzwerktechnik') {
  const res = await app.expect('POST', '/api/subjects', { name, description: 'Testfach' });
  return res.json;
}

/** Legt einen Stapel an. */
export async function makeDeck(app, name = 'Subnetting', subjectId = null) {
  const res = await app.expect('POST', '/api/decks', { name, subject_id: subjectId });
  return res.json;
}

/** Legt eine Notiz an. */
export async function makeNote(app, fields = {}) {
  const res = await app.expect('POST', '/api/notes', { title: 'Notiz', content: 'Inhalt', ...fields });
  return res.json;
}

/** Legt eine einfache Frage-Antwort-Karte an. */
export async function makeCard(app, fields = {}) {
  const res = await app.expect('POST', '/api/cards', {
    type: 'qa',
    front: 'Was ist DNS?',
    back: 'Domain Name System',
    ...fields
  });
  return res.json;
}

/** Formatiert eine Notiz als Markdown für Prüfungen. */
export function noteMarkdown(note) {
  return `# ${note.title}\n\n${note.content}\n`;
}

export { path as nodePath };
