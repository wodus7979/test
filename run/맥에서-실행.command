#!/bin/bash
# 더블클릭으로 실행됩니다. 처음 한 번은 "실행 권한"이 필요할 수 있습니다:
#   chmod +x 맥에서-실행.command
cd "$(dirname "$0")/.."

echo
echo "  WebCraft 를 시작합니다."
echo

if [ -f "dist/minecraft.html" ]; then
  echo "  dist/minecraft.html 을 기본 브라우저로 엽니다."
  open "dist/minecraft.html"
  sleep 2
  exit 0
fi

if command -v python3 >/dev/null 2>&1; then
  echo "  로컬 서버를 8123 포트로 띄웁니다. 이 창을 닫으면 서버가 멈춥니다."
  (sleep 1 && open "http://localhost:8123/index.html") &
  python3 -m http.server 8123 --directory web
  exit 0
fi

echo "  python3 을 찾을 수 없습니다. dist/minecraft.html 을 더블클릭해 주세요."
read -n 1 -s
