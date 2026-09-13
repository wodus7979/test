#!/usr/bin/env bash
# Unity 를 배치 모드로 열어 스크립트·셰이더 컴파일 에러만 확인한다 (Play 는 하지 않는다).
# 사용: SniperRidge/Tools/unity_compile_check.sh            (Unity 경로 자동 탐색)
#       UNITY=/path/to/Unity SniperRidge/Tools/unity_compile_check.sh
# 종료 코드 0 = 에러 없음, 1 = 컴파일 에러, 2 = Unity 실행 파일을 못 찾음.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(sed -n 's/^m_EditorVersion: //p' "$HERE/ProjectSettings/ProjectVersion.txt" | tr -d '\r')"
LOG="$HERE/Logs/compile_check.log"
mkdir -p "$HERE/Logs"

find_unity() {
  if [ -n "${UNITY:-}" ] && [ -x "$UNITY" ]; then echo "$UNITY"; return; fi
  for c in \
    "/Applications/Unity/Hub/Editor/$VERSION/Unity.app/Contents/MacOS/Unity" \
    "$HOME/Unity/Hub/Editor/$VERSION/Editor/Unity" \
    "/opt/unity/editors/$VERSION/Editor/Unity" \
    "/c/Program Files/Unity/Hub/Editor/$VERSION/Editor/Unity.exe" \
    "/mnt/c/Program Files/Unity/Hub/Editor/$VERSION/Editor/Unity.exe"; do
    [ -x "$c" ] && { echo "$c"; return; }
  done
  # 같은 메이저 버전 아무거나
  for d in /Applications/Unity/Hub/Editor/* "$HOME/Unity/Hub/Editor"/*; do
    [ -x "$d/Unity.app/Contents/MacOS/Unity" ] && { echo "$d/Unity.app/Contents/MacOS/Unity"; return; }
    [ -x "$d/Editor/Unity" ] && { echo "$d/Editor/Unity"; return; }
  done
}

UNITY_BIN="$(find_unity)"
if [ -z "$UNITY_BIN" ]; then
  echo "Unity $VERSION 실행 파일을 찾지 못했습니다. UNITY=경로 로 지정하세요." >&2
  exit 2
fi
echo "Unity: $UNITY_BIN"
echo "프로젝트: $HERE"
echo "로그: $LOG"

# Unity 가 이미 이 프로젝트를 열고 있으면 배치 모드가 잠금 때문에 실패한다.
if [ -f "$HERE/Temp/UnityLockfile" ]; then
  echo "경고: Temp/UnityLockfile 이 있습니다. Unity 에디터가 이 프로젝트를 열고 있으면 먼저 닫으세요." >&2
fi

"$UNITY_BIN" -batchmode -quit -nographics -projectPath "$HERE" -logFile "$LOG" >/dev/null 2>&1
CODE=$?

echo "----- 컴파일 에러 -----"
grep -nE "error CS[0-9]+|Shader error|: error|Assertion failed|Exception:" "$LOG" | grep -v "Compilation failed: " | head -60
ERRORS=$(grep -cE "error CS[0-9]+|Shader error" "$LOG")
echo "----- 경고 (참고) -----"
grep -nE "warning CS[0-9]+|Shader warning" "$LOG" | head -20
echo "-----------------------"
echo "Unity 종료 코드: $CODE, 에러 수: $ERRORS"
if [ "$ERRORS" -gt 0 ]; then exit 1; fi
exit 0
