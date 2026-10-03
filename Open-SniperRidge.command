#!/bin/zsh
set -eu
GAME_REPO_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
GAME_UNITY_APP="/Applications/Unity/Hub/Editor/2022.3.62f3/Unity.app"
if [[ ! -d "$GAME_UNITY_APP" ]]; then
  print "Unity Hub에서 Unity 2022.3.62f3를 설치한 뒤 다시 실행하세요."
  print "또는 Unity Hub > Add에서 ${GAME_REPO_DIR}/SniperRidge 폴더를 선택하세요."
  read -r "?Enter를 누르면 닫힙니다. "
  exit 1
fi
open -a "$GAME_UNITY_APP" --args -projectPath "$GAME_REPO_DIR/SniperRidge" -executeMethod SniperRidge.EditorTools.SniperRidgeSetup.OpenGameScene
