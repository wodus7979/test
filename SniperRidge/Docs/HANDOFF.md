# 인수인계: 클라우드 세션 → Mac mini 로컬 세션 (2026-09-13)

이 문서는 웹(클라우드) Claude Code 세션에서 진행한 화질·효과 작업을 Unity 가 설치된 Mac mini 의 로컬 세션이 이어받기 위한 것이다.
클라우드 세션에는 Unity 가 없어 **Unity 컴파일, 셰이더 컴파일, 실제 화면은 한 번도 실행 검증하지 못했다.** 로컬 세션의 첫 일은 그 검증이다.

## 현재 상태
- 작업 브랜치: `claude/compassionate-meitner-qvr8kt` (Codex 의 `codex/urban-fps` 최신 커밋 `d689be2` 까지 병합됨).
- 사용자가 실제로 확인한 것: 도시 FPS 와 전차 협곡의 스크린샷으로 (1) 초기 색보정이 너무 어둡던 문제를 감마 공간 색보정으로 고쳤고, (2) 바닥 반짝임의 원인이 지형 노멀맵임을 L 키 진단으로 확정해 노멀 강도 0 으로 고쳤다.
- 사용자가 아직 확인하지 않은 것: 광택 없는 지형 셰이더(TerrainMatte), 전투 효과(CombatVfx, CombatParticles 셰이더), Codex 의 새 가을 언덕 전차 전장과 그 조명.

## 로컬 세션이 먼저 할 일 (순서대로)
1. `git status` 로 브랜치가 `claude/compassionate-meitner-qvr8kt` 인지, `git pull` 로 최신인지 확인.
2. Unity 에디터를 닫은 상태에서 `SniperRidge/Tools/unity_compile_check.sh` 실행. 에러가 있으면 `SniperRidge/Logs/compile_check.log` 를 읽고 고친다. 의심 순위:
   - `Assets/Shaders/SniperRidgeTerrainMatte.shader`: 서피스 셰이더에 커스텀 라이팅 함수(`LightingMatteTerrain`, `LightingMatteTerrain_GI`) 와 `TerrainSplatmapCommon.cginc` 조합. 실패하면 런타임이 `Nature/Terrain/Diffuse` 로 대체하므로 화면은 나오지만, 협곡 색 보정(diffuseRemap) 이 무시될 수 있다 (Codex 가 최근 색을 텍스처에 굽는 방식으로 바꿔 영향은 작다).
   - `Assets/Resources/Shaders/CombatParticles.shader`: `Blend [_SrcBlend] [_DstBlend]`, `multi_compile_particles` 소프트 파티클.
   - `Assets/Scripts/Util/CombatVfx.cs`: `ParticleSystem.EmitParams` 사용, `CameraShake` 의 `OnPreCull/OnPostRender`.
   - `Assets/Shaders/SniperRidgePost.shader`: 전역 `static const` 배열, `LinearToGammaSpace`/`GammaToLinearSpace`.
3. Unity 를 열어 Play. 전차전(9번)과 도시 FPS(0번) 에서 K 키로 스크린샷을 찍고 Read 로 읽어 확인:
   - 지형 바닥에 미세한 반짝임과 태양 방향의 넓은 반사 얼룩이 없어야 한다.
   - 소총 사격 시 총구에 섬광·화염 줄기·연기가 보이고, 예광탄이 꼬리가 투명한 밝은 선이어야 한다.
   - 수류탄(G)·로켓(4번 무기) 폭발이 섬광 → 화염구 → 연기 기둥 + 지면 먼지 링 + 불티 + 파편으로 보이고 화면이 잠깐 흔들려야 한다.
   - 파티클이 분홍색 사각형이면 셰이더 컴파일 실패다. Console 의 셰이더 에러를 본다.
   - P 키로 후처리를 껐다 켜서 켠 쪽이 밝기는 비슷하고 톤만 다른지 본다. 켠 쪽이 훨씬 어두우면 색보정 문제다.
4. 고친 것은 같은 브랜치에 커밋·푸시하고 README 맨 위 섹션에 한 줄 추가.

## 2026-09-13 로컬(Mac mini) 검증 결과
- 브랜치 `claude/compassionate-meitner-qvr8kt` 를 `/Users/jjung/Documents/cowork/test` 에 클론했고 Unity 2022.3.62f3 로 열었다. 배치 모드 컴파일 검사 통과 (에셋 826개, C# 에러 0).
- **배치 모드(-nographics) 는 Metal 셰이더 에러를 못 잡았다.** 실제 Play 에서 `CombatParticles` 가 `unityFogFactor` 재정의로 실패해 폭발이 분홍 사각형으로 나왔고, 두 안개 매크로를 `{ }` 블록으로 나눠 고쳤다. 고친 뒤 도시 FPS 폭발(섬광·불티·파편·연기)이 정상.
- Codex 코드의 MonoBehaviour 필드 초기화 3곳(`AssaultNavigation.path`, `FlagObjectiveHud.route` 의 NavMeshPath, `BloodImpact.properties` 의 MaterialPropertyBlock)이 Unity 예외를 내고 null 로 남아 NullReference 를 수백 개 만들었다. Awake 로 옮겼다. 도시 FPS·전차전 모두 런타임 에러 0.
- 후처리 P 비교: 켠 쪽이 약간 밝고 따뜻함. 어두워지는 문제 없음. `TerrainMatte` 는 컴파일 성공(폴백 경고 없음).
- 스크린샷은 `Screenshots/auto_city2_on/off.png`(도시 FPS), `auto_city3_on.png`(폭발), `auto_tank2_on/off.png`(가을 구릉 전차전) — 저장소에는 없고 로컬에만 있다.
- 전차전 가을 구릉 지면이 너무 어둡다고 사용자가 확인 → `TankCanyon.cs` 의 지형 레이어 틴트, 태양, 환경광, 후처리 노출, 스카이박스 노출을 올렸다 (README 항목 참고). `codex/urban-fps` 병합 시 이 파일의 `Lighting()` 과 `terrainLayers` 는 Claude 쪽 값을 유지한다.
- 자동 실행 도구 `Assets/Editor/SniperRidgeAutoPlay.cs` 를 추가했다. 사용법은 `CLAUDE.md` 2-1 항목.

## 지금까지 한 일 (요약, 시간순)
1. 후처리 재작성: SSAO(DepthNormals, 깊이 인식 블러), 화이트 밸런스, 리프트/감마/게인, 스플릿 토닝, 샤프닝, 그레인, 프리셋 2종.
2. 표면 디테일 재질(SurfaceDetail) 을 단색 재질 25곳에 적용 (적 군복, 총기, 헬기, 손, 왕, 참호 철재, 차량 등).
3. 조명·품질: 태양 각도/강도, PC 최상위 품질 티어, 소프트 파티클, 실시간 리플렉션 프로브.
4. 디버그 키 P/O/L/K 추가. F 키는 누르기 어렵다는 사용자 요청으로 문자 키로 변경.
5. 색보정을 감마 공간으로 이동 (선형 공간 대비가 그림자를 검게 눌렀음). 프리셋 강도 완화.
6. 협곡 바닥 반짝임: 풀 밀도·거리 축소, 지형 노멀 0, 그림자 StableFit/bias 상향, 광택 없는 지형 셰이더 추가.
7. 전투 효과: CombatVfx (폭발·총구 화염·탄착·예광탄·카메라 흔들림) 와 CombatParticles 셰이더. `Effects.Dust/Puff`, `RocketEffects.Explosion/CannonMuzzle` 은 새 모듈로 위임.
8. Codex 의 `codex/urban-fps` 를 세 차례 병합 (V2 무기 팩, 전차 협곡 → 가을 언덕, 빌드 검증).

## 사용자 성향
- 이론 설명보다 눈에 보이는 결과와 확인 방법을 원한다. 변경 후에는 "무엇을 눌러 무엇을 보면 되는지"를 짧게 알려준다.
- 방향: 사실적인 밀리터리 톤. 3D 에셋이 없어서 코드 생성 질감과 후처리로 보완하는 중.
- 향후 관심사: Unity 6 업그레이드, URP 이전 (아직 결정 전. 먼저 현재 화질 작업을 확인한 뒤 별도 단계로 진행하기로 함).
