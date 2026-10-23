/**
 * Theoretisches Durchsatzmodell: Protokoll-Overhead, Übertragungsdauer mit RTT,
 * Bandwidth-Delay-Product und Fensterbegrenzung. Exakt mit Brüchen gerechnet.
 * Reine Logik ohne DOM.
 */
import { InputError, rat, mul, div, add, cmp, minRat, parseDecimal, ceilRat } from './num.js';
import { rateUnit, sizeUnit } from './units.js';

export const L4_HEADERS = {
  tcp: { label: 'TCP (20 Byte)', bytes: 20 },
  'tcp-ts': { label: 'TCP + Timestamps (32 B)', bytes: 32 },
  udp: { label: 'UDP (8 Byte)', bytes: 8 }
};
export const L3_HEADERS = { ipv4: { label: 'IPv4 (20 Byte)', bytes: 20, minMtu: 68 }, ipv6: { label: 'IPv6 (40 Byte)', bytes: 40, minMtu: 1280 } };
/** Ethernet auf der Leitung: Präambel+SFD 8, Header 14, FCS 4, Interframe Gap 12. */
export const ETH = { preamble: 8, header: 14, fcs: 4, ifg: 12, vlan: 4, minPayload: 46 };

function parseInt10(text, label, min, max) {
  const raw = String(text ?? '').trim();
  if (!/^\d{1,6}$/.test(raw)) throw new InputError(`${label}: Bitte eine ganze Zahl eingeben.`);
  const n = Number(raw);
  if (n < min || n > max) throw new InputError(`${label}: erlaubt sind ${min} bis ${max}.`);
  return n;
}

/** Overhead pro Paket. Ergebnis in Byte (Zahlen) und Effizienz als Bruch. */
export function packetOverhead({ mtu, l3 = 'ipv4', l4 = 'tcp', vlan = false }) {
  const L3 = L3_HEADERS[l3];
  const L4 = L4_HEADERS[l4];
  if (!L3 || !L4) throw new InputError('Unbekannter Protokolltyp.');
  const m = parseInt10(mtu, 'MTU', L3.minMtu, 9216);
  const payload = m - L3.bytes - L4.bytes;
  if (payload <= 0) throw new InputError('MTU zu klein für die Header.');
  const ethPayload = Math.max(m, ETH.minPayload);
  const frame = ETH.header + (vlan ? ETH.vlan : 0) + ethPayload + ETH.fcs;
  const wire = ETH.preamble + frame + ETH.ifg;
  return { mtu: m, l3: L3, l4: L4, payload, frame, wire, padding: ethPayload - m, efficiency: rat(BigInt(payload), BigInt(wire)), vlan };
}

/**
 * Gesamtmodell.
 * Eingaben (Text): rate + rateUnit, rttMs, size + sizeUnit, window + windowUnit, setupRtts, mtu, l3, l4, vlan, overhead (bool)
 */
export function throughputModel(v) {
  const rUnit = rateUnit(v.rateUnit);
  const rate = mul(parseDecimal(v.rate, { label: 'Datenrate', allowNegative: false }), rUnit.bits); // bit/s
  if (rate.n === 0n) throw new InputError('Datenrate: Muss größer als 0 sein.');
  const rttMs = parseDecimal(v.rttMs, { label: 'RTT', allowNegative: false });
  const rtt = div(rttMs, rat(1000n)); // s
  const sUnit = sizeUnit(v.sizeUnit);
  const sizeBits = mul(parseDecimal(v.size, { label: 'Datenmenge', allowNegative: false }), sUnit.bits);
  const wUnit = sizeUnit(v.windowUnit);
  const windowBits = mul(parseDecimal(v.window, { label: 'Fenstergröße', allowNegative: false }), wUnit.bits);
  const setup = parseInt10(v.setupRtts || '0', 'RTTs vor der Übertragung', 0, 20);

  const oh = v.overhead ? packetOverhead(v) : null;
  const goodput = oh ? mul(rate, oh.efficiency) : rate; // Nutzdaten-bit/s
  const bdpBits = mul(rate, rtt);
  let windowLimit = null;
  let effective = goodput;
  let limitedBy = 'Leitung';
  if (rtt.n > 0n) {
    windowLimit = div(windowBits, rtt); // bit/s Nutzdaten
    if (cmp(windowLimit, goodput) < 0) {
      effective = windowLimit;
      limitedBy = 'Fenster';
    }
  }
  if (effective.n === 0n) throw new InputError('Fenstergröße 0: Es könnte nichts übertragen werden.');
  const transfer = div(sizeBits, effective);
  const setupTime = mul(rat(BigInt(setup)), rtt);
  const total = add(setupTime, transfer);
  const packets = oh ? ceilRat(div(sizeBits, rat(BigInt(oh.payload * 8)))) : null;
  return {
    rate,
    rtt,
    rttMs,
    sizeBits,
    windowBits,
    setup,
    overhead: oh,
    goodput,
    bdpBits,
    bdpBytes: div(bdpBits, rat(8n)),
    windowLimit,
    effective,
    limitedBy,
    transfer,
    setupTime,
    total,
    packets,
    neededWindowBytes: div(mul(goodput, rtt), rat(8n)),
    utilisation: minRat(rat(1n), div(effective, goodput))
  };
}
