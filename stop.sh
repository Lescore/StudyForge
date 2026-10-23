#!/usr/bin/env sh
# StudyForge – sauber beenden (Linux Mint / Debian)
# Im Terminal: ./stop.sh   (oder: sh stop.sh)
# Anderer Datenordner als beim Standardstart: ./stop.sh --data-dir /pfad/zu/daten
cd "$(dirname "$0")" || exit 1

# Dieselbe Node-Version wie start.sh verwenden (portable Version bevorzugt).
if [ -x "runtime/node/bin/node" ]; then
  PATH="$(pwd)/runtime/node/bin:$PATH"
  export PATH
elif [ -x "$HOME/.local/share/node/current/bin/node" ]; then
  PATH="$HOME/.local/share/node/current/bin:$PATH"
  export PATH
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js wurde nicht gefunden. StudyForge kann auch mit Strg+C im Startfenster beendet werden."
  exit 1
fi

exec node --disable-warning=ExperimentalWarning scripts/stop.js "$@"
