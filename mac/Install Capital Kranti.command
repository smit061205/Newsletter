#!/bin/bash
# Capital Kranti setup: double-click this file (it opens in Terminal).
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$HERE/install.sh" ]; then
  bash "$HERE/install.sh"
else
  curl -fsSL https://raw.githubusercontent.com/smit061205/Newsletter/main/mac/install.sh -o /tmp/ck-install.sh && bash /tmp/ck-install.sh
fi
echo; read -r -p "Press Return to close."
