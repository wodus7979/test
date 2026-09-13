# Sniper Ridge 작업 안내 (Claude Code 용)

이 저장소의 Unity 프로젝트는 `SniperRidge/` 폴더다 (Unity 2022.3.62f3, 내장 렌더 파이프라인, 씬·프리팹 없이 C# 이 실행 시 모든 것을 생성).
사용자와는 **한국어**로 대화한다. 상세한 작업 이력과 미확인 항목은 `SniperRidge/Docs/HANDOFF.md` 를 먼저 읽는다.

## 역할 분담과 브랜치
- **Codex** 가 `codex/urban-fps` 브랜치에 게임 규칙, 맵, 에셋을 올린다.
- **Claude** 는 `claude/compassionate-meitner-qvr8kt` 브랜치에서 화질·렌더링·효과를 맡는다. 이 브랜치에서 작업하고 이 브랜치로만 푸시한다.
- 사용자가 "코덱스 합쳐줘"라고 하면 `git fetch origin && git merge origin/codex/urban-fps` 로 합친다. 충돌은 게임 규칙·맵·조명 연출은 Codex 쪽, 후처리·지형 셰이더·파티클·표면 재질·그림자 설정은 Claude 쪽을 유지하는 방향으로 푼다. README 충돌은 양쪽 섹션을 모두 남긴다.
- 커밋 메시지는 한국어, 첫 줄에 요약. 변경마다 `SniperRidge/README.md` 맨 위 "사실적인 밀리터리 톤 화질 개선" 섹션에 항목을 추가한다 (Codex 도 같은 방식으로 README 를 쓴다).
- `.meta` 파일은 저장소에 **있다** (426개 추적 중). 새 스크립트·셰이더를 만들면 Unity 가 생성한 `.meta` 도 함께 커밋한다 (2026-09-13 확인: 클라우드 세션이 만든 파일 4개의 .meta 가 빠져 있어 로컬에서 추가했다). `Library/`, `Temp/`, `Logs/`, `Screenshots/` 는 커밋하지 않는다.

## 이 PC(Mac mini) 에서 테스트하는 방법
1. Unity 에디터가 열려 있으면 닫는다 (배치 모드는 프로젝트 잠금 때문에 실패한다).
2. 컴파일 검사: `SniperRidge/Tools/unity_compile_check.sh` → 에러는 `SniperRidge/Logs/compile_check.log`. Unity 경로를 못 찾으면 `UNITY=/Applications/Unity/Hub/Editor/2022.3.62f3/Unity.app/Contents/MacOS/Unity` 로 지정. **주의:** 이 검사는 `-nographics` 라 C# 에러는 잡지만 Metal 셰이더 컴파일 에러는 못 잡는다 (CombatParticles 의 `unityFogFactor` 재정의 에러가 그렇게 빠져나갔다). 셰이더는 아래 자동 실행으로 실제 화면을 봐야 한다.
2-1. **키를 누를 수 없는 세션(백그라운드 제어)** 에서는 `Assets/Editor/SniperRidgeAutoPlay.cs` 를 쓴다. Unity 에디터가 열린 상태에서 `SniperRidge/Logs/autoplay.txt` 에 `mode=9` `wait=10` `explosion=1` `tag=city` 같은 줄을 쓰면 1초 안에 Unity 가 스스로 Play → 모드 선택·출전 → `Screenshots/auto_<tag>_on.png`(후처리 켬) / `_off.png`(끔) 저장 → Play 종료를 하고 `Logs/autoplay_result.txt` 에 런타임 에러 목록을 남긴다. mode 번호는 시작 메뉴 행(8 K2 전차, 9 도시 FPS). 스크립트를 고친 뒤에는 메뉴 Assets > Refresh 로 먼저 컴파일시키고, 컴파일이 끝난 뒤 요청 파일을 쓴다 (Play 중 도메인 리로드가 겹치면 정적 변수가 초기화돼 가짜 NullReference 가 잔뜩 찍힌다).
3. 화면 확인: Unity 를 열고 Play. 시작 메뉴에서 숫자키로 모드 선택 후 Enter (0 도시 FPS, 8 헬기, 9 전차전 등, README 참고).
4. Play 중 디버그 키: **P** 후처리 전체 끄고 켜기(전후 비교), **O** SSAO 끄고 켜기, **L** 진단 모드 순환(태양 그림자 끔 → 지형 노멀맵 켬 → 지형 풀/나무 끔), **K** 스크린샷을 `SniperRidge/Screenshots/` 에 저장 (파일명에 on/off 와 진단 번호가 붙는다). 스크린샷은 Read 로 직접 읽어 확인한다.
5. 게임 조작: WASD 이동, 마우스 조준, 좌클릭 사격, 우클릭 조준, R 장전, G 수류탄, 1~4 무기, Tab 지도, Esc 커서.

## Claude 가 만든 핵심 파일 (건드릴 때 주의)
- `Assets/Scripts/Util/PostEffect.cs` + `Assets/Shaders/SniperRidgePost.shader`: SSAO, 블룸, ACES, 감마 공간 색보정, 샤프닝, 그레인, 프리셋(DaylightField / EveningTown), 디버그 키.
- `Assets/Scripts/Util/SurfaceDetail.cs`: 코드 생성 디테일 노멀/알베도로 단색 재질에 표면 질감. 7종(Fabric, PaintedMetal, Steel, Rubber, Wood, Polymer, Skin).
- `Assets/Scripts/Util/CombatVfx.cs` + `Assets/Resources/Shaders/CombatParticles.shader`: 폭발, 총구 화염, 탄착, 예광탄 스타일, 카메라 흔들림, 감쇠 조명.
- `Assets/Shaders/SniperRidgeTerrainMatte.shader` + `TerrainGenerator.ApplyMatteMaterial`: 반사광 없는 지형 셰이더 (바닥 반짝임 제거). 컴파일 실패 시 `Nature/Terrain/Diffuse` 로 자동 대체.
- `Assets/Scripts/Core/LevelBuilder.cs` 의 `SetupLighting`/`BuildPlayer`: 품질 티어, 그림자(StableFit, bias .05/.6), 카메라 구성.
- `Assets/Editor/SniperRidgeSetup.cs` 의 항상 포함 셰이더 목록에 새 셰이더를 등록해야 빌드에 들어간다.

## 지켜야 할 것
- 색보정은 반드시 감마(지각) 공간에서 한다. 선형 공간에서 대비/그레인을 걸면 그림자가 검게 눌린다 (이미 한 번 겪었다).
- 지형 레이어의 `normalScale` 은 0 으로 둔다. 낮은 태양에서 지형 노멀맵이 바닥 전체를 반짝이게 했다 (L 키 진단으로 확인된 사실).
- MonoBehaviour 의 필드 초기화에서 `new NavMeshPath()`, `new MaterialPropertyBlock()`, `new Material()` 을 만들면 Unity 가 예외를 내고 필드가 null 로 남아 Update 마다 NullReference 가 쏟아진다. 반드시 Awake/Start 에서 만든다 (Codex 코드 세 곳을 이렇게 고쳤다).
- 서로 다른 UNITY_APPLY_FOG 매크로를 한 함수 범위에서 두 번 쓰면 Metal 에서 `unityFogFactor` 재정의 에러가 난다. 각각 `{ }` 블록으로 감싼다.
- 셰이더 프로퍼티를 C# 에서 추가하면 셰이더 선언과 이름을 맞춘다. Unity 없이 작업할 때는 괄호 균형과 프로퍼티 이름 대조를 스크립트로 검사했다.
- 큰 방향 전환(URP 이전, Unity 6 업그레이드)은 사용자가 결정한다. 제안만 하고 진행하지 않는다.
