# Sniper Ridge (Unity 3D 저격 게임 테스트)

능선에 잠복한 저격수가 맞은편 능선의 숲과 바위 뒤에 숨은 적 10명을 저격 소총으로 제거하는 1인칭 3D 게임입니다.
저장소에 포함된 에셋과 스크립트로 지형·적·UI를 생성합니다. 처음 열 때 에셋 자동 생성이 끝난 후 **Play** 버튼을 누르세요.

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
| 1~7 | 무기 선택 화면에서 무기 선택 |
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

Play 를 누르면 무기 선택 화면이 나옵니다. 카드를 클릭하거나 1~7 키를 누르면 시작합니다.

| 번호 | 무기 | 발사 방식 | 임무 |
|---|---|---|---|
| 1 | 볼트액션 저격소총 | 볼트액션, 5발, 8/16/30배 | **저격**: 맞은편 능선의 적 10명 제거 |
| 2 | 지정사수 소총 | 반자동, 10발, 4/8배 | **저격**: 맞은편 능선의 적 10명 제거 |
| 3 | 돌격소총 | 자동 650발/분, 30발, 2/4배 | **방어전**: 몰려오는 적 5개 웨이브 방어 |
| 4 | 경기관총 | 자동 700발/분, 100발 탄띠, 1.5/3배 | **방어전** |
| 5 | 기관단총 | 자동 900발/분, 30발, 사거리 짧음 | **방어전** |
| 6 | 펌프 샷건 | 펌프액션, 8발, 산탄 10개 | **방어전** |
| 7 | 권총 | 반자동, 15발 | **방어전** |

무기 3D 모델은 저장소 루트의 `firearm_asset_pack` (원본 하드서피스 총기 6종) 을 사용합니다.
프로젝트를 열면 `Assets/FirearmAssetPack/Source` 의 메시 데이터에서 `Assets/Resources/Weapons/Prefabs` 프리팹이 자동 생성되고
(메뉴 **Sniper Ridge → 총기 프리팹 생성**), 1인칭 무기와 적 병사의 소총에 사용됩니다.

- 자동화기는 좌클릭(모바일은 사격 버튼)을 **누르고 있으면** 연사됩니다. 반동으로 조준점이 올라가고, 조준(우클릭) 시 산포가 줄어듭니다.
- 적 체력은 100입니다. 저격/지정사수 소총은 몸통 한 발, 돌격소총·경기관총은 몸통 2~3발, 헤드샷은 모든 무기 한 발입니다.
- **저격 임무**: 바위 엄폐형 4명, 나무 엄폐형 4명, 순찰형 2명. 첫 발 이후 경계 태세로 전환해 반격합니다. 적은 2배 크기, 거리 약 330 m.
- **방어전**: 웨이브마다 10 / 14 / 18 / 22 / 26명이 계곡에서 지그재그로 돌진하며 중간중간 멈춰 사격합니다. 10 m 앞에서 멈춰 계속 쏘므로 접근 전에 처리해야 합니다. 웨이브 사이 8초 휴식, 체력 회복이 빠릅니다.
- 점수: 몸통 100, 헤드샷 250, 저격 임무는 거리 보너스(거리 × 0.5), 방어전은 웨이브 클리어 보너스.
- 방어전은 웨이브를 격퇴할 때마다 예비 탄약의 40%를 재보급받습니다 (최대 보유량까지).

## 포함된 실사 에셋

프로젝트에 아래 에셋이 이미 들어 있어 별도 다운로드 없이 실사풍으로 실행됩니다.

| 위치 | 내용 | 출처 / 라이선스 |
|---|---|---|
| `Assets/EnemyModel/Soldier.fbx` | 실사풍 병사 모델(Mixamo "Vanguard") + 대기/걷기/달리기 애니메이션, 디퓨즈·노멀 텍스처 | three.js 예제 모델 (Mixamo 캐릭터, 게임 내 사용 무료) |
| `Assets/Resources/Terrain/` | 풀(사진), 바위, 흙, 낙엽 알베도+노멀 텍스처 | 풀 사진: three.js 예제(MIT), 나머지: Blender 절차적 재질 베이크 |
| `Assets/Resources/Nature/` | 나무껍질, 잎 텍스처 | Blender 절차적 재질 베이크 |
| `Assets/Resources/Sky/quarry_01_1k.hdr` | 실제 하늘 HDRI (스카이박스 + 환경광) | Poly Haven (CC0), three.js 예제 경유 |
| `Assets/Resources/Audio/` | 무기별 총성(실제 총성 녹음 가공), 원거리 총성, 탄 크랙, 노리쇠, 재장전, 바람 | 총성 원본: Free Firearm Sound Library(CC0), 나머지: 기존 합성/가공 효과음 |

처음 프로젝트를 열면 편집기 스크립트가 `Assets/EnemyModel` 의 FBX 로 Animator Controller 와
`Assets/Resources/Enemies/SoldierModel.prefab` 을 자동 생성합니다 (Console 에 "적 모델 자동 설정" 로그).
안 되면 메뉴 **Sniper Ridge → 적 모델 자동 설정** 을 직접 누르세요.

### 다른 병사 모델로 바꾸기

1. https://www.mixamo.com (Adobe 계정, 무료) 에서 캐릭터를 **FBX for Unity** 로 받고, 같은 캐릭터로 애니메이션 `Rifle Idle`, `Rifle Run`, `Rifle Crouch Idle`, `Rifle Death` 를 **Without Skin** 으로 받습니다.
2. `Assets/EnemyModel/` 의 기존 파일을 지우고 새 FBX 들을 넣습니다. 텍스처는 `*_albedo`, `*_normal` 이름이면 자동으로 재질에 연결됩니다.
3. `Assets/Resources/Enemies/SoldierModel.prefab` 을 지우고 메뉴 **Sniper Ridge → 적 모델 자동 설정** 을 누릅니다.
   클립 이름에 idle / run / crouch / death 가 들어 있으면 자동 연결되며, 웅크리기·사망 클립이 없으면 코드가 대신 연출합니다.

### 효과음 바꾸기

`Assets/Resources/Audio/` 의 파일을 같은 이름의 WAV 로 교체하면 됩니다: `shot_sniper`, `shot_dmr`, `shot_rifle`, `shot_lmg`, `shot_smg`, `shot_shotgun`, `shot_pistol`, `shot_distant`, `crack`, `bolt`, `pump`, `reload`, `hit`, `click`, `wind`(루프).

## 프로젝트 구조

```
SniperRidge/
├─ Assets/
│  ├─ Editor/SniperRidgeSetup.cs     씬 자동 생성, 빌드 메뉴, 안드로이드 설정, 적 모델·총기 프리팹 자동 설정
│  ├─ FirearmAssetPack/              총기 메시 데이터(JSON) + 프리팹 생성기
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
│     ├─ World/MeshBuilder.cs       나무/덤불 메시 생성
│     ├─ Util/PostEffect.cs         후처리(블룸, ACES 톤매핑, 비네트) + Shaders/SniperRidgePost.shader
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


## PC 그래픽 개선 (2026-09)

PC 기준으로 자연 팩을 실제 게임에 연결했습니다. **Unity 2022.3.62f3에서 컴파일·실행·화면·성능 확인은 아직 수행하지 않았습니다.** 아래 수치는 설정값이며 성능 측정 결과가 아닙니다.

- 일반 나무 4종·관목·장식 바위 2종을 `nature_fps_asset_pack` 모델로 교체합니다. 나무껍질과 바위는 팩의 알베도·노멀·금속/매끄러움 텍스처를 사용합니다. 잎은 양면 조명과 작은 바람 움직임을 추가했습니다.
- 화면에서 차지하는 크기에 따라 상세 모델 → 팩의 저해상도 모델 → 기존 간단한 모델로 전환합니다. 조준경을 확대하면 상세 모델이 다시 선택됩니다. 반복 메시·재질은 공유하고 GPU 인스턴싱을 활성화합니다.
- 사수 주변에는 짧은 풀·억새 모델을 최대 420회 배치 시도합니다. 중앙 사격 공간과 급경사는 제외하므로 실제 개수는 더 적습니다.
- PC 지형 높이맵은 257 → 1025, 재질 혼합맵은 256 → 1024입니다. 그림자 거리는 260 → 460m입니다. 첫 지형 생성 시간과 GPU 부담은 증가할 수 있습니다.
- 사수 위치에 256px HDR 환경 반사를 한 번 생성합니다. 햇빛·안개·노출을 조절하고 과한 블룸과 비네트를 줄였습니다. HDR 후처리 중간값은 half 정밀도로 처리합니다.
- 적의 엄폐용 나무·바위와 게임 판정용 콜라이더는 기존 구성을 사용합니다. 조형물과 판정의 정밀한 일치는 후속 플레이 확인이 필요합니다.

### 받기와 실행

1. 저장소 **전체**를 받으세요. `SniperRidge`와 `nature_fps_asset_pack` 폴더가 나란히 있어야 합니다.
2. Unity Hub에서 `SniperRidge`를 엽니다. 컴파일이 끝나면 자연 에셋이 `Assets/Resources/NaturePack`에 자동 생성됩니다.
3. Console의 `고품질 자연 프리팹 9개 생성 완료`를 확인합니다. 자동 생성이 안 되면 **Sniper Ridge → 고품질 자연 에셋 생성**을 실행하세요.
4. 게임 씬을 열고 Play를 누릅니다. 플레이어 빌드 직전에도 누락된 자연 에셋을 생성합니다. 원본 폴더가 없으면 빌드를 중단해 에셋 누락을 알립니다.

생성된 자연 에셋은 Git에서 제외되며 원본 팩에서 재생성됩니다. 이 변경은 기존 Built-in 렌더 파이프라인을 사용하며 추가 패키지 설치가 필요하지 않습니다.

### 검증

`python3 SniperRidge/Tools/validate_nature_geometry.py`를 저장소 루트에서 실행하면 모델 9종의 두 LOD, 삼각형 162,354개의 축 변환 후 면 방향·노멀 정렬·UV·재질 인덱스·텍스처 경로를 검사합니다. 이 데이터 검사는 통과했습니다.

Unity에서 남은 확인:

- Console에 C# 또는 셰이더 컴파일 오류가 없는지, 자연 모델이 분홍색/뒤집힌 상태로 보이지 않는지 확인합니다.
- 같은 시점에서 일반 시야와 8/16/30배 조준 화면을 비교합니다. LOD 전환 시 팝핑, 나뭇잎 반짝임, 사격 시야 가림을 점검합니다.
- 모든 무기와 저격/방어전을 실행해 총기 반사와 그림자를 확인합니다. 기존 탄약·적 크기·총성 동작도 확인합니다.
- 실제 대상 PC의 1080p/1440p 빌드에서 프레임 시간, 메모리, 최초 로딩 시간을 측정합니다. 현재 특정 FPS를 보장하지 않습니다.

LOD 동작 참고: [Unity 2022.3 LODGroup 문서](https://docs.unity3d.com/2022.3/Documentation/Manual/class-LODGroup.html).


## 총성 개선 (2026-09)

무기 7종과 원거리 총성을 CC0 **The Free Firearm Sound Library**의 실제 녹음 기반으로 교체했습니다. 저격소총의 기존 낮은 합성음과 일정 간격의 인공 메아리를 제거하고, 녹음의 발사음과 잔향을 사용합니다. 파일별 출처와 가공 방법은 `Assets/Resources/Audio/SOURCES.md`에 있습니다. 게임 무기와 녹음 총기의 구경/모델은 일부 다릅니다.

- 총성 WAV는 48kHz PCM16이며 플레이어 총성은 좁은 스테레오, 원거리 총성은 모노입니다. 피크에 여유를 두었습니다.
- Unity가 총성을 PCM으로 가져오도록 설정합니다. 반영되지 않으면 **Sniper Ridge → 총성 오디오 다시 가져오기**를 실행하세요.
- 효과음 재생은 비어 있는 오디오 소스를 우선 사용합니다. 같은 소스에 총성과 잔향을 겹친 상태로 음높이를 바꾸던 방식을 수정했습니다. PC에서 32개, 모바일에서 16개까지 재생하며 전부 사용 중이면 한 소리를 교체합니다.
- WAV 파일 데이터와 연사 합산 검사를 수행했습니다. Unity 컴파일·실제 재생과 사용자 스피커에서의 청감 확인은 아직 필요합니다.
