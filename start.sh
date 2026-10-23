#!/usr/bin/env sh
# StudyForge – Starthelfer für Linux Mint / Debian
# Im Terminal starten: ./start.sh   (oder: sh start.sh)
cd "$(dirname "$0")" || exit 1

# Portable Node-Version bevorzugen: zuerst im Projekt (runtime/node, von setup.sh),
# dann im Home-Verzeichnis (falls vorhanden)
if [ -x "runtime/node/bin/node" ]; then
  PATH="$(pwd)/runtime/node/bin:$PATH"
  export PATH
elif [ -x "$HOME/.local/share/node/current/bin/node" ]; then
  PATH="$HOME/.local/share/node/current/bin:$PATH"
  export PATH
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js wurde nicht gefunden."
  echo "StudyForge benötigt Node.js 22.5 oder neuer (LTS-Version von https://nodejs.org/)."
  echo "Eine Installation als Administrator ist nicht nötig; eine portable Node-Version genügt."
  echo "Am einfachsten: ./setup.sh ausführen – es lädt bei Bedarf eine portable Version."
  echo "Alternativ den Pfad zur portablen Node-Version vor dem Start ergänzen:"
  echo "  PATH=\"/pfad/zu/node/bin:\$PATH\" ./start.sh"
  exit 1
fi

NODE_VER=$(node -p 'process.versions.node' 2>/dev/null || node -v | tr -d v)
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
NODE_MINOR=$(echo "$NODE_VER" | cut -d. -f2)
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 5 ]; }; then
  echo "Gefundene Node.js-Version $NODE_VER ist zu alt ($(command -v node))."
  echo "StudyForge benötigt Node.js 22.5 oder neuer."
  echo "Am einfachsten: ./setup.sh ausführen – es lädt bei Bedarf eine portable Version."
  exit 1
fi

exec node --disable-warning=ExperimentalWarning scripts/start.js "$@"
