/**
 * Datenstrukturen für den Visualisierer: Stack, Queue, einfach verkettete Liste,
 * binärer Suchbaum und Hash-Tabelle (Verkettung oder lineares Sondieren).
 *
 * Jede Operation liefert { ok, message, … } statt zu werfen, damit die Oberfläche
 * Fehlerfälle (pop auf leerem Stack …) als Protokolleintrag zeigen kann.
 * Ungültige Eingaben (keine Zahl, zu lang) werfen dagegen InputError.
 * Reine Logik ohne DOM.
 */
import { InputError } from './num.js';

export const LIMITS = { linear: 20, bst: 31, minValue: -999, maxValue: 999, maxKeyLength: 12, maxBuckets: 31, minBuckets: 1 };

/** Ganzzahl −999 … 999 */
export function parseValue(text, label = 'Wert') {
  const raw = String(text ?? '').trim().replace('−', '-');
  if (!/^[+-]?\d+$/.test(raw)) throw new InputError(`${label}: „${String(text ?? '').trim() || 'leer'}“ ist keine ganze Zahl.`);
  const n = Number(raw);
  if (n < LIMITS.minValue || n > LIMITS.maxValue) throw new InputError(`${label}: Erlaubt sind ${LIMITS.minValue} bis ${LIMITS.maxValue}.`);
  return n;
}

export function parseIndex(text, max) {
  const raw = String(text ?? '').trim();
  if (!/^\d+$/.test(raw)) throw new InputError(`Index: „${raw || 'leer'}“ ist keine ganze Zahl ≥ 0.`);
  const n = Number(raw);
  if (n > max) throw new InputError(`Index: Erlaubt sind 0 bis ${max}.`);
  return n;
}

const ok = (message, extra = {}) => ({ ok: true, message, ...extra });
const fail = (message, extra = {}) => ({ ok: false, message, ...extra });

/* ----------------------------------------------------------------- Stack */
export class Stack {
  constructor(items = []) {
    this.items = [...items];
  }
  push(v) {
    if (this.items.length >= LIMITS.linear) return fail(`Stack voll (Grenze dieses Simulators: ${LIMITS.linear} Elemente).`);
    this.items.push(v);
    return ok(`push(${v}): ${v} liegt jetzt oben.`, { highlight: this.items.length - 1 });
  }
  pop() {
    if (!this.items.length) return fail('pop() auf leerem Stack – Stack-Unterlauf (underflow).');
    const v = this.items.pop();
    return ok(`pop() → ${v}`, { value: v });
  }
  peek() {
    if (!this.items.length) return fail('peek() auf leerem Stack – kein oberstes Element.');
    const v = this.items[this.items.length - 1];
    return ok(`peek() → ${v} (bleibt auf dem Stack)`, { value: v, highlight: this.items.length - 1 });
  }
}

/* ----------------------------------------------------------------- Queue */
export class Queue {
  constructor(items = []) {
    this.items = [...items];
  }
  enqueue(v) {
    if (this.items.length >= LIMITS.linear) return fail(`Queue voll (Grenze dieses Simulators: ${LIMITS.linear} Elemente).`);
    this.items.push(v);
    return ok(`enqueue(${v}): ${v} hinten angefügt.`, { highlight: this.items.length - 1 });
  }
  dequeue() {
    if (!this.items.length) return fail('dequeue() auf leerer Queue – nichts zu entnehmen.');
    const v = this.items.shift();
    return ok(`dequeue() → ${v}`, { value: v });
  }
  peek() {
    if (!this.items.length) return fail('peek() auf leerer Queue – kein vorderes Element.');
    return ok(`peek() → ${this.items[0]} (bleibt in der Queue)`, { value: this.items[0], highlight: 0 });
  }
}

/* --------------------------------------------------- Verkettete Liste */
export class LinkedList {
  constructor(items = []) {
    this.items = [...items]; // Darstellung: Werte von head bis tail
  }
  get size() {
    return this.items.length;
  }
  insertAt(index, v) {
    if (this.items.length >= LIMITS.linear) return fail(`Liste voll (Grenze dieses Simulators: ${LIMITS.linear} Elemente).`);
    if (index < 0 || index > this.items.length) return fail(`Index ${index} ungültig – erlaubt sind 0 bis ${this.items.length}.`);
    this.items.splice(index, 0, v);
    const where = index === 0 ? 'am Anfang (neuer head)' : index === this.items.length - 1 ? 'am Ende (neuer tail)' : `an Index ${index}`;
    const cost = index === 0 ? 'O(1)' : `O(n): ${index} Knoten bis zum Vorgänger durchlaufen`;
    return ok(`${v} ${where} eingefügt – ${cost}.`, { highlight: index });
  }
  insertHead(v) {
    return this.insertAt(0, v);
  }
  insertTail(v) {
    const r = this.insertAt(this.items.length, v);
    if (r.ok) r.message = `${v} am Ende eingefügt – ohne tail-Zeiger O(n), mit tail-Zeiger O(1).`;
    return r;
  }
  deleteAt(index) {
    if (!this.items.length) return fail('Löschen in leerer Liste nicht möglich.');
    if (index < 0 || index >= this.items.length) return fail(`Index ${index} ungültig – erlaubt sind 0 bis ${this.items.length - 1}.`);
    const [v] = this.items.splice(index, 1);
    return ok(`Index ${index} (Wert ${v}) gelöscht – der Vorgänger zeigt jetzt auf den Nachfolger.`, { value: v });
  }
  deleteValue(v) {
    const index = this.items.indexOf(v);
    if (index < 0) return fail(`Wert ${v} nicht gefunden – nichts gelöscht.`, { path: this.items.map((_, i) => i) });
    this.items.splice(index, 1);
    return ok(`Erstes Vorkommen von ${v} (Index ${index}) gelöscht.`, { value: v });
  }
  search(v) {
    const path = [];
    for (let i = 0; i < this.items.length; i += 1) {
      path.push(i);
      if (this.items[i] === v) return ok(`${v} gefunden an Index ${i} nach ${i + 1} Vergleich${i ? 'en' : ''}.`, { path, highlight: i });
    }
    return fail(`${v} nicht gefunden (${path.length} Vergleiche).`, { path });
  }
}

/* --------------------------------------------------- Binärer Suchbaum */
const node = (key) => ({ key, left: null, right: null });

export class BST {
  constructor(keys = []) {
    this.root = null;
    this.count = 0;
    for (const k of keys) this.insert(k);
  }
  insert(key) {
    if (this.count >= LIMITS.bst) return fail(`Baum voll (Grenze dieses Simulators: ${LIMITS.bst} Knoten).`);
    const path = [];
    if (!this.root) {
      this.root = node(key);
      this.count += 1;
      return ok(`${key} als Wurzel eingefügt.`, { path: [key], highlight: key });
    }
    let cur = this.root;
    for (;;) {
      path.push(cur.key);
      if (key === cur.key) return fail(`${key} ist schon vorhanden – Duplikate werden in diesem Baum nicht eingefügt.`, { path, highlight: key });
      const dir = key < cur.key ? 'left' : 'right';
      if (!cur[dir]) {
        cur[dir] = node(key);
        this.count += 1;
        return ok(`${key} als ${dir === 'left' ? 'linkes' : 'rechtes'} Kind von ${cur.key} eingefügt (Pfad: ${path.join(' → ')}).`, { path: [...path, key], highlight: key });
      }
      cur = cur[dir];
    }
  }
  search(key) {
    const path = [];
    let cur = this.root;
    while (cur) {
      path.push(cur.key);
      if (key === cur.key) return ok(`${key} gefunden – Pfad: ${path.join(' → ')} (${path.length} Vergleich${path.length === 1 ? '' : 'e'}).`, { path, highlight: key });
      cur = key < cur.key ? cur.left : cur.right;
    }
    return fail(`${key} nicht gefunden – Pfad: ${path.length ? path.join(' → ') : '(leerer Baum)'}.`, { path });
  }
  delete(key) {
    let parent = null;
    let cur = this.root;
    const path = [];
    while (cur && cur.key !== key) {
      path.push(cur.key);
      parent = cur;
      cur = key < cur.key ? cur.left : cur.right;
    }
    if (!cur) return fail(`${key} nicht gefunden – nichts gelöscht.`, { path });
    path.push(cur.key);
    let message;
    if (cur.left && cur.right) {
      // Zwei Kinder: In-Order-Nachfolger (kleinster Schlüssel im rechten Teilbaum)
      let succParent = cur;
      let succ = cur.right;
      while (succ.left) {
        succParent = succ;
        succ = succ.left;
      }
      message = `${key} hat zwei Kinder: ersetzt durch den In-Order-Nachfolger ${succ.key} (kleinster Wert im rechten Teilbaum); ${succ.key} wird an seiner alten Stelle entfernt.`;
      cur.key = succ.key;
      if (succParent === cur) succParent.right = succ.right;
      else succParent.left = succ.right;
    } else {
      const child = cur.left ?? cur.right;
      message = child ? `${key} hat ein Kind: ${child.key} rückt an seine Stelle.` : `${key} ist ein Blatt und wird einfach entfernt.`;
      if (!parent) this.root = child;
      else if (parent.left === cur) parent.left = child;
      else parent.right = child;
    }
    this.count -= 1;
    return ok(message, { path });
  }
  /** Höhe in Kanten: leerer Baum −1, nur Wurzel 0. */
  height(n = this.root) {
    return n ? 1 + Math.max(this.height(n.left), this.height(n.right)) : -1;
  }
  inorder() {
    const out = [];
    const walk = (n) => {
      if (!n) return;
      walk(n.left);
      out.push(n.key);
      walk(n.right);
    };
    walk(this.root);
    return out;
  }
  preorder() {
    const out = [];
    const walk = (n) => {
      if (!n) return;
      out.push(n.key);
      walk(n.left);
      walk(n.right);
    };
    walk(this.root);
    return out;
  }
  postorder() {
    const out = [];
    const walk = (n) => {
      if (!n) return;
      walk(n.left);
      walk(n.right);
      out.push(n.key);
    };
    walk(this.root);
    return out;
  }
  levelorder() {
    const out = [];
    const queue = this.root ? [this.root] : [];
    while (queue.length) {
      const n = queue.shift();
      out.push(n.key);
      if (n.left) queue.push(n.left);
      if (n.right) queue.push(n.right);
    }
    return out;
  }
  /** Knotenpositionen für die Zeichnung: x = In-Order-Rang, y = Tiefe. */
  layout() {
    const nodes = [];
    const edges = [];
    let rank = 0;
    const walk = (n, depth, parentKey) => {
      if (!n) return;
      walk(n.left, depth + 1, n.key);
      nodes.push({ key: n.key, x: rank, y: depth });
      rank += 1;
      if (parentKey !== null) edges.push([parentKey, n.key]);
      walk(n.right, depth + 1, n.key);
    };
    walk(this.root, 0, null);
    return { nodes, edges };
  }
}

/* --------------------------------------------------------- Hash-Tabelle */
export const TOMBSTONE = Symbol('gelöscht');

/** Hashfunktion: Zahl → k mod m (immer ≥ 0); Text → (Summe der Zeichencodes) mod m. */
export function hashKey(key, m) {
  if (typeof key === 'number') return { hash: ((key % m) + m) % m, explain: `${key} mod ${m} = ${((key % m) + m) % m}` };
  const codes = [...key].map((ch) => ch.codePointAt(0));
  const sum = codes.reduce((s, c) => s + c, 0);
  return { hash: sum % m, explain: `Summe der Zeichencodes ${codes.join(' + ')} = ${sum}; ${sum} mod ${m} = ${sum % m}` };
}

export function parseKey(text, keyType) {
  if (keyType === 'number') return parseValue(text, 'Schlüssel');
  const raw = String(text ?? '').trim();
  if (!raw) throw new InputError('Schlüssel: Bitte einen Text eingeben.');
  if ([...raw].length > LIMITS.maxKeyLength) throw new InputError(`Schlüssel: höchstens ${LIMITS.maxKeyLength} Zeichen.`);
  return raw;
}

export class HashTable {
  constructor(m = 7, { strategy = 'chaining' } = {}) {
    if (!Number.isInteger(m) || m < LIMITS.minBuckets || m > LIMITS.maxBuckets) throw new InputError(`Tabellengröße m: Erlaubt sind ${LIMITS.minBuckets} bis ${LIMITS.maxBuckets}.`);
    if (!['chaining', 'probing'].includes(strategy)) throw new InputError('Unbekannte Kollisionsbehandlung.');
    this.m = m;
    this.strategy = strategy;
    this.count = 0;
    this.buckets = strategy === 'chaining' ? Array.from({ length: m }, () => []) : Array(m).fill(null);
  }
  get loadFactor() {
    return this.count / this.m;
  }
  insert(key) {
    const { hash, explain } = hashKey(key, this.m);
    if (this.strategy === 'chaining') {
      const chain = this.buckets[hash];
      if (chain.includes(key)) return fail(`${fmtKey(key)} ist bereits vorhanden (Bucket ${hash}).`, { probes: [hash], explain });
      if (this.count >= 4 * this.m || this.count >= 60) return fail('Simulator-Grenze erreicht (höchstens 4·m bzw. 60 Einträge).');
      chain.push(key);
      this.count += 1;
      const collision = chain.length > 1;
      return ok(`${fmtKey(key)} → h = ${hash}${collision ? ` (Kollision: an die Kette in Bucket ${hash} angehängt)` : ''}.`, { probes: [hash], explain, highlight: hash });
    }
    const probes = [];
    let firstFree = -1;
    for (let i = 0; i < this.m; i += 1) {
      const idx = (hash + i) % this.m;
      probes.push(idx);
      const cell = this.buckets[idx];
      if (cell === null) {
        if (firstFree < 0) firstFree = idx;
        break;
      }
      if (cell === TOMBSTONE) {
        if (firstFree < 0) firstFree = idx;
        continue;
      }
      if (cell === key) return fail(`${fmtKey(key)} ist bereits vorhanden (Platz ${idx}).`, { probes, explain });
    }
    if (firstFree < 0) return fail(`Tabelle voll – ${fmtKey(key)} kann beim linearen Sondieren nicht eingefügt werden.`, { probes, explain });
    this.buckets[firstFree] = key;
    this.count += 1;
    const tries = probes.indexOf(firstFree) + 1;
    return ok(`${fmtKey(key)} → h = ${hash}${firstFree !== hash ? `, belegt → lineares Sondieren, Platz ${firstFree} (Versuch ${tries})` : ''}.`, { probes, explain, highlight: firstFree });
  }
  search(key) {
    const { hash, explain } = hashKey(key, this.m);
    if (this.strategy === 'chaining') {
      const chain = this.buckets[hash];
      const pos = chain.indexOf(key);
      return pos >= 0
        ? ok(`${fmtKey(key)} gefunden in Bucket ${hash}, Position ${pos + 1} der Kette.`, { probes: [hash], explain, highlight: hash })
        : fail(`${fmtKey(key)} nicht gefunden (Bucket ${hash} durchsucht).`, { probes: [hash], explain });
    }
    const probes = [];
    for (let i = 0; i < this.m; i += 1) {
      const idx = (hash + i) % this.m;
      probes.push(idx);
      const cell = this.buckets[idx];
      if (cell === null) break;
      if (cell === key) return ok(`${fmtKey(key)} gefunden an Platz ${idx} nach ${i + 1} Versuch${i ? 'en' : ''}.`, { probes, explain, highlight: idx });
    }
    return fail(`${fmtKey(key)} nicht gefunden (Plätze ${probes.join(', ')} geprüft).`, { probes, explain });
  }
  delete(key) {
    const { hash, explain } = hashKey(key, this.m);
    if (this.strategy === 'chaining') {
      const chain = this.buckets[hash];
      const pos = chain.indexOf(key);
      if (pos < 0) return fail(`${fmtKey(key)} nicht gefunden – nichts gelöscht.`, { probes: [hash], explain });
      chain.splice(pos, 1);
      this.count -= 1;
      return ok(`${fmtKey(key)} aus der Kette in Bucket ${hash} entfernt.`, { probes: [hash], explain, highlight: hash });
    }
    const found = this.search(key);
    if (!found.ok) return fail(`${fmtKey(key)} nicht gefunden – nichts gelöscht.`, { probes: found.probes, explain });
    this.buckets[found.highlight] = TOMBSTONE;
    this.count -= 1;
    return ok(`${fmtKey(key)} an Platz ${found.highlight} gelöscht und als „gelöscht“ markiert (Grabstein), damit spätere Suchen weitersondieren.`, { probes: found.probes, explain, highlight: found.highlight });
  }
}

function fmtKey(key) {
  return typeof key === 'number' ? String(key) : `„${key}“`;
}
