#!/bin/bash
# Capital Kranti -- setup for a Mac. Run by "Install Capital Kranti.command".
# Safe to run again: it updates what's there.
#
#  1. Node.js 22 and Git (asks before installing either)
#  2. the app in ~/Library/Application Support/CapitalKranti (a copy from GitHub)
#  3. its parts: npm packages, the Chromium the engine lays pages out with
#  4. the paper's Gopika fonts, from a folder you choose
#  5. a GitHub sign-in, for the newsroom's Publish button
#  6. the newsroom website, built for this Mac
#  7. "Capital Kranti" in Applications
#  8. start at log-in, and wake the Mac at 7:55 PM for the 8 PM run
set -euo pipefail
REPO="https://github.com/smit061205/Newsletter.git"
APP="$HOME/Library/Application Support/CapitalKranti"
say() { printf '\n\033[1;36m== %s\033[0m\n' "$1"; }
ask() { read -r -p "$1 [y/N] " a; [[ "$a" =~ ^[Yy] ]]; }

say "1/8  Node.js and Git"
node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)'; }
if ! node_ok; then
  if command -v brew >/dev/null; then
    ask "Node.js 22 is needed. Install it with Homebrew?" && brew install node@22 && brew link --overwrite --force node@22
  else
    echo "Node.js 22 is needed. Opening its download page: install the macOS Installer (.pkg), then run this again."
    open "https://nodejs.org/en/download"
    exit 1
  fi
fi
if ! command -v git >/dev/null || ! git --version >/dev/null 2>&1; then
  echo "Git is needed: macOS will offer to install its command-line tools. Accept, then run this again."
  xcode-select --install || true
  exit 1
fi
node -v; git --version

say "2/8  The app ($APP)"
if [ -d "$APP/.git" ]; then git -C "$APP" pull --ff-only; else git clone "$REPO" "$APP"; fi
cd "$APP"
git config user.name >/dev/null || git config user.name "Capital Kranti newsroom"
git config user.email >/dev/null || git config user.email "newsroom@capitalkranti.in"

say "3/8  Its parts (a few minutes the first time)"
npm ci --no-audit --no-fund
npx playwright install chromium

say "4/8  The paper's fonts"
if [ ! -f publications/capital-kranti/fonts/gopika-two-regular.ttf ]; then
  DIR=$(osascript -e 'POSIX path of (choose folder with prompt "Choose the folder with the Gopika fonts (B Bharati GopikaTwo Normal, Bold, BoldItalic, GopikalightTwo)")') \
    || { echo "No font folder chosen: run this again when you have the Gopika fonts."; exit 1; }
  node scripts/install-fonts.mjs "$DIR"
else echo "  already installed"; fi

say "5/8  GitHub sign-in (for the Publish button)"
if command -v gh >/dev/null; then
  gh auth status >/dev/null 2>&1 || gh auth login --web --git-protocol https
  gh auth setup-git
else
  echo "  The first Publish will ask you to sign in to GitHub (in the browser or with a token)."
fi

say "6/8  The newsroom website"
npm run build --prefix web

say "7/8  Capital Kranti in Applications"
BUNDLE="$HOME/Applications/Capital Kranti.app"
mkdir -p "$BUNDLE/Contents/MacOS" "$BUNDLE/Contents/Resources"
cat > "$BUNDLE/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Capital Kranti</string>
  <key>CFBundleDisplayName</key><string>Capital Kranti</string>
  <key>CFBundleIdentifier</key><string>in.capitalkranti.newsroom</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>capital-kranti</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSUIElement</key><true/>
</dict></plist>
PLIST
cp mac/launch.sh "$BUNDLE/Contents/MacOS/capital-kranti"
chmod +x "$BUNDLE/Contents/MacOS/capital-kranti"
ICONSET=$(mktemp -d)/icon.iconset; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s mac/icon-1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) mac/icon-1024.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$BUNDLE/Contents/Resources/icon.icns"
touch "$BUNDLE"

say "8/8  Start at log-in, and the 8 PM run"
AGENT="$HOME/Library/LaunchAgents/in.capitalkranti.newsroom.plist"
mkdir -p "$(dirname "$AGENT")"
cat > "$AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>in.capitalkranti.newsroom</string>
  <key>ProgramArguments</key><array><string>$BUNDLE/Contents/MacOS/capital-kranti</string><string>--background</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>19</integer><key>Minute</key><integer>56</integer></dict>
</dict></plist>
PLIST
launchctl bootout "gui/$(id -u)/in.capitalkranti.newsroom" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$AGENT"
echo "  To wake the Mac at 7:55 PM every day, macOS needs your password once:"
sudo pmset repeat wakeorpoweron MTWRFSU 19:55:00 || echo "  Skipped: keep the Mac awake in the evening instead."

say "Done. Opening the newsroom..."
open "$BUNDLE"
printf '\n\033[1;32mFrom now on, open "Capital Kranti" from Applications.\nIn the newsroom, go to Settings and paste the OpenRouter key once.\033[0m\n'
