#!/usr/bin/env bash
# Regenerates public/og-image.png (1200x630) and public/twitter-card.png (1200x600).
# Needs: npm ci (for the font files) and google-chrome.
set -euo pipefail
cd "$(dirname "$0")"
OUT=../../public
shot() { # name width height
  sed "s/<div class=\"card\" id=\"card\">/<div class=\"card\" id=\"card\" style=\"--h:${3}px\">/" social.html > ".tmp-$1.html"
  google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --virtual-time-budget=4000 --window-size="$2,$3" --screenshot="$OUT/$1.png" "file://$PWD/.tmp-$1.html" >/dev/null 2>&1
  rm -f ".tmp-$1.html"
}
shot og-image 1200 630
shot twitter-card 1200 600
