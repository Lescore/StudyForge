/**
 * TCP-Verbindungsaufbau, Datenaustausch und -abbau als Ereignisfolge (Simulation).
 * Regeln (RFC 9293): SYN und FIN verbrauchen je eine Sequenznummer, Daten so viele
 * wie Byte gesendet werden. Rechnung modulo 2^32. Reine Logik ohne DOM.
 */
import { InputError } from './num.js';

const MOD = 2 ** 32;
export const seqAdd = (a, n) => (a + n) % MOD;

export function parseIsn(text, label) {
  const raw = String(text ?? '').trim();
  if (!/^\d{1,10}$/.test(raw)) throw new InputError(`${label}: Bitte eine ganze Zahl zwischen 0 und 4 294 967 295 eingeben.`);
  const n = Number(raw);
  if (n >= MOD) throw new InputError(`${label}: Höchstens 4 294 967 295 (32 Bit).`);
  return n;
}

export function parseLength(text, label, max = 65535) {
  const raw = String(text ?? '').trim() || '0';
  if (!/^\d{1,6}$/.test(raw)) throw new InputError(`${label}: Bitte eine ganze Zahl ≥ 0 eingeben.`);
  const n = Number(raw);
  if (n > max) throw new InputError(`${label}: Höchstens ${max} Byte in einem Segment dieser Simulation.`);
  return n;
}

export function randomIsn(rand = Math.random) {
  return Math.floor(rand() * MOD);
}

export const SCENARIOS = [
  ['normal', 'Normaler Ablauf'],
  ['lost-syn', 'SYN geht verloren (Timeout, Neuübertragung)'],
  ['lost-ack', 'ACK des Handshakes geht verloren'],
  ['rst', 'Port geschlossen → RST']
];

/**
 * Erzeugt die Ereignisse. Jedes Ereignis:
 * { from: 'client'|'server'|null, flags: [], seq, ack, len, lost, note, client, server, kind }
 * client/server = Zustand NACH dem Ereignis.
 */
export function simulateTcp({ clientIsn, serverIsn, scenario = 'normal', clientData = 0, serverData = 0, close = true, rto = 1 }) {
  const events = [];
  let cs = 'CLOSED';
  let ss = scenario === 'rst' ? 'CLOSED' : 'LISTEN';
  const push = (e) => events.push({ lost: false, len: 0, kind: 'segment', ...e, client: cs, server: ss });

  push({ from: null, kind: 'start', note: scenario === 'rst'
    ? 'Ausgangslage: Auf dem Zielport lauscht kein Prozess (Server-Port im Zustand CLOSED).'
    : 'Ausgangslage: Der Server hat den Port geöffnet und wartet (passive open, LISTEN). Der Client ist CLOSED.' });

  // Client sendet SYN (active open)
  let cSeq = clientIsn; // nächste zu sendende Sequenznummer des Clients
  cs = 'SYN-SENT';
  if (scenario === 'lost-syn') {
    push({ from: 'client', flags: ['SYN'], seq: cSeq, ack: null, lost: true, note: `Client wählt ISN = ${clientIsn} und sendet SYN. Das Segment geht unterwegs verloren.` });
    push({ from: null, kind: 'timeout', side: 'client', note: `Kein SYN-ACK innerhalb des Retransmission Timeout (RTO, Startwert ${rto} s nach RFC 6298). Der Client sendet das SYN erneut – mit derselben Sequenznummer – und verdoppelt das RTO (exponentielles Backoff).` });
    push({ from: 'client', flags: ['SYN'], seq: cSeq, ack: null, note: `Neuübertragung: SYN, seq = ${cSeq} (unverändert).` });
  } else {
    push({ from: 'client', flags: ['SYN'], seq: cSeq, ack: null, note: `Client wählt ISN = ${clientIsn} und sendet SYN (active open). Zustand SYN-SENT.` });
  }
  cSeq = seqAdd(cSeq, 1); // SYN verbraucht 1

  if (scenario === 'rst') {
    cs = 'CLOSED';
    push({ from: 'server', flags: ['RST', 'ACK'], seq: 0, ack: cSeq, note: `Kein Prozess am Port: Der Server-Host antwortet mit RST+ACK. Da das SYN kein ACK trug, ist seq = 0 und ack = ISN + 1 = ${cSeq} (SYN zählt 1). Der Client meldet „Connection refused“ und ist wieder CLOSED.` });
    return events;
  }

  // Server antwortet SYN-ACK
  let sSeq = serverIsn;
  ss = 'SYN-RECEIVED';
  push({ from: 'server', flags: ['SYN', 'ACK'], seq: sSeq, ack: cSeq, note: `Server wählt ISN = ${serverIsn}, bestätigt das SYN mit ack = ${clientIsn} + 1 = ${cSeq} (das SYN verbraucht eine Sequenznummer). Zustand SYN-RECEIVED.` });
  sSeq = seqAdd(sSeq, 1);

  // Client ACK
  cs = 'ESTABLISHED';
  if (scenario === 'lost-ack') {
    push({ from: 'client', flags: ['ACK'], seq: cSeq, ack: sSeq, lost: true, note: `Client bestätigt mit ack = ${serverIsn} + 1 = ${sSeq} und ist ESTABLISHED. Das ACK geht verloren – der Server bleibt in SYN-RECEIVED.` });
    push({ from: null, kind: 'timeout', side: 'server', note: 'Der Server erhält kein ACK und wiederholt nach Ablauf seines Timers das SYN-ACK.' });
    push({ from: 'server', flags: ['SYN', 'ACK'], seq: serverIsn, ack: cSeq, note: `Neuübertragung SYN-ACK mit derselben Sequenznummer ${serverIsn}.` });
    ss = 'ESTABLISHED';
    push({ from: 'client', flags: ['ACK'], seq: cSeq, ack: sSeq, note: 'Der Client erkennt das doppelte SYN-ACK und bestätigt erneut. Jetzt ist auch der Server ESTABLISHED. (Hätte der Client vorher Daten gesendet, hätte schon deren ACK-Flag den Handshake abgeschlossen.)' });
  } else {
    ss = 'ESTABLISHED';
    push({ from: 'client', flags: ['ACK'], seq: cSeq, ack: sSeq, note: `Client bestätigt mit ack = ${serverIsn} + 1 = ${sSeq}. Ein reines ACK verbraucht keine Sequenznummer. Beide Seiten sind ESTABLISHED.` });
  }

  // Datenaustausch
  if (clientData > 0) {
    push({ from: 'client', flags: ['PSH', 'ACK'], seq: cSeq, ack: sSeq, len: clientData, note: `Client sendet ${clientData} Byte Daten ab seq = ${cSeq}.` });
    const before = cSeq;
    cSeq = seqAdd(cSeq, clientData);
    push({ from: 'server', flags: ['ACK'], seq: sSeq, ack: cSeq, note: `Server bestätigt: ack = ${before} + ${clientData} = ${cSeq} (nächstes erwartetes Byte).` });
  }
  if (serverData > 0) {
    push({ from: 'server', flags: ['PSH', 'ACK'], seq: sSeq, ack: cSeq, len: serverData, note: `Server sendet ${serverData} Byte Antwortdaten ab seq = ${sSeq}.` });
    const before = sSeq;
    sSeq = seqAdd(sSeq, serverData);
    push({ from: 'client', flags: ['ACK'], seq: cSeq, ack: sSeq, note: `Client bestätigt: ack = ${before} + ${serverData} = ${sSeq}.` });
  }

  if (!close) return events;

  // Abbau: Client schließt aktiv
  cs = 'FIN-WAIT-1';
  push({ from: 'client', flags: ['FIN', 'ACK'], seq: cSeq, ack: sSeq, note: `Client schließt (active close): FIN mit seq = ${cSeq}. Zustand FIN-WAIT-1.` });
  cSeq = seqAdd(cSeq, 1);
  ss = 'CLOSE-WAIT';
  push({ from: 'server', flags: ['ACK'], seq: sSeq, ack: cSeq, note: `Server bestätigt das FIN mit ack = ${cSeq} (FIN verbraucht 1). Server: CLOSE-WAIT – die Anwendung darf noch Daten senden.` });
  cs = 'FIN-WAIT-2';
  events[events.length - 1].client = cs;
  ss = 'LAST-ACK';
  push({ from: 'server', flags: ['FIN', 'ACK'], seq: sSeq, ack: cSeq, note: `Server-Anwendung schließt ebenfalls: FIN mit seq = ${sSeq}. Zustand LAST-ACK.` });
  sSeq = seqAdd(sSeq, 1);
  cs = 'TIME-WAIT';
  push({ from: 'client', flags: ['ACK'], seq: cSeq, ack: sSeq, note: `Client bestätigt mit ack = ${sSeq} und geht in TIME-WAIT (wartet 2 × MSL, damit verspätete Segmente nicht eine neue Verbindung stören).` });
  ss = 'CLOSED';
  events[events.length - 1].server = ss;
  events[events.length - 1].note += ' Der Server ist nach Empfang dieses ACK CLOSED.';
  cs = 'CLOSED';
  push({ from: null, kind: 'timeout', side: 'client', note: 'Nach Ablauf von 2 × MSL verlässt der Client TIME-WAIT und ist CLOSED.' });
  return events;
}

export function flagText(e) {
  return e.flags?.join(', ') ?? '';
}
