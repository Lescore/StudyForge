# StudyForge einrichten und benutzen

StudyForge ist ein persönliches Lernzentrum fürs Studium: Notizen,
Karteikarten, Dokumente, Aufgaben, Prüfungen, Kalender und Informatik-Werkzeuge.
Alles läuft **auf deinem eigenen Rechner** – ohne Konto, ohne Cloud, ohne
Internet. Die Oberfläche öffnet sich im Browser.

Diese Anleitung richtet sich an alle, die StudyForge neu bekommen haben.

---

## 1. Was du brauchst

- **Windows 10 oder 11**, **Linux** (z. B. Linux Mint, Ubuntu, Debian) oder
  **macOS**
- einen aktuellen Browser (Chrome, Edge, Firefox, Safari)
- etwa 200 MB freien Speicher (plus Platz für deine Dokumente)
- **Node.js 22.5 oder neuer** – das ist das Programm, mit dem StudyForge läuft.
  Du musst es **nicht selbst installieren**: Das Setup lädt es auf Wunsch
  automatisch herunter (dafür einmalig Internet, keine Administratorrechte).

---

## 2. Einrichten (einmalig)

Entpacke bzw. kopiere den Ordner `StudyForge` an einen Ort, an dem du schreiben
darfst – z. B. in deinen Dokumente-Ordner oder auf einen USB-Stick.
**Nicht** nach `C:\Programme` (dort fehlen Schreibrechte).

### Windows

1. Im Ordner `StudyForge` die Datei **`setup.cmd`** doppelklicken.
2. Erscheint eine Sicherheitswarnung, ist das bei Dateien aus dem Internet
   normal: bei „Der Computer wurde durch Windows geschützt“ auf
   **„Weitere Informationen“** → **„Trotzdem ausführen“** klicken, bei
   „Datei öffnen – Sicherheitswarnung“ auf **„Ausführen“**.
3. Das Setup prüft, ob Node.js vorhanden ist. Falls nicht, fragt es:
   *„Jetzt herunterladen? [j/N]“* – mit **j** und Enter bestätigen.
   Node.js wird von nodejs.org geladen, die Prüfsumme kontrolliert und in den
   Unterordner `runtime\node` gelegt. Am System wird nichts installiert.
4. Auf Wunsch legt das Setup eine **Desktop-Verknüpfung** „StudyForge“ an.
5. Zum Schluss erscheint eine Prüfliste. Steht dort **„Alles bereit.“**, bist
   du fertig.

### Linux (Mint, Ubuntu, Debian …)

1. Ein Terminal im Ordner `StudyForge` öffnen (Rechtsklick im Ordner →
   „Im Terminal öffnen“).
2. Eingeben:

   ```bash
   sh setup.sh
   ```

3. Fehlt Node.js oder ist es zu alt (viele Distributionen bringen eine alte
   Version mit), fragt das Setup, ob es eine passende Version herunterladen
   soll – mit **j** bestätigen. Sie landet in `runtime/node`; das System
   bleibt unverändert, `sudo` ist nicht nötig.
4. Auf Wunsch legt das Setup einen Eintrag **„StudyForge“ im Anwendungsmenü**
   an.
5. Steht am Ende **„Alles bereit.“**, bist du fertig.

### macOS

Wie bei Linux: Terminal im Ordner öffnen und `sh setup.sh` eingeben.
Alternativ Node.js 22 (LTS) von nodejs.org installieren. *Hinweis: Das Setup
unterstützt macOS, wurde dort aber noch nicht ausprobiert.*

### Setup-Optionen (für Fortgeschrittene)

| Linux/macOS | Windows | Wirkung |
| --- | --- | --- |
| `--yes` | `-Yes` | alle Fragen mit Ja beantworten |
| `--no-menu` | `-NoShortcut` | keinen Menüeintrag / keine Verknüpfung anlegen |
| `--test` | `-Test` | zusätzlich alle automatischen Tests ausführen (1–2 Minuten) |

Beispiel: `sh setup.sh --yes --test` bzw. `setup.cmd -Yes -Test`.

Das Setup darf beliebig oft ausgeführt werden; vorhandene Daten bleiben
unverändert.

---

## 3. Starten und beenden

| | Windows | Linux / macOS |
| --- | --- | --- |
| **Starten** | `start.cmd` doppelklicken (oder Desktop-Verknüpfung) | `./start.sh` im Terminal (oder Menüeintrag) |
| **Beenden** | im Startfenster `Strg+C` – oder `stop.cmd` doppelklicken | im Terminal `Strg+C` – oder `./stop.sh` |

Beim Start öffnet sich der Browser mit <http://localhost:4173>. Das
**Startfenster muss offen bleiben**, solange du StudyForge benutzt – wird es
geschlossen, ist StudyForge beendet (deine Daten sind trotzdem gespeichert).

Öffnet sich der Browser nicht von selbst, die Adresse aus dem Startfenster
(meist `http://localhost:4173`) im Browser eingeben.

---

## 4. Deine Daten

- Alles liegt im Unterordner **`data/`**: Datenbank, Anhänge, Dokumente und
  automatische Sicherheitsbackups.
- **Sichern:** In StudyForge unter *Sichern & Einstellungen* → **„ZIP-Backup
  erstellen“**. Die ZIP-Datei an einem zweiten Ort aufbewahren (externe
  Festplatte, zweiter Rechner).
- **Wiederherstellen:** *Sichern & Einstellungen* → *Backup wiederherstellen*.
- **Zurücksetzen:** *Sichern & Einstellungen* → *Zurücksetzen* (vorher wird
  automatisch ein Backup angelegt).

---

## 5. StudyForge an andere weitergeben

> **Wichtig:** Der Ordner `data/` enthält **deine persönlichen Notizen,
> Dokumente und Lernstände**. Gib ihn nicht mit weiter.

So geht es richtig:

1. StudyForge beenden.
2. Den Ordner `StudyForge` kopieren und in der Kopie den Ordner **`data/`
   löschen** (er wird beim ersten Start neu und leer angelegt).
3. Den Ordner `runtime/` kannst du ebenfalls löschen – die andere Person führt
   einfach selbst das Setup aus. Lässt du ihn drin, funktioniert er nur auf
   demselben Betriebssystem (Windows-Node läuft nicht unter Linux und
   umgekehrt).
4. Die Kopie (z. B. als ZIP) weitergeben, zusammen mit dieser Anleitung.

---

## 6. Auf eine neue Version aktualisieren

1. StudyForge beenden und zur Sicherheit ein **ZIP-Backup** erstellen.
2. Die neuen Programmdateien über den alten Ordner kopieren – **den Ordner
   `data/` dabei behalten**.
3. Setup erneut ausführen (`setup.cmd` bzw. `sh setup.sh`) und StudyForge
   starten.

Braucht die neue Version eine geänderte Datenbank, passt StudyForge sie beim
ersten Start automatisch an und legt vorher eine geprüfte Sicherung in
`data/backups/` an. Welche Version läuft, steht unter *Sichern &
Einstellungen*; was sich geändert hat, in `CHANGELOG.md`.

---

## 7. USB-Stick

StudyForge läuft komplett vom USB-Stick: Ordner auf den Stick kopieren und dort
einmal das Setup ausführen. Die portable Node-Version liegt dann ebenfalls auf
dem Stick (`runtime/node`), die Daten in `data/`. Auf einem anderen Rechner
einfach `start.cmd` bzw. `./start.sh` vom Stick aufrufen – beim Wechsel
zwischen Windows und Linux dort einmal das jeweilige Setup ausführen.

---

## 8. Probleme lösen

| Problem | Lösung |
| --- | --- |
| „Node.js wurde nicht gefunden“ oder „zu alt“ | Setup ausführen (`setup.cmd` bzw. `sh setup.sh`) und das Herunterladen bestätigen. |
| Windows: Sicherheitswarnung beim Doppelklick | „Weitere Informationen“ → „Trotzdem ausführen“ bzw. „Ausführen“. Tritt bei Dateien aus dem Internet auf. |
| Linux: „Keine Berechtigung“ bei `./start.sh` | `sh start.sh` verwenden oder einmal `sh setup.sh` ausführen (macht die Skripte ausführbar). |
| Download im Setup schlägt fehl | Internetverbindung prüfen (nur das Setup braucht Internet). Alternativ Node.js 22 LTS selbst von nodejs.org installieren und das Setup erneut starten. |
| „Prüfsumme stimmt NICHT überein“ | Die heruntergeladene Datei war beschädigt oder verändert und wurde verworfen. Setup später erneut ausführen. |
| Port 4173 belegt | StudyForge nimmt automatisch den nächsten freien Port – die Adresse steht im Startfenster. Läuft StudyForge schon? Dann einfach den Browser öffnen. |
| Browser zeigt „Seite nicht erreichbar“ | Läuft das Startfenster noch? Sonst StudyForge neu starten. |
| Datenordner nicht beschreibbar | StudyForge an einen Ort mit Schreibrechten kopieren (z. B. Dokumente), nicht nach „Programme“. |

Die Prüfliste aus dem Setup kannst du jederzeit erneut aufrufen – einfach das
Setup noch einmal ausführen.

---

## 9. Entfernen

1. StudyForge beenden. Wenn du deine Daten behalten möchtest, vorher ein
   ZIP-Backup erstellen.
2. Den Ordner `StudyForge` löschen.
3. Falls angelegt: die Desktop-Verknüpfung „StudyForge“ (Windows) bzw. die
   Datei `~/.local/share/applications/studyforge.desktop` (Linux) löschen.

Am System wurde sonst nichts verändert.

---

## Datenschutz in Kürze

StudyForge sendet nichts ins Internet, hat keine Werbung, keine Telemetrie und
kein Konto. Der eingebaute Server ist nur auf deinem eigenen Rechner erreichbar
(127.0.0.1), nicht im Netzwerk. Internet braucht nur das Setup, und nur dann,
wenn es Node.js herunterladen soll.
