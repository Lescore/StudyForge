import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, TOOLS, MODULE_LOADERS, toolsInCategory, searchTools, toolById } from '../public/js/tools/registry.js';
import { startApp } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('Werkzeugverzeichnis: eindeutige ids, gültige Kategorien, jedes Werkzeug ist umgesetzt', () => {
  const ids = TOOLS.map((tool) => tool.id);
  assert.equal(new Set(ids).size, ids.length, 'ids sind eindeutig');
  const catIds = new Set(CATEGORIES.map((c) => c.id));
  for (const tool of TOOLS) {
    assert.ok(catIds.has(tool.cat), `${tool.id}: Kategorie ${tool.cat}`);
    for (const other of tool.also) assert.ok(catIds.has(other), `${tool.id}: weitere Kategorie ${other}`);
    assert.match(tool.id, /^[a-z0-9-]+$/, 'id passt zur Route #/werkzeuge/<id>');
    if (tool.module === 'legacy') continue;
    assert.ok(MODULE_LOADERS[tool.module], `${tool.id}: Modul ${tool.module} hat einen Lader`);
    const source = read(`public/js/tools/ui/${tool.module}.js`);
    assert.ok(!source.includes('Dieses Werkzeug wird gerade erstellt'), `${tool.module}.js ist kein Platzhalter mehr`);
    assert.ok(source.includes(`'${tool.id}'`) || new RegExp(`\\b${tool.id.replace(/-/g, '')}\\b|\\b${tool.id}\\b`).test(source), `${tool.id} wird in ${tool.module}.js dargestellt`);
  }
  for (const category of CATEGORIES) assert.ok(toolsInCategory(category.id).length > 0, `${category.id} ist nicht leer`);
  for (const css of fs.readdirSync(path.join(root, 'public/css/tools'))) assert.ok(read('public/css/tools.css').includes(`tools/${css}`), `${css} ist eingebunden`);
});

test('Bestehende Werkzeuge bleiben erhalten (Subnetting, Codebeispiele, Formeln)', () => {
  for (const id of ['ipv4-subnetting', 'codebeispiele', 'formelsammlung']) assert.equal(toolById(id).module, 'legacy');
  const view = read('public/js/views/tools.js');
  for (const name of ['networkPanel', 'programmingPanel', 'mathPanel', '/tools/subnet/check', '/subnets', '/snippets', '/formulas']) assert.ok(view.includes(name), name);
  assert.ok(view.includes("netzwerk: 'ipv4-subnetting'"), 'alte Links #/werkzeuge?tab=netzwerk werden weitergeleitet');
});

test('Werkzeugsuche findet über Titel, Stichwörter und ohne Umlaute', () => {
  assert.ok(searchTools('MiB').some((t) => t.id === 'datenmengen'));
  assert.ok(searchTools('chmod').some((t) => t.id === 'dateirechte'));
  assert.ok(searchTools('uebertragungszeit').some((t) => t.id === 'uebertragungszeit'));
  assert.ok(searchTools('ubertragungszeit').some((t) => t.id === 'uebertragungszeit'));
  assert.ok(searchTools('Übertragungszeit').some((t) => t.id === 'uebertragungszeit'));
  assert.ok(searchTools('zweierkomplement').some((t) => t.id === 'binaerarithmetik'));
  assert.equal(searchTools('').length, 0);
});

test('Favoriten und eigene Port-Einträge werden nur als gültige JSON-Liste gespeichert', async (t) => {
  const app = await startApp(t);
  await app.expect('PUT', '/api/settings', { tools_favorites: JSON.stringify(['raid', 'ipv6']) });
  assert.equal((await app.expect('GET', '/api/settings')).json.tools_favorites, '["raid","ipv6"]');
  assert.equal((await app.put('/api/settings', { tools_favorites: '{kaputt' })).status, 400);
  assert.equal((await app.put('/api/settings', { tools_favorites: '{"a":1}' })).status, 400);
  assert.equal((await app.put('/api/settings', { tools_custom_ports: JSON.stringify(['x'.repeat(40000)]) })).status, 400);
  await app.expect('PUT', '/api/settings', { tools_custom_ports: JSON.stringify([{ port: 8443, protocol: 'tcp', name: 'Test' }]) });
  // Zurücksetzen der Einstellungen entfernt sie wieder
  await app.expect('POST', '/api/reset', { scope: 'settings' });
  assert.equal((await app.expect('GET', '/api/settings')).json.tools_favorites, undefined);
});

test('Werkzeug-Oberflächen sind ausgeliefert und enthalten keine externen Adressen', async (t) => {
  const app = await startApp(t);
  for (const file of ['/js/tools/registry.js', '/js/tools/kit.js', '/css/tools.css', ...Object.keys(MODULE_LOADERS).map((m) => `/js/tools/ui/${m}.js`)]) {
    const res = await app.get(file);
    assert.equal(res.status, 200, file);
    assert.ok(!/https?:\/\/(?!127\.0\.0\.1|localhost)/.test(res.text()), `${file} enthält keine externen URLs`);
  }
  const html = (await app.expect('GET', '/')).text();
  assert.ok(html.includes('/css/tools.css'));
});
