#!/usr/bin/env node
/**
 * Prüft, ob die Oberfläche vollständig ohne Netzwerk auskommt:
 * - keine externen Skripte, Styles, Fonts, Bilder oder iframes
 * - keine externen URLs in CSS/JS/HTML
 * - keine CDN-Verweise
 *
 * Erlaubt sind lediglich Namensraum-URLs (z. B. SVG-xmlns) und
 * Dokumentationslinks in Kommentaren; beides löst keinen Abruf aus.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

const NETWORK_ATTR = /\b(?:src|href|action|poster|data-src)\s*=\s*["']([^"']+)["']/gi;
const CSS_URL = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
const JS_FETCH = /\b(?:fetch|import)\s*\(\s*['"]([^'"]+)['"]/gi;
const ABSOLUTE = /^(?:https?:)?\/\//i;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(?:html?|css|js|mjs|svg)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

const problems = [];
const checked = [];
for (const file of walk(publicDir)) {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, 'utf8');
  checked.push(rel);
  for (const [regex, kind] of [
    [NETWORK_ATTR, 'Attribut'],
    [CSS_URL, 'CSS-URL'],
    [JS_FETCH, 'JS-Abruf']
  ]) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const value = match[1].trim();
      if (!ABSOLUTE.test(value)) continue;
      problems.push(`${rel}:${lineOf(text, match.index)} ${kind} verweist nach außen: ${value}`);
    }
  }
  // xmlns ist ein Namensraum, keine Netzwerkverbindung.
  const stripped = text.replace(/xmlns(?:=[^\s>]+)?/g, '');
  const external = stripped.match(/https?:\/\/[^\s"'<>)]+/gi) ?? [];
  for (const url of external) {
    if (/w3\.org|example\.com|localhost|127\.0\.0\.1/i.test(url)) continue;
    const index = text.indexOf(url);
    problems.push(`${rel}:${lineOf(text, index)} externe URL: ${url}`);
  }
}

const katex = path.join(publicDir, 'vendor', 'katex', 'katex.min.css');
const katexFonts = path.join(publicDir, 'vendor', 'katex', 'fonts');
const katexJs = path.join(publicDir, 'vendor', 'katex', 'katex.min.js');

console.log(`StudyForge Offline-Prüfung`);
console.log(`Geprüfte Dateien: ${checked.length}`);
console.log(`KaTeX lokal: ${fs.existsSync(katex) && fs.existsSync(katexJs) ? 'ja' : 'nein'}`);
console.log(`KaTeX-Schriften lokal: ${fs.existsSync(katexFonts) ? fs.readdirSync(katexFonts).length : 0}`);

if (!fs.existsSync(katex) || !fs.existsSync(katexJs)) {
  problems.push('KaTeX wird nicht lokal aus public/vendor/katex geladen.');
}

if (problems.length) {
  console.error(`\n${problems.length} Problem(e) gefunden:`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log('\nOK: Keine externen Ressourcen gefunden. Die Oberfläche läuft vollständig lokal.');
}
