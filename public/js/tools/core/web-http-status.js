/**
 * HTTP-Statuscodes (RFC 9110 sowie ergänzende RFCs) mit deutscher Kurzbeschreibung.
 * Felder: code, name (offizielle englische Bezeichnung), de (Kurzbeschreibung),
 * use (typische Ursache/Verwendung), ref (Quelle), joke (nur 418).
 */
export const HTTP_CLASSES = {
  1: 'Informativ (1xx)',
  2: 'Erfolg (2xx)',
  3: 'Umleitung (3xx)',
  4: 'Client-Fehler (4xx)',
  5: 'Server-Fehler (5xx)'
};

export const HTTP_STATUS = [
  { code: 100, name: 'Continue', de: 'Weitermachen', use: 'Antwort auf „Expect: 100-continue“: Der Server hat die Header geprüft, der Client darf den (großen) Body senden.', ref: 'RFC 9110' },
  { code: 101, name: 'Switching Protocols', de: 'Protokollwechsel', use: 'Wechsel auf ein anderes Protokoll per Upgrade-Header, typisch beim Aufbau einer WebSocket-Verbindung.', ref: 'RFC 9110' },
  { code: 102, name: 'Processing', de: 'Wird verarbeitet', use: 'WebDAV: Anfrage angenommen, Verarbeitung dauert noch. Heute kaum genutzt.', ref: 'RFC 2518' },
  { code: 103, name: 'Early Hints', de: 'Frühe Hinweise', use: 'Vorab-Antwort mit Link-Headern (preload), damit der Browser Ressourcen schon lädt, während der Server die eigentliche Antwort berechnet.', ref: 'RFC 8297' },
  { code: 200, name: 'OK', de: 'Erfolgreich', use: 'Standardantwort auf erfolgreiche Anfragen; bei GET enthält der Body die Ressource.', ref: 'RFC 9110' },
  { code: 201, name: 'Created', de: 'Erstellt', use: 'Eine neue Ressource wurde angelegt (z. B. nach POST); der Location-Header nennt ihre Adresse.', ref: 'RFC 9110' },
  { code: 202, name: 'Accepted', de: 'Angenommen', use: 'Anfrage angenommen, aber noch nicht verarbeitet – typisch für asynchrone Aufträge (Warteschlange).', ref: 'RFC 9110' },
  { code: 203, name: 'Non-Authoritative Information', de: 'Nicht maßgebliche Information', use: 'Ein Proxy hat die Antwort des Ursprungsservers verändert.', ref: 'RFC 9110' },
  { code: 204, name: 'No Content', de: 'Kein Inhalt', use: 'Erfolg ohne Antwort-Body, z. B. nach DELETE oder beim Speichern per PUT.', ref: 'RFC 9110' },
  { code: 205, name: 'Reset Content', de: 'Inhalt zurücksetzen', use: 'Erfolg; der Client soll die Ansicht (z. B. ein Formular) zurücksetzen.', ref: 'RFC 9110' },
  { code: 206, name: 'Partial Content', de: 'Teilinhalt', use: 'Antwort auf eine Range-Anfrage – z. B. fortgesetzte Downloads oder Video-Streaming.', ref: 'RFC 9110' },
  { code: 207, name: 'Multi-Status', de: 'Mehrfachstatus', use: 'WebDAV: Body enthält mehrere Statuscodes für mehrere Ressourcen.', ref: 'RFC 4918' },
  { code: 300, name: 'Multiple Choices', de: 'Mehrere Möglichkeiten', use: 'Es gibt mehrere Darstellungen der Ressource; der Client soll wählen. Selten genutzt.', ref: 'RFC 9110' },
  { code: 301, name: 'Moved Permanently', de: 'Dauerhaft verschoben', use: 'Ressource hat dauerhaft eine neue Adresse (Location). Suchmaschinen übernehmen die neue URL. Clients dürfen POST dabei in GET ändern.', ref: 'RFC 9110' },
  { code: 302, name: 'Found', de: 'Gefunden (vorübergehend umgeleitet)', use: 'Vorübergehende Umleitung. Browser wandeln POST historisch in GET um – eindeutiger sind 303 bzw. 307.', ref: 'RFC 9110' },
  { code: 303, name: 'See Other', de: 'Siehe andere Ressource', use: 'Nach einem POST auf eine Ergebnisseite umleiten, die per GET abgerufen wird (Post/Redirect/Get-Muster).', ref: 'RFC 9110' },
  { code: 304, name: 'Not Modified', de: 'Nicht geändert', use: 'Antwort auf bedingtes GET (If-None-Match/If-Modified-Since): Die zwischengespeicherte Kopie ist noch aktuell, kein Body.', ref: 'RFC 9110' },
  { code: 307, name: 'Temporary Redirect', de: 'Vorübergehende Umleitung', use: 'Wie 302, aber Methode und Body bleiben garantiert erhalten (POST bleibt POST).', ref: 'RFC 9110' },
  { code: 308, name: 'Permanent Redirect', de: 'Dauerhafte Umleitung', use: 'Wie 301, aber Methode und Body bleiben garantiert erhalten.', ref: 'RFC 9110' },
  { code: 400, name: 'Bad Request', de: 'Fehlerhafte Anfrage', use: 'Anfrage syntaktisch ungültig, z. B. kaputtes JSON oder fehlende Pflichtparameter.', ref: 'RFC 9110' },
  { code: 401, name: 'Unauthorized', de: 'Nicht authentifiziert', use: 'Anmeldung fehlt oder ist ungültig. Der Server muss einen WWW-Authenticate-Header mitsenden. (Trotz des Namens geht es um Authentifizierung.)', ref: 'RFC 9110' },
  { code: 402, name: 'Payment Required', de: 'Zahlung erforderlich', use: 'Für zukünftige Nutzung reserviert; manche APIs nutzen ihn bei abgelaufenem Abo.', ref: 'RFC 9110' },
  { code: 403, name: 'Forbidden', de: 'Verboten', use: 'Der Server hat die Anfrage verstanden, verweigert aber den Zugriff – auch eine Anmeldung ändert daran nichts (fehlende Berechtigung).', ref: 'RFC 9110' },
  { code: 404, name: 'Not Found', de: 'Nicht gefunden', use: 'Unter dieser Adresse gibt es keine Ressource (Tippfehler, gelöschte Seite). Wird auch genutzt, um die Existenz geschützter Ressourcen zu verbergen.', ref: 'RFC 9110' },
  { code: 405, name: 'Method Not Allowed', de: 'Methode nicht erlaubt', use: 'Die Ressource existiert, unterstützt die Methode aber nicht (z. B. DELETE). Der Allow-Header nennt die erlaubten Methoden.', ref: 'RFC 9110' },
  { code: 406, name: 'Not Acceptable', de: 'Nicht annehmbar', use: 'Keine Darstellung passt zu den Accept-Headern des Clients (Content Negotiation).', ref: 'RFC 9110' },
  { code: 407, name: 'Proxy Authentication Required', de: 'Proxy-Anmeldung erforderlich', use: 'Wie 401, aber der Proxy verlangt die Anmeldung (Proxy-Authenticate).', ref: 'RFC 9110' },
  { code: 408, name: 'Request Timeout', de: 'Zeitüberschreitung der Anfrage', use: 'Der Client hat die Anfrage nicht rechtzeitig vollständig gesendet; der Server schließt die Verbindung.', ref: 'RFC 9110' },
  { code: 409, name: 'Conflict', de: 'Konflikt', use: 'Anfrage widerspricht dem aktuellen Zustand, z. B. Bearbeitungskonflikt oder doppelter eindeutiger Wert.', ref: 'RFC 9110' },
  { code: 410, name: 'Gone', de: 'Dauerhaft entfernt', use: 'Die Ressource gab es, sie wurde aber absichtlich und endgültig entfernt (stärker als 404).', ref: 'RFC 9110' },
  { code: 411, name: 'Length Required', de: 'Längenangabe erforderlich', use: 'Der Server verlangt einen Content-Length-Header.', ref: 'RFC 9110' },
  { code: 412, name: 'Precondition Failed', de: 'Vorbedingung fehlgeschlagen', use: 'Eine Bedingung wie If-Match ist nicht erfüllt – Schutz vor dem Überschreiben fremder Änderungen (optimistisches Sperren).', ref: 'RFC 9110' },
  { code: 413, name: 'Content Too Large', de: 'Inhalt zu groß', use: 'Der Anfrage-Body überschreitet das Limit des Servers, z. B. beim Hochladen zu großer Dateien. (Früher „Payload Too Large“.)', ref: 'RFC 9110' },
  { code: 414, name: 'URI Too Long', de: 'URI zu lang', use: 'Die angeforderte URL ist länger, als der Server verarbeitet – oft zu viele Query-Parameter statt POST.', ref: 'RFC 9110' },
  { code: 415, name: 'Unsupported Media Type', de: 'Medientyp nicht unterstützt', use: 'Der Content-Type des Bodys wird nicht unterstützt, z. B. XML an eine reine JSON-API.', ref: 'RFC 9110' },
  { code: 416, name: 'Range Not Satisfiable', de: 'Bereich nicht erfüllbar', use: 'Der angefragte Byte-Bereich (Range) liegt außerhalb der Ressource.', ref: 'RFC 9110' },
  { code: 417, name: 'Expectation Failed', de: 'Erwartung nicht erfüllt', use: 'Der Expect-Header kann nicht erfüllt werden.', ref: 'RFC 9110' },
  { code: 418, name: "I'm a teapot", de: 'Ich bin eine Teekanne', use: 'Aprilscherz aus RFC 2324 (Hyper Text Coffee Pot Control Protocol, 1998): Eine Teekanne weigert sich, Kaffee zu kochen. Kein echter HTTP-Statuscode für ernsthafte Anwendungen; RFC 9110 hält ihn nur als „unused“ reserviert.', ref: 'RFC 2324 / RFC 9110', joke: true },
  { code: 421, name: 'Misdirected Request', de: 'Fehlgeleitete Anfrage', use: 'Die Anfrage ging an einen Server, der für diese Kombination aus Schema und Host nicht zuständig ist (z. B. bei wiederverwendeten HTTP/2-Verbindungen).', ref: 'RFC 9110' },
  { code: 422, name: 'Unprocessable Content', de: 'Nicht verarbeitbarer Inhalt', use: 'Syntax korrekt, aber inhaltlich ungültig – typisch für Validierungsfehler in REST-APIs.', ref: 'RFC 9110' },
  { code: 423, name: 'Locked', de: 'Gesperrt', use: 'WebDAV: Die Ressource ist gesperrt.', ref: 'RFC 4918' },
  { code: 425, name: 'Too Early', de: 'Zu früh', use: 'Der Server will eine Anfrage nicht verarbeiten, die in TLS-1.3-Early-Data (0-RTT) kam und wiederholt werden könnte (Replay-Gefahr).', ref: 'RFC 8470' },
  { code: 426, name: 'Upgrade Required', de: 'Protokoll-Upgrade erforderlich', use: 'Der Client soll auf ein anderes Protokoll wechseln (Upgrade-Header nennt es).', ref: 'RFC 9110' },
  { code: 428, name: 'Precondition Required', de: 'Vorbedingung erforderlich', use: 'Der Server verlangt bedingte Anfragen (z. B. If-Match), um verlorene Änderungen zu verhindern.', ref: 'RFC 6585' },
  { code: 429, name: 'Too Many Requests', de: 'Zu viele Anfragen', use: 'Ratenbegrenzung (Rate Limiting) überschritten; Retry-After nennt die Wartezeit.', ref: 'RFC 6585' },
  { code: 431, name: 'Request Header Fields Too Large', de: 'Header zu groß', use: 'Einzelne Header oder alle zusammen sind zu groß – oft zu viele oder zu große Cookies.', ref: 'RFC 6585' },
  { code: 451, name: 'Unavailable For Legal Reasons', de: 'Aus rechtlichen Gründen nicht verfügbar', use: 'Zugriff aus rechtlichen Gründen gesperrt (z. B. behördliche Anordnung). Anspielung auf „Fahrenheit 451“.', ref: 'RFC 7725' },
  { code: 500, name: 'Internal Server Error', de: 'Interner Serverfehler', use: 'Allgemeiner Fehler auf dem Server, z. B. eine nicht abgefangene Ausnahme im Programmcode.', ref: 'RFC 9110' },
  { code: 501, name: 'Not Implemented', de: 'Nicht implementiert', use: 'Der Server unterstützt die Funktion bzw. Methode überhaupt nicht.', ref: 'RFC 9110' },
  { code: 502, name: 'Bad Gateway', de: 'Fehlerhaftes Gateway', use: 'Ein Gateway/Reverse-Proxy hat vom dahinterliegenden Server eine ungültige Antwort bekommen (z. B. Anwendung abgestürzt).', ref: 'RFC 9110' },
  { code: 503, name: 'Service Unavailable', de: 'Dienst nicht verfügbar', use: 'Server vorübergehend überlastet oder in Wartung; Retry-After kann die Wartezeit nennen.', ref: 'RFC 9110' },
  { code: 504, name: 'Gateway Timeout', de: 'Gateway-Zeitüberschreitung', use: 'Ein Gateway/Proxy hat vom dahinterliegenden Server nicht rechtzeitig eine Antwort bekommen.', ref: 'RFC 9110' },
  { code: 505, name: 'HTTP Version Not Supported', de: 'HTTP-Version nicht unterstützt', use: 'Der Server unterstützt die verwendete HTTP-Version nicht.', ref: 'RFC 9110' },
  { code: 507, name: 'Insufficient Storage', de: 'Speicher nicht ausreichend', use: 'WebDAV: Der Server kann die Daten nicht speichern (Speicherplatz voll).', ref: 'RFC 4918' },
  { code: 508, name: 'Loop Detected', de: 'Endlosschleife erkannt', use: 'WebDAV: Bei der Verarbeitung wurde eine Endlosschleife erkannt.', ref: 'RFC 5842' },
  { code: 511, name: 'Network Authentication Required', de: 'Netzwerk-Anmeldung erforderlich', use: 'Ein Captive Portal (z. B. Hotel-WLAN) verlangt erst eine Anmeldung, bevor Zugriff ins Netz möglich ist.', ref: 'RFC 6585' }
];

/** Suche nach Code, Name, Beschreibung; klasse: 0 (alle) oder 1–5. */
export function searchStatus(query = '', klasse = 0) {
  const q = String(query).trim().toLowerCase();
  const k = Number(klasse) || 0;
  return HTTP_STATUS.filter((s) => {
    if (k && Math.floor(s.code / 100) !== k) return false;
    if (!q) return true;
    if (/^\d{1,3}$/.test(q)) return String(s.code).startsWith(q);
    if (/^\dxx$/.test(q)) return String(s.code)[0] === q[0];
    return `${s.code} ${s.name} ${s.de} ${s.use}`.toLowerCase().includes(q);
  });
}
