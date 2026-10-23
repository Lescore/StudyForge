# ical.js (mitgeliefert)

- Projekt: ical.js – Parser für iCalendar (RFC 5545) und vCard
- Version: 2.2.1 (npm-Paket `ical.js`, Datei `dist/ical.js`, unverändert)
- Lizenz: Mozilla Public License 2.0 (siehe `LICENSE` in diesem Ordner)
- SHA-256 von `ical.js`: `396c1349c899974b1048460e3c7495ec394ff1a86941ab5bf6291b272b8d53c2`
- Keine eigenen Abhängigkeiten, keine Netzwerkzugriffe.

Wird ausschließlich serverseitig von `server/ics.js` verwendet. Die Datei liegt
im Projekt, damit StudyForge ohne `npm install` und ohne Internet läuft.
Aktualisieren: neues Paket herunterladen, `dist/ical.js` und `LICENSE`
ersetzen, Prüfsumme hier anpassen und `npm test` ausführen.
