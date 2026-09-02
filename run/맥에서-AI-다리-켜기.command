#!/bin/bash
# 더블클릭으로 실행됩니다. 처음 한 번은 "실행 권한"이 필요할 수 있습니다:
#   chmod +x 맥에서-클로드-다리-켜기.command
cd "$(dirname "$0")/.."
python3 tools/ai-bridge.py "$@"
read -n 1 -s
