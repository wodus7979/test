#!/bin/bash
# 게임 속 동료를 이 컴퓨터의 Claude Code 에 이어 준다.
# 게임을 켜기 전이든 후든 상관없다. 이 창은 켜 둔 채로 두면 된다.
cd "$(dirname "$0")/.."
exec python3 tools/claude-bridge.py "$@"
