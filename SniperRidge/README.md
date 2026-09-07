# Sniper Ridge (Unity 3D 저격 게임 테스트)

능선에 잠복한 저격수가 맞은편 능선의 숲과 바위 뒤에 숨은 적 10명을 저격 소총으로 제거하는 1인칭 3D 게임입니다.
외부 에셋 없이 지형·적·UI를 전부 스크립트로 생성하므로 프로젝트를 열고 **Play** 버튼만 누르면 바로 실행됩니다.

## 요구 사항

- Unity **2022.3 LTS** (Unity Hub에서 다른 2022.3.x 패치 버전을 선택해도 됩니다)
- 안드로이드 빌드: Unity Hub에서 **Android Build Support** 모듈 (SDK, NDK, OpenJDK 포함) 설치

## 실행 방법 (PC / 에디터)

1. Unity Hub → **Open** → `SniperRidge` 폴더 선택
2. 프로젝트가 열리면 `Assets/Scenes/SniperRidge.unity` 씬이 자동 생성되고 열립니다.
   (자동으로 열리지 않으면 상단 메뉴 **Sniper Ridge > 게임 씬 열기**)
3. **Play** 버튼을 누르면 지형과 적이 생성됩니다. 게임 화면을 한 번 클릭하면 마우스가 잠깁니다.

### PC 조작

| 입력 | 동작 |
|---|---|
| 마우스 이동 | 조준 |
| 우클릭 | 조준경 켜기/끄기 |
| 좌클릭 | 사격 (자동화기는 누르고 있기) |
| Shift 또는 Space (누르고 있기) | 숨 참기 (흔들림 감소, 호흡 게이지 소모) |
| R | 재장전 |
| 휠 / Z | 배율 전환 (8x / 16x / 30x, 기본 16x) |
| ↑ / ↓ | 영점 거리 조절 (100~600 m, 50 m 단위) |
| Esc | 마우스 잠금 해제 |
| 1~4 | 무기 선택 화면에서 무기 선택 |
| Enter | 임무 종료 후 무기 선택 화면으로 |

## 안드로이드 빌드

1. 상단 메뉴 **Sniper Ridge > Android APK 빌드**
2. `Builds/SniperRidge.apk` 가 생성됩니다. 폰에 복사해 설치하거나 `adb install Builds/SniperRidge.apk`
3. 빌드 설정은 처음 프로젝트를 열 때 자동으로 적용됩니다: 가로 모드, IL2CPP, ARM64, minSdk 24, 패키지명 `com.sniperridge.game`
   - NDK가 없어 IL2CPP 빌드가 실패하면 **Edit > Project Settings > Player > Android > Scripting Backend** 를 Mono로, Target Architectures를 ARMv7로 바꾸면 됩니다 (테스트용).

### 모바일 조작

- 화면 **왼쪽** 드래그: 조준
- 오른쪽 버튼: **사격**(자동화기는 누르고 있기), **조준경**, **숨 참기**(누르고 있기), **재장전**, **배율**, **영점 +/−**

## 무기와 임무

Play 를 누르면 무기 선택 화면이 나옵니다. 카드를 클릭하거나 1~4 키를 누르면 시작합니다.

| 번호 | 무기 | 발사 방식 | 임무 |
|---|---|---|---|
| 1 | 볼트액션 저격소총 | 볼트액션, 5발, 8/16/30배 | **저격**: 맞은편 능선의 적 10명 제거 |
| 2 | 지정사수 소총 | 반자동, 10발, 4/8배 | **저격**: 맞은편 능선의 적 10명 제거 |
| 3 | 돌격소총 | 자동 650발/분, 30발, 2/4배 | **방어전**: 몰려오는 적 5개 웨이브 방어 |
| 4 | 경기관총 | 자동 700발/분, 100발 탄띠, 1.5/3배 | **방어전**: 몰려오는 적 5개 웨이브 방어 |

- 자동화기는 좌클릭(모바일은 사격 버튼)을 **누르고 있으면** 연사됩니다. 반동으로 조준점이 올라가고, 조준(우클릭) 시 산포가 줄어듭니다.
- 적 체력은 100입니다. 저격/지정사수 소총은 몸통 한 발, 돌격소총·경기관총은 몸통 2~3발, 헤드샷은 모든 무기 한 발입니다.
- **저격 임무**: 바위 엄폐형 4명, 나무 엄폐형 4명, 순찰형 2명. 첫 발 이후 경계 태세로 전환해 반격합니다. 적은 1.5배 크기, 거리 약 330 m.
- **방어전**: 웨이브마다 10 / 14 / 18 / 22 / 26명이 계곡에서 지그재그로 돌진하며 중간중간 멈춰 사격합니다. 10 m 앞에서 멈춰 계속 쏘므로 접근 전에 처리해야 합니다. 웨이브 사이 8초 휴식, 체력 회복이 빠릅니다.
- 점수: 몸통 100, 헤드샷 250, 저격 임무는 거리 보너스(거리 × 0.5), 방어전은 웨이브 클리어 보너스.

## 적을 실사 모델로 바꾸기 (선택)

기본 적은 프리미티브 도형으로 만든 병사입니다. 실사풍 병사 모델과 애니메이션을 넣으면 코드가 자동으로 그 모델을 사용합니다.

1. **모델 받기**: https://www.mixamo.com (Adobe 계정, 무료) 접속 → Characters 에서 군인 캐릭터를 고릅니다 (예: "Swat", "Vanguard By T. Choonyung", "Maw J Laygo" 등 무기를 든 실사풍 캐릭터).
   Download → Format **FBX for Unity**, Pose **T-pose** 로 받습니다.
2. **애니메이션 받기**: 같은 캐릭터를 선택한 채 Animations 에서 아래 4개를 검색해 각각 Download 합니다. Format **FBX for Unity**, Skin **Without Skin**.
   - `Rifle Idle` (대기)
   - `Rifle Run` (달리기)
   - `Rifle Crouch Idle` 또는 `Crouching Idle` (웅크리기)
   - `Rifle Death` 또는 `Dying` (사망)
3. 받은 FBX 5개를 프로젝트의 `Assets/EnemyModel/` 폴더에 넣습니다 (폴더는 직접 만드세요).
4. Unity 상단 메뉴 **Sniper Ridge → 적 모델 자동 설정 (Assets/EnemyModel)** 을 누릅니다.
   Animator Controller 와 `Assets/Resources/Enemies/SoldierModel.prefab` 이 만들어지고, 어떤 클립이 연결됐는지 알려줍니다.
5. Play 를 누르면 모든 적이 그 모델로 나타나고, 달리기/웅크리기/사망 애니메이션이 재생됩니다. 히트박스는 기존 프리미티브를 투명하게 유지해 그대로 씁니다.

Mixamo 모델 텍스처가 분홍색으로 보이면 FBX 를 선택하고 Inspector → Materials 탭 → **Extract Textures / Extract Materials** 를 눌러 주세요.
같은 방법으로 Unity Asset Store 의 무료 병사 모델(Humanoid 리그)도 쓸 수 있습니다. 클립 이름에 idle / run / crouch / death 가 들어 있으면 자동 연결됩니다.

## 프로젝트 구조

```
SniperRidge/
├─ Assets/
│  ├─ Editor/SniperRidgeSetup.cs     씬 자동 생성, 빌드 메뉴, 안드로이드 설정, 적 모델 자동 설정
│  └─ Scripts/
│     ├─ Core/LevelBuilder.cs        씬 로드 시 레벨 전체 생성
│     ├─ Core/GameManager.cs         무기 선택, 임무 진행, 방어전 웨이브, 점수, 사운드
│     ├─ Player/SniperController.cs  시점, 조준경, 호흡, 사격(볼트/반자동/자동), 재장전, 영점
│     ├─ Player/WeaponDefinition.cs   무기 4종 성능표
│     ├─ Player/WeaponModels.cs       1인칭 무기 모델
│     ├─ Player/Ballistics.cs        탄도 계산 + 실시간 탄환
│     ├─ Player/PlayerHealth.cs
│     ├─ Enemy/EnemySoldier.cs       엄폐/순찰/돌격 AI, 체력, 반격
│     ├─ Enemy/EnemyModels.cs        실사 모델 프리팹 연결
│     ├─ Enemy/EnemyHitbox.cs        머리/몸통 판정
│     ├─ World/TerrainGenerator.cs   두 능선 지형 생성
│     ├─ World/WindSystem.cs
│     ├─ World/Vegetation.cs        나무(침엽/활엽), 엄폐용 굵은 나무, 덤불
│     ├─ UI/HudController.cs         HUD, 조준경 오버레이, 결과 화면
│     ├─ UI/TouchControls.cs         모바일 터치 조작
│     ├─ UI/UiKit.cs
│     └─ Util/ProceduralAssets.cs    텍스처/머티리얼/사운드 코드 생성
│        Util/Effects.cs             예광탄, 먼지, 섬광
├─ Packages/manifest.json
└─ ProjectSettings/ProjectVersion.txt
```

## 다음 단계 아이디어

- 실제 병사/소총 3D 모델과 애니메이션으로 교체 (프리미티브 → 에셋 스토어 모델)
- 미션 여러 개, 시간 제한, 난이도 선택
- 총성/바람 소리 실제 오디오 에셋으로 교체
- 광고/랭킹 등 모바일 출시용 기능
