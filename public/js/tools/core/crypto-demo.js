/**
 * Demonstrationen zu Kryptografie-Grundlagen mit der Web Crypto API:
 * AES-GCM, ECDSA-Signaturen, Lawineneffekt – plus die (unsichere) Caesar-Chiffre.
 *
 * Schlüssel existieren nur im Speicher. Reine Logik ohne DOM;
 * `subtle` wird übergeben (Browser: crypto.subtle, Node: crypto.webcrypto.subtle).
 */
import { InputError } from './num.js';
import { toHex } from './crypto-hash.js';

export const COMPARISON = [
  {
    kind: 'Hashfunktion',
    purpose: 'Fingerabdruck fester Länge, Integritätsprüfung',
    keys: 'kein Schlüssel',
    reversible: 'nein (Einwegfunktion)',
    examples: 'SHA-256, SHA-3; (veraltet: MD5, SHA-1)'
  },
  {
    kind: 'Symmetrische Verschlüsselung',
    purpose: 'Vertraulichkeit großer Datenmengen',
    keys: 'ein gemeinsamer geheimer Schlüssel',
    reversible: 'ja, mit demselben Schlüssel',
    examples: 'AES-GCM, ChaCha20-Poly1305'
  },
  {
    kind: 'Asymmetrische Verfahren',
    purpose: 'Schlüsselaustausch, Verschlüsselung kleiner Daten',
    keys: 'Schlüsselpaar: öffentlich + privat',
    reversible: 'ja, nur mit dem privaten Schlüssel',
    examples: 'RSA-OAEP, ECDH / X25519 (Schlüsselaustausch)'
  },
  {
    kind: 'Digitale Signatur',
    purpose: 'Echtheit und Unverfälschtheit, Nichtabstreitbarkeit',
    keys: 'privat signieren, öffentlich prüfen',
    reversible: 'nicht anwendbar (Prüfung: gültig/ungültig)',
    examples: 'Ed25519, ECDSA, RSA-PSS'
  }
];

const enc = new TextEncoder();
const dec = new TextDecoder();

export function requireSubtle(subtle) {
  if (!subtle) throw new InputError('Die Web Crypto API (crypto.subtle) ist hier nicht verfügbar – sie benötigt einen sicheren Kontext (HTTPS oder localhost/127.0.0.1).');
  return subtle;
}

/** Base64 aus Bytes (ohne btoa, damit es überall gleich funktioniert). */
export function toBase64(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63];
    out += i + 1 < bytes.length ? abc[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? abc[n & 63] : '=';
  }
  return out;
}

/* ------------------------------------------------------------ AES-GCM */

export async function aesGenerateKey(subtle) {
  return requireSubtle(subtle).generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function aesEncrypt(subtle, key, text, iv) {
  requireSubtle(subtle);
  const nonce = iv ?? globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, enc.encode(text)));
  return { iv: nonce, ciphertext: ct };
}

/** Entschlüsselt; bei falschem Schlüssel oder veränderten Daten schlägt die Tag-Prüfung fehl. */
export async function aesDecrypt(subtle, key, iv, ciphertext) {
  requireSubtle(subtle);
  try {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return { ok: true, text: dec.decode(pt) };
  } catch {
    return { ok: false, text: '' };
  }
}

export async function exportRawKeyHex(subtle, key) {
  return toHex(await requireSubtle(subtle).exportKey('raw', key));
}

/* ------------------------------------------------------------ ECDSA */

export async function ecdsaGenerateKeys(subtle) {
  return requireSubtle(subtle).generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
}

export async function ecdsaSign(subtle, privateKey, text) {
  return new Uint8Array(await requireSubtle(subtle).sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(text)));
}

export async function ecdsaVerify(subtle, publicKey, signature, text) {
  return requireSubtle(subtle).verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, enc.encode(text));
}

export async function exportPublicKeyHex(subtle, key) {
  return toHex(await requireSubtle(subtle).exportKey('raw', key));
}

/* ------------------------------------------------------------ Lawineneffekt */

/** Anzahl unterschiedlicher Bits zweier gleich langer Hex-Strings. */
export function bitDifference(hexA, hexB) {
  if (hexA.length !== hexB.length) throw new InputError('Die Hashwerte müssen gleich lang sein.');
  let diff = 0;
  const positions = [];
  for (let i = 0; i < hexA.length; i += 1) {
    let x = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    if (x) positions.push(i);
    while (x) {
      diff += x & 1;
      x >>= 1;
    }
  }
  const total = hexA.length * 4;
  return { diff, total, percent: (diff / total) * 100, positions };
}

/* ------------------------------------------------------------ Caesar (unsicher) */

/** Caesar-Verschiebung nur für A–Z/a–z; alles andere bleibt unverändert. */
export function caesar(text, shift) {
  const s = Number(shift);
  if (!Number.isInteger(s) || s < -25 || s > 25) throw new InputError('Verschiebung: ganze Zahl von −25 bis 25.');
  const k = ((s % 26) + 26) % 26;
  return String(text ?? '').replace(/[A-Za-z]/g, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + k) % 26) + base);
  });
}

/** Alle 25 Verschiebungen – zeigt, warum Caesar trivial zu brechen ist. */
export function caesarBruteForce(ciphertext) {
  const out = [];
  for (let k = 1; k <= 25; k += 1) out.push({ shift: k, text: caesar(ciphertext, -k) });
  return out;
}
