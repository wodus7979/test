#!/bin/bash
cd "$(dirname "$0")/.."

echo
echo "  WebCraft 를 시작합니다."
echo

open_url() {
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$1"
  elif command -v gio >/dev/null 2>&1; then gio open "$1"
  else echo "  브라우저를 자동으로 열 수 없습니다. 직접 열어 주세요: $1"; fi
}

if [ -f "dist/minecraft.html" ]; then
  echo "  dist/minecraft.html 을 기본 브라우저로 엽니다."
  open_url "file://$(pwd)/dist/minecraft.html"
  exit 0
fi

if command -v python3 >/dev/null 2>&1; then
  echo "  로컬 서버를 8123 포트로 띄웁니다. Ctrl+C 로 멈춥니다."
  (sleep 1 && open_url "http://localhost:8123/index.html") &
  python3 -m http.server 8123 --directory web
  exit 0
fi

echo "  python3 을 찾을 수 없습니다. dist/minecraft.html 을 직접 열어 주세요."
