#!/usr/bin/env sh
# StudyForge – Einrichtung für Linux (und macOS)
# Aufruf im Terminal:  ./setup.sh   (oder: sh setup.sh)
#
# Was passiert:
#  1. Prüfen, ob Node.js 22.5 oder neuer vorhanden ist.
#  2. Falls nicht: nach Rückfrage eine portable Node-Version von nodejs.org
#     in den Projektordner (runtime/node) laden – ohne Administratorrechte,
#     mit Prüfung der SHA-256-Prüfsumme.
#  3. Start-/Stoppskripte ausführbar machen.
#  4. Optional einen Starter im Anwendungsmenü anlegen (Linux).
#  5. Einrichtung prüfen.
# Es werden keine Systemdateien verändert und keine Daten gelöscht.
#
# Optionen:
#   --yes        alle Rückfragen mit Ja beantworten
#   --no-menu    keinen Menü-Starter anlegen
#   --test       zusätzlich die automatischen Tests ausführen (dauert ca. 1–2 Minuten)

cd "$(dirname "$0")" || exit 1
ROOT=$(pwd)

NODE_VERSION="22.23.3"            # getestete LTS-Version
RUNTIME_DIR="${STUDYFORGE_RUNTIME_DIR:-$ROOT/runtime/node}"

YES=0
MENU=1
RUN_TESTS=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=1 ;;
    --no-menu) MENU=0 ;;
    --test) RUN_TESTS=1 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unbekannte Option: $arg (Hilfe: ./setup.sh --help)"; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
ask() {
  # ask "Frage" → 0 bei Ja
  if [ "$YES" -eq 1 ]; then return 0; fi
  if [ ! -t 0 ]; then return 1; fi
  printf '%s [j/N] ' "$1"
  read -r answer
  case "$answer" in j|J|ja|Ja|JA|y|Y|yes) return 0 ;; *) return 1 ;; esac
}

node_ok() {
  # node_ok <node-binary> → 0, wenn Version >= 22.5
  "$1" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)' 2>/dev/null
}

say "=============================================="
say " StudyForge – Einrichtung"
say "=============================================="
say ""

# ------------------------------------------------------------ 1. Node.js suchen
NODE=""
for candidate in "$RUNTIME_DIR/bin/node" "$HOME/.local/share/node/current/bin/node" "$(command -v node 2>/dev/null)"; do
  [ -n "$candidate" ] && [ -x "$candidate" ] || continue
  if node_ok "$candidate"; then NODE="$candidate"; break; fi
  say "Gefunden, aber zu alt: $candidate ($("$candidate" -v 2>/dev/null))"
done

# ------------------------------------------------------------ 2. ggf. portable Node laden
if [ -z "$NODE" ]; then
  say "Node.js 22.5 oder neuer wurde nicht gefunden."
  say ""
  case "$(uname -s)" in
    Linux) OS=linux; EXT=tar.xz ;;
    Darwin) OS=darwin; EXT=tar.gz ;;
    *) say "Betriebssystem $(uname -s) wird vom Setup nicht unterstützt. Bitte Node.js ${NODE_VERSION} von nodejs.org installieren."; exit 1 ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) ARCH=x64 ;;
    aarch64|arm64) ARCH=arm64 ;;
    *) say "Prozessorarchitektur $(uname -m) wird vom Setup nicht unterstützt. Bitte Node.js ${NODE_VERSION} von nodejs.org installieren."; exit 1 ;;
  esac
  NAME="node-v${NODE_VERSION}-${OS}-${ARCH}"
  BASE="https://nodejs.org/dist/v${NODE_VERSION}"
  say "Das Setup kann eine portable Node.js-Version laden:"
  say "  Quelle: ${BASE}/${NAME}.${EXT}  (ca. 25–50 MB)"
  say "  Ziel:   ${RUNTIME_DIR}"
  say "  Keine Administratorrechte nötig; nur dieser Schritt braucht Internet."
  say ""
  if ! ask "Jetzt herunterladen?"; then
    say ""
    say "Abgebrochen. Alternativ Node.js ${NODE_VERSION} (oder neuer, mindestens 22.5) selbst"
    say "installieren und ./setup.sh erneut ausführen. Anleitung: ANLEITUNG.md"
    exit 1
  fi

  if command -v curl >/dev/null 2>&1; then
    fetch() { curl -fL --progress-bar -o "$2" "$1"; }
  elif command -v wget >/dev/null 2>&1; then
    fetch() { wget -q --show-progress -O "$2" "$1"; }
  else
    say "Weder curl noch wget gefunden – Download nicht möglich."
    exit 1
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha() { sha256sum "$1" | cut -d' ' -f1; }
  elif command -v shasum >/dev/null 2>&1; then
    sha() { shasum -a 256 "$1" | cut -d' ' -f1; }
  else
    say "Kein sha256sum/shasum gefunden – die Prüfsumme kann nicht kontrolliert werden. Abbruch."
    exit 1
  fi

  TMP=$(mktemp -d 2>/dev/null || mktemp -d -t studyforge)
  trap 'rm -rf "$TMP"' EXIT INT TERM
  say ""
  say "Lade ${NAME}.${EXT} …"
  fetch "${BASE}/${NAME}.${EXT}" "$TMP/node.${EXT}" || { say "Download fehlgeschlagen."; exit 1; }
  fetch "${BASE}/SHASUMS256.txt" "$TMP/SHASUMS256.txt" || { say "Prüfsummenliste konnte nicht geladen werden."; exit 1; }
  EXPECTED=$(grep " ${NAME}.${EXT}\$" "$TMP/SHASUMS256.txt" | cut -d' ' -f1)
  ACTUAL=$(sha "$TMP/node.${EXT}")
  if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
    say "Prüfsumme stimmt NICHT überein – die Datei wird nicht verwendet."
    say "  erwartet: ${EXPECTED:-unbekannt}"
    say "  erhalten: $ACTUAL"
    exit 1
  fi
  say "Prüfsumme in Ordnung (SHA-256 ${ACTUAL})."

  mkdir -p "$TMP/x"
  if [ "$EXT" = "tar.xz" ]; then tar -xJf "$TMP/node.${EXT}" -C "$TMP/x" || exit 1
  else tar -xzf "$TMP/node.${EXT}" -C "$TMP/x" || exit 1; fi
  if [ -e "$RUNTIME_DIR" ]; then
    OLD="${RUNTIME_DIR}.alt-$(date +%Y%m%d%H%M%S)"
    mv "$RUNTIME_DIR" "$OLD" && say "Vorhandene Version verschoben nach: $OLD"
  fi
  mkdir -p "$(dirname "$RUNTIME_DIR")"
  mv "$TMP/x/${NAME}" "$RUNTIME_DIR" || exit 1
  NODE="$RUNTIME_DIR/bin/node"
  node_ok "$NODE" || { say "Die geladene Node-Version startet nicht."; exit 1; }
  say "Portable Node.js installiert: $NODE"
fi

say "Node.js: $NODE ($("$NODE" -v))"
say ""

# ------------------------------------------------------------ 3. Skripte ausführbar
chmod +x start.sh stop.sh setup.sh 2>/dev/null && say "Start-/Stoppskripte sind ausführbar."

# ------------------------------------------------------------ 4. Menü-Starter (Linux)
if [ "$MENU" -eq 1 ] && [ "$(uname -s)" = "Linux" ]; then
  APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  DESKTOP="$APPS/studyforge.desktop"
  say ""
  if ask "Starter „StudyForge“ im Anwendungsmenü anlegen?"; then
    mkdir -p "$APPS"
    cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=StudyForge
Comment=Persönliches Lernzentrum (lokal, offline)
Exec=sh "$ROOT/start.sh"
Path=$ROOT
Icon=$ROOT/public/icons/apple-touch-icon.png
Terminal=true
Categories=Education;
EOF
    chmod +x "$DESKTOP"
    say "Starter angelegt: $DESKTOP"
    say "(Das Terminalfenster bleibt offen, solange StudyForge läuft – Schließen beendet StudyForge.)"
  fi
fi

# ------------------------------------------------------------ 5. Prüfen
say ""
"$NODE" --disable-warning=ExperimentalWarning scripts/setup-check.js || exit 1

if [ "$RUN_TESTS" -eq 1 ]; then
  say ""
  say "Automatische Tests laufen …"
  OUT=$("$NODE" --disable-warning=ExperimentalWarning --test "test/*.test.js" 2>&1)
  printf '%s\n' "$OUT" | grep -E '^# (tests|pass|fail)'
  printf '%s\n' "$OUT" | grep -q '^# fail 0$' || { say "Mindestens ein Test ist fehlgeschlagen."; exit 1; }
fi

say ""
say "Fertig. StudyForge starten mit:   ./start.sh"
say "Beenden mit Strg+C oder:         ./stop.sh"
say "Anleitung: ANLEITUNG.md"
