/**
 * Git-Branching-Simulator – rein simuliert, es werden keine Dateien verändert
 * und keine echten Git-Befehle ausgeführt. Commits enthalten keine Dateien,
 * daher gibt es auch keine Konflikte.
 *
 * Commit-IDs sind fortlaufend (c1, c2 …) statt echter SHA-1-Hashes.
 * Reine Logik ohne DOM.
 */

export const LIMITS = { commits: 60, branches: 10, message: 60, branchName: 30, command: 200 };

class GitError extends Error {}

function initialState() {
  return {
    commits: { c1: { id: 'c1', parents: [], message: 'Initialer Commit', lane: 'main', seq: 1, rebasedFrom: null } },
    branches: { main: 'c1' },
    lanes: ['main'],
    head: { branch: 'main', detached: null },
    next: 2
  };
}

/** Zerlegt eine Befehlszeile in Wörter; "…" und '…' halten Leerzeichen zusammen. */
export function tokenize(line) {
  const tokens = [];
  let cur = '';
  let quote = null;
  let has = false;
  for (const ch of String(line)) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'" || ch === '„' || ch === '“') {
      quote = ch === '„' ? '“' : ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) tokens.push(cur);
      cur = '';
      has = false;
    } else {
      cur += ch;
      has = true;
    }
  }
  if (quote) throw new GitError('Fehler: Nicht geschlossenes Anführungszeichen.');
  if (has || cur) tokens.push(cur);
  return tokens;
}

export function validBranchName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= LIMITS.branchName &&
    /^[A-Za-z0-9._\/-]+$/.test(name) &&
    !name.startsWith('-') &&
    !name.startsWith('/') &&
    !name.endsWith('/') &&
    !name.endsWith('.') &&
    !name.endsWith('.lock') &&
    !name.includes('..') &&
    !name.includes('//') &&
    name !== 'HEAD' &&
    !/^c\d+$/.test(name)
  );
}

export class GitSim {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = initialState();
    this.past = [];
    this.history = [];
  }

  /* --------------------------------------------------------- Abfragen */
  headId(s = this.state) {
    return s.head.branch ? s.branches[s.head.branch] : s.head.detached;
  }

  ancestors(id, s = this.state) {
    const seen = new Set();
    const stack = [id];
    while (stack.length) {
      const c = stack.pop();
      if (!c || seen.has(c)) continue;
      seen.add(c);
      stack.push(...s.commits[c].parents);
    }
    return seen;
  }

  isAncestor(a, b) {
    return this.ancestors(b).has(a);
  }

  mergeBase(a, b) {
    const ancA = this.ancestors(a);
    const common = [...this.ancestors(b)].filter((c) => ancA.has(c));
    const best = common.filter((x) => !common.some((c) => c !== x && this.ancestors(c).has(x)));
    best.sort((x, y) => this.state.commits[y].seq - this.state.commits[x].seq);
    return best[0] ?? null;
  }

  reachable() {
    const set = new Set();
    for (const id of [...Object.values(this.state.branches), this.headId()]) for (const c of this.ancestors(id)) set.add(c);
    return set;
  }

  /** Auflösen eines Namens: Branch oder Commit-ID. */
  resolve(ref) {
    if (ref === 'HEAD') return { id: this.headId(), branch: this.state.head.branch };
    if (Object.hasOwn(this.state.branches, ref)) return { id: this.state.branches[ref], branch: ref };
    if (Object.hasOwn(this.state.commits, ref)) return { id: ref, branch: null };
    return null;
  }

  labelsFor(id) {
    const names = Object.entries(this.state.branches)
      .filter(([, c]) => c === id)
      .map(([n]) => n);
    const head = this.headId() === id;
    const parts = [];
    if (head && this.state.head.branch) {
      parts.push(`HEAD -> ${this.state.head.branch}`);
      names.splice(names.indexOf(this.state.head.branch), 1);
    } else if (head) parts.push('HEAD');
    parts.push(...names);
    return parts;
  }

  /* ------------------------------------------------------- Befehle */
  /**
   * Führt eine Befehlszeile aus. Ergebnis: { ok, output, changed }.
   * Bei Erfolg mit Zustandsänderung wird der vorherige Zustand für „Rückgängig“ gemerkt.
   */
  run(line) {
    const text = String(line ?? '').trim();
    if (!text) return { ok: false, output: ['Bitte einen Befehl eingeben, z. B. git commit -m "Nachricht".'], changed: false };
    if (text.length > LIMITS.command) return { ok: false, output: [`Befehl zu lang (höchstens ${LIMITS.command} Zeichen).`], changed: false };
    const before = JSON.stringify(this.state);
    let result;
    try {
      const tokens = tokenize(text);
      if (tokens[0] !== 'git') throw new GitError('Simuliert werden nur Git-Befehle, die mit „git“ beginnen (z. B. git status). Gib „git help“ für eine Übersicht ein.');
      const [, cmd, ...args] = tokens;
      const handler = COMMANDS[cmd];
      if (!handler) {
        throw new GitError(cmd ? `git: '${cmd}' ist kein (simulierter) Git-Befehl. Siehe „git help“.` : 'Bitte einen Git-Befehl angeben, z. B. git status. Siehe „git help“.');
      }
      result = { ok: true, output: handler.call(this, args) };
    } catch (error) {
      if (!(error instanceof GitError)) throw error;
      this.state = JSON.parse(before);
      result = { ok: false, output: error.message.split('\n') };
    }
    const changed = JSON.stringify(this.state) !== before;
    if (changed) this.past.push(before);
    this.history.push({ command: text, ok: result.ok, output: result.output, changed });
    return { ...result, changed };
  }

  undo() {
    if (!this.past.length) return false;
    this.state = JSON.parse(this.past.pop());
    // Letzten zustandsändernden Befehl im Verlauf als rückgängig gemacht markieren
    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      const h = this.history[i];
      if (h.changed && !h.undone) {
        h.undone = true;
        break;
      }
    }
    return true;
  }

  newCommit(message, parents, lane, rebasedFrom = null) {
    const s = this.state;
    if (Object.keys(s.commits).length >= LIMITS.commits) throw new GitError(`Simulator-Grenze erreicht: höchstens ${LIMITS.commits} Commits. Nutze „Neustart“.`);
    const id = `c${s.next}`;
    s.next += 1;
    if (!s.lanes.includes(lane)) s.lanes.push(lane);
    s.commits[id] = { id, parents, message, lane, seq: s.next - 1, rebasedFrom };
    return id;
  }

  moveHead(id) {
    const s = this.state;
    if (s.head.branch) s.branches[s.head.branch] = id;
    else s.head.detached = id;
  }

  currentLane() {
    return this.state.head.branch ?? 'HEAD (losgelöst)';
  }

  createBranch(name, startId) {
    const s = this.state;
    if (!validBranchName(name)) throw new GitError(`fatal: '${name}' ist kein gültiger Branchname (erlaubt: Buchstaben, Ziffern, . _ / -; nicht „HEAD“ oder Commit-IDs wie c3).`);
    if (Object.hasOwn(s.branches, name)) throw new GitError(`fatal: Ein Branch namens '${name}' existiert bereits.`);
    if (Object.keys(s.branches).length >= LIMITS.branches) throw new GitError(`Simulator-Grenze erreicht: höchstens ${LIMITS.branches} Branches.`);
    s.branches[name] = startId;
  }

  checkoutRef(ref, { detachOk = true, command = 'checkout' } = {}) {
    const s = this.state;
    const r = this.resolve(ref);
    if (!r) {
      if (command === 'switch') throw new GitError(`fatal: Ungültige Referenz: ${ref}`);
      throw new GitError(`error: Pfadspezifikation '${ref}' stimmt mit keiner Git bekannten Datei überein.\n(Im Simulator gibt es keine Dateien – gemeint war wohl ein Branch. Vorhanden: ${Object.keys(s.branches).join(', ')})`);
    }
    if (r.branch && ref !== 'HEAD') {
      if (s.head.branch === r.branch) return [`Bereits auf '${r.branch}'`];
      s.head = { branch: r.branch, detached: null };
      return [`Zu Branch '${r.branch}' gewechselt`];
    }
    if (!detachOk) throw new GitError(`fatal: Branch erwartet, Commit '${ref}' erhalten\nHinweis: Um einen Commit ohne Branch auszuchecken, nutze: git switch --detach ${ref}`);
    s.head = { branch: null, detached: r.id };
    return [
      `Hinweis: Wechsle zu '${r.id}'.`,
      'Du befindest dich im Zustand eines \'losgelösten HEAD\' (detached HEAD). Neue Commits gehören zu keinem Branch',
      'und werden unerreichbar, sobald du wegwechselst – außer du legst einen Branch an (git switch -c <name>).',
      `HEAD ist jetzt bei ${r.id} ${s.commits[r.id].message}`
    ];
  }
}

function needArg(args, usage) {
  if (!args.length) throw new GitError(`Verwendung: ${usage}`);
}

function rejectUnknownOptions(args, allowed, cmd) {
  for (const a of args) {
    if (a.startsWith('-') && !allowed.includes(a)) throw new GitError(`error: Unbekannte Option '${a}' (im Simulator für git ${cmd} unterstützt: ${allowed.length ? allowed.join(', ') : 'keine'}).`);
  }
}

const COMMANDS = {
  help() {
    return [
      'Simulierte Befehle:',
      '  git commit -m "Nachricht"        neuen Commit auf HEAD erstellen',
      '  git branch [<name> [<start>]]    Branches auflisten bzw. anlegen',
      '  git branch -d|-D <name>          Branch löschen',
      '  git checkout <branch|commit>     wechseln (Commit-ID → losgelöster HEAD)',
      '  git checkout -b <name>           Branch anlegen und wechseln',
      '  git switch <branch>              wechseln;  git switch -c <name> anlegen;  --detach <commit>',
      '  git merge [--no-ff] <branch>     zusammenführen (Fast-Forward, wenn möglich)',
      '  git rebase <branch>              Commits auf einen anderen Branch neu anwenden',
      '  git log [--oneline]              Verlauf ab HEAD',
      '  git status                       aktueller Branch'
    ];
  },

  status(args) {
    rejectUnknownOptions(args, ['-s', '--short'], 'status');
    const s = this.state;
    const lines = s.head.branch ? [`Auf Branch ${s.head.branch}`] : [`HEAD losgelöst bei ${s.head.detached}`];
    lines.push('nichts zu committen (im Simulator gibt es keine Dateien)');
    return lines;
  },

  log(args) {
    rejectUnknownOptions(args, ['--oneline'], 'log');
    const oneline = args.includes('--oneline');
    const rest = args.filter((a) => !a.startsWith('-'));
    let start = this.headId();
    if (rest.length) {
      const r = this.resolve(rest[0]);
      if (!r) throw new GitError(`fatal: Mehrdeutiges Argument '${rest[0]}': unbekannte Revision.`);
      start = r.id;
    }
    const ids = [...this.ancestors(start)].sort((a, b) => this.state.commits[b].seq - this.state.commits[a].seq);
    const out = [];
    for (const id of ids) {
      const c = this.state.commits[id];
      const labels = this.labelsFor(id);
      const deco = labels.length ? ` (${labels.join(', ')})` : '';
      if (oneline) out.push(`${id}${deco} ${c.message}`);
      else {
        out.push(`commit ${id}${deco}`);
        if (c.parents.length > 1) out.push(`Merge: ${c.parents.join(' ')}`);
        out.push(`    ${c.message}`, '');
      }
    }
    if (!oneline && out[out.length - 1] === '') out.pop();
    return out;
  },

  commit(args) {
    let message = null;
    for (let i = 0; i < args.length; i += 1) {
      const a = args[i];
      if (a === '-m' || a === '--message') {
        if (i + 1 >= args.length) throw new GitError(`error: Schalter '${a.replace(/^-+/, '')}' erfordert einen Wert`);
        message = args[i + 1];
        i += 1;
      } else if (a.startsWith('--message=')) message = a.slice(10);
      else if (a === '-a' || a === '--all' || a === '--allow-empty') continue;
      else if (a.startsWith('-')) throw new GitError(`error: Unbekannte Option '${a}' (im Simulator: -m "Nachricht").`);
      else throw new GitError(`error: Pfadangaben wie '${a}' werden nicht simuliert – es gibt keine Dateien. Nachricht mit -m "…" angeben.`);
    }
    if (message === null) throw new GitError('Bitte eine Commit-Nachricht mit -m "…" angeben (echtes Git würde einen Editor öffnen).');
    message = message.trim();
    if (!message) throw new GitError('Abbruch: Leere Commit-Nachricht.');
    if (message.length > LIMITS.message) throw new GitError(`Commit-Nachricht zu lang (höchstens ${LIMITS.message} Zeichen im Simulator).`);
    const parent = this.headId();
    const id = this.newCommit(message, [parent], this.currentLane());
    this.moveHead(id);
    const where = this.state.head.branch ?? 'losgelöster HEAD';
    return [`[${where} ${id}] ${message}`];
  },

  branch(args) {
    const s = this.state;
    if (!args.length) {
      return Object.keys(s.branches)
        .sort()
        .map((n) => `${n === s.head.branch ? '* ' : '  '}${n}`)
        .concat(s.head.branch ? [] : [`* (HEAD losgelöst bei ${s.head.detached})`]);
    }
    if (args[0] === '-d' || args[0] === '-D' || args[0] === '--delete') {
      needArg(args.slice(1), 'git branch -d <name>');
      const name = args[1];
      if (!Object.hasOwn(s.branches, name)) throw new GitError(`error: Branch '${name}' nicht gefunden.`);
      if (s.head.branch === name) throw new GitError(`error: Der Branch '${name}' kann nicht gelöscht werden, da er gerade ausgecheckt ist.`);
      if (args[0] !== '-D' && !this.isAncestor(s.branches[name], this.headId())) {
        throw new GitError(`error: Der Branch '${name}' ist nicht vollständig zusammengeführt.\nWenn du sicher bist, dass du ihn löschen möchtest, führe 'git branch -D ${name}' aus.`);
      }
      const id = s.branches[name];
      delete s.branches[name];
      return [`Branch ${name} entfernt (war ${id}).`];
    }
    rejectUnknownOptions(args, [], 'branch (außer -d/-D)');
    const [name, start] = args;
    let startId = this.headId();
    if (start) {
      const r = this.resolve(start);
      if (!r) throw new GitError(`fatal: Kein gültiger Objektname: '${start}'.`);
      startId = r.id;
    }
    this.createBranch(name, startId);
    return [`Branch '${name}' bei ${startId} angelegt (HEAD bleibt, wo er ist – zum Wechseln: git switch ${name}).`];
  },

  checkout(args) {
    needArg(args, 'git checkout <branch> | git checkout -b <neuer-branch>');
    if (args[0] === '-b' || args[0] === '-B') {
      needArg(args.slice(1), 'git checkout -b <neuer-branch> [<start>]');
      const name = args[1];
      let startId = this.headId();
      if (args[2]) {
        const r = this.resolve(args[2]);
        if (!r) throw new GitError(`fatal: '${args[2]}' ist kein Commit, und es kann kein Branch '${name}' daraus erstellt werden.`);
        startId = r.id;
      }
      this.createBranch(name, startId);
      this.state.head = { branch: name, detached: null };
      return [`Zu neuem Branch '${name}' gewechselt`];
    }
    rejectUnknownOptions(args, [], 'checkout (außer -b)');
    return this.checkoutRef(args[0]);
  },

  switch(args) {
    needArg(args, 'git switch <branch> | git switch -c <neuer-branch>');
    if (args[0] === '-c' || args[0] === '--create' || args[0] === '-C') {
      needArg(args.slice(1), 'git switch -c <neuer-branch> [<start>]');
      const name = args[1];
      let startId = this.headId();
      if (args[2]) {
        const r = this.resolve(args[2]);
        if (!r) throw new GitError(`fatal: Ungültige Referenz: ${args[2]}`);
        startId = r.id;
      }
      this.createBranch(name, startId);
      this.state.head = { branch: name, detached: null };
      return [`Zu neuem Branch '${name}' gewechselt`];
    }
    if (args[0] === '--detach' || args[0] === '-d') {
      needArg(args.slice(1), 'git switch --detach <commit>');
      const r = this.resolve(args[1]);
      if (!r) throw new GitError(`fatal: Ungültige Referenz: ${args[1]}`);
      return this.checkoutRef(r.id, { command: 'switch' });
    }
    rejectUnknownOptions(args, [], 'switch (außer -c, --detach)');
    return this.checkoutRef(args[0], { detachOk: false, command: 'switch' });
  },

  merge(args) {
    rejectUnknownOptions(args, ['--no-ff', '--ff-only'], 'merge');
    const noFf = args.includes('--no-ff');
    const ffOnly = args.includes('--ff-only');
    const refs = args.filter((a) => !a.startsWith('-'));
    needArg(refs, 'git merge [--no-ff] <branch>');
    const ref = refs[0];
    const r = this.resolve(ref);
    if (!r) throw new GitError(`merge: ${ref} - nichts, was wir zusammenführen können`);
    const head = this.headId();
    if (this.isAncestor(r.id, head)) return ['Bereits aktuell.'];
    if (this.isAncestor(head, r.id) && !noFf) {
      this.moveHead(r.id);
      return [`Aktualisiere ${head}..${r.id}`, 'Fast-forward', `(${this.state.head.branch ?? 'HEAD'} zeigt jetzt einfach auf ${r.id} – kein neuer Commit nötig)`];
    }
    if (ffOnly) throw new GitError('fatal: Kein Vorspulen (Fast-Forward) möglich, breche ab.');
    const current = this.state.head.branch;
    const message = `Merge branch '${ref}'${current && current !== 'main' && current !== 'master' ? ` into ${current}` : ''}`;
    const id = this.newCommit(message, [head, r.id], this.currentLane());
    this.moveHead(id);
    const base = this.mergeBase(head, r.id);
    return [`Merge made by the 'ort' strategy.`, `Neuer Merge-Commit ${id} mit zwei Eltern: ${head} und ${r.id} (gemeinsame Basis: ${base}).`];
  },

  rebase(args) {
    rejectUnknownOptions(args, [], 'rebase');
    needArg(args, 'git rebase <branch>');
    const r = this.resolve(args[0]);
    if (!r) throw new GitError(`fatal: Ungültiger Upstream '${args[0]}'`);
    const head = this.headId();
    const name = this.state.head.branch;
    if (this.isAncestor(r.id, head)) return [`Der aktuelle Branch ${name ?? 'HEAD'} ist auf dem neuesten Stand.`];
    const upstreamAnc = this.ancestors(r.id);
    const toReplay = [...this.ancestors(head)]
      .filter((c) => !upstreamAnc.has(c))
      .map((c) => this.state.commits[c])
      .filter((c) => c.parents.length === 1) // Merge-Commits werden wie bei git rebase verworfen
      .sort((a, b) => a.seq - b.seq);
    if (!toReplay.length) {
      this.moveHead(r.id);
      return [`Fast-forward: ${name ?? 'HEAD'} auf ${r.id} vorgespult (keine eigenen Commits zum Neuanwenden).`];
    }
    let tip = r.id;
    const mapping = [];
    for (const c of toReplay) {
      tip = this.newCommit(c.message, [tip], this.currentLane(), c.id);
      mapping.push(`${c.id} → ${tip}`);
    }
    this.moveHead(tip);
    return [
      `Neu angewendet auf ${args[0]} (${r.id}): ${mapping.join(', ')}`,
      'Die neuen Commits haben neue IDs; die alten sind (ohne Branch-Verweis) nicht mehr erreichbar.',
      `Erfolgreich Rebase ausgeführt und ${name ? `refs/heads/${name}` : 'HEAD'} aktualisiert.`
    ];
  }
};
