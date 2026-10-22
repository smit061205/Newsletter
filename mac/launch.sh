#!/bin/bash
# The "Capital Kranti" app (Applications): starts the engine and the newsroom
# (scripts/launch.mjs) and opens the newsroom. --background: don't open it.
APP="$HOME/Library/Application Support/CapitalKranti"
[ -d "$APP" ] || APP="$(cd "$(dirname "$0")/.." && pwd)" # run from inside the project
export PATH="/opt/homebrew/bin:/usr/local/bin:/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:$PATH"
mkdir -p "$APP/logs"
cd "$APP" && node scripts/launch.mjs "$@" >> "$APP/logs/launcher.log" 2>&1 \
  || osascript -e "display alert \"Capital Kranti couldn't start\" message \"The details are in $APP/logs.\""
