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
| 좌클릭 | 사격 (볼트액션, 5발 탄창) |
| Shift 또는 Space (누르고 있기) | 숨 참기 (흔들림 감소, 호흡 게이지 소모) |
| R | 재장전 |
| 휠 / Z | 배율 전환 (8x / 16x / 30x, 기본 16x) |
| ↑ / ↓ | 영점 거리 조절 (100~600 m, 50 m 단위) |
| Esc | 마우스 잠금 해제 |
| Enter | 임무 종료 후 다시 시작 |

## 안드로이드 빌드

1. 상단 메뉴 **Sniper Ridge > Android APK 빌드**
2. `Builds/SniperRidge.apk` 가 생성됩니다. 폰에 복사해 설치하거나 `adb install Builds/SniperRidge.apk`
3. 빌드 설정은 처음 프로젝트를 열 때 자동으로 적용됩니다: 가로 모드, IL2CPP, ARM64, minSdk 24, 패키지명 `com.sniperridge.game`
   - NDK가 없어 IL2CPP 빌드가 실패하면 **Edit > Project Settings > Player > Android > Scripting Backend** 를 Mono로, Target Architectures를 ARMv7로 바꾸면 됩니다 (테스트용).

### 모바일 조작

- 화면 **왼쪽** 드래그: 조준
- 오른쪽 버튼: **사격**, **조준경**, **숨 참기**(누르고 있기), **재장전**, **배율**, **영점 +/−**

## 게임 규칙

- 적 10명: 바위 뒤에 웅크렸다가 몸을 일으키는 **바위 엄폐형** 4명, 굵은 나무 뒤에 숨었다가 옆으로 몸을 내미는 **나무 엄폐형** 4명, 두 지점을 오가는 **순찰형** 2명
- 적은 실제 사람보다 1.5배 크게, 거리는 약 330 m 로 잡혀 있어 조준경 16배에서 충분히 크게 보입니다. 난이도를 올리려면 `EnemySoldier.Scale` 과 `TerrainGenerator.PlayerRidgeZ` 를 조절하세요.
- 첫 발을 쏘면 총성이 도달한 뒤 적이 **경계 태세**로 바뀌어 더 짧게 노출되고 반격합니다.
- 탄 근처에 착탄하거나 스치면 그 주변 적이 즉시 숨습니다.
- 탄도: 총구 속도 850 m/s, 공기저항, 중력 낙차, 바람 편류가 적용됩니다. 화면 우상단의 바람 화살표와 횡풍 값을 보고 조준을 보정하세요. 영점 거리를 목표 거리(화면 중앙 아래 거리 표시)에 맞추면 낙차 보정이 됩니다.
- 점수: 몸통 100, 헤드샷 250, 거리 보너스(거리 × 0.5)
- 체력 100, 피격 시 18~26 감소, 5초간 피격이 없으면 서서히 회복

## 프로젝트 구조

```
SniperRidge/
├─ Assets/
│  ├─ Editor/SniperRidgeSetup.cs     씬 자동 생성, 빌드 메뉴, 안드로이드 설정
│  └─ Scripts/
│     ├─ Core/LevelBuilder.cs        씬 로드 시 레벨 전체 생성
│     ├─ Core/GameManager.cs         임무 상태, 점수, 사운드
│     ├─ Player/SniperController.cs  시점, 조준경, 호흡, 사격, 재장전, 영점
│     ├─ Player/Ballistics.cs        탄도 계산 + 실시간 탄환
│     ├─ Player/PlayerHealth.cs
│     ├─ Enemy/EnemySoldier.cs       엄폐/순찰 AI, 반격
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
