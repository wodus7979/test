# 휴대용 로켓 발사기 — Unity 외형 에셋 3종

FPS에 배치하거나 캐릭터가 들고 있는 소품으로 사용할 수 있는 가상 디자인입니다. 기존 총기·도시·자연 에셋과 같은 미터 단위를 사용합니다. 실제 제품을 복제한 모델은 아닙니다.

## 구성

| 모델 | 디자인 | LOD0 / LOD1 삼각형 |
|---|---|---:|
| launcher_reusable | 올리브색 재사용형 외관, 광학 조준기, 전방 받침 | 9,480 / 4,012 |
| launcher_compact | 사막색·올리브색 일회용 튜브형 외관, 간단한 조준기 | 5,996 / 3,248 |
| launcher_heavy | 짙은 회색 중량형 외관, 운반 손잡이, 전방 손잡이 | 7,388 / 3,968 |

튜브 입구의 깊이, 손잡이 홈, 어깨 받침, 조준장치, 외장 패널과 작은 표식을 모델링했습니다. 재사용형·일회용 등의 구분은 외형 디자인을 설명합니다. 발사·재장전·반동·폭발 효과·사운드·손 애니메이션이 포함되지 않은 정적 에셋입니다.

## Sniper Ridge에 적용된 버전

이 폴더는 사용자 제공 `launcher_asset_pack/Unity/Assets/LauncherAssetPack`의 메시 JSON과 PBR 텍스처를 그대로 사용하며, 빌더만 게임에 맞게 수정한 것입니다.

- 프로젝트를 열 때, Play 진입 전, 게임 빌드 전에 누락된 프리팹을 자동 생성합니다.
- 수동 메뉴: **Sniper Ridge → 로켓포 프리팹 생성 (Launcher Asset Pack)**.
- 생성 경로: `Assets/Resources/Launchers/{Meshes,Materials,Prefabs}`. 재생성 시 GUID를 유지해 갱신합니다.
- 기존 총기 팩과 출력 경로를 분리했습니다. 샘플 씬은 생성하지 않습니다.
- 게임에서는 `launcher_reusable`을 1인칭 모델로 쓰며, **Q** 또는 우상단 버튼으로 전환합니다. 나머지 두 모델도 프리팹으로 생성됩니다.
- 별도의 GLB 임포터나 Blender가 필요하지 않습니다.
- 검증 메뉴: **Sniper Ridge → 로켓포 에셋·탄약·폭발 검사** (Play 중지 상태).

원본 Python 생성기가 사용하는 +X 전방 좌표를 `(x,y,z) → (z,y,x)`로 바꿉니다. 원본의 CCW 삼각형 인덱스를 유지해 Unity용 시계 방향 면을 만들고 UV V축을 뒤집습니다. 원본 소스/텍스처와 Python 수치 검사는 통과했지만, 이 수정본의 Unity 컴파일·렌더링·Play 검사는 실행하지 못했습니다.

## 캐릭터에 연결

Unity 프리팹은 **+Z가 발사기 전방, +Y가 위쪽**입니다. 루트는 손잡이 부근에 있습니다. 캐릭터의 무기 소켓 아래에 프리팹을 넣고 위치·회전을 맞추세요.

| 기준점 | 용도 |
|---|---|
| RightHand | 오른손 위치를 맞추는 기준 |
| LeftHand | 왼손 받침 위치 기준 |
| Shoulder | 어깨 받침 위치 기준 |
| Muzzle | 게임에서 이펙트 등을 배치할 발사구 기준 |
| SightLine | 조준 시 카메라 위치를 조정할 기준 |

기준점은 프리팹 안의 빈 Transform입니다. IK·리깅·조준 로직은 자동으로 연결되지 않습니다. 캐릭터 체형과 애니메이션에 따라 위치를 조정하세요. 기준점 회전은 기본값이며, 손목 회전 목표까지 정의한 것은 아닙니다.

전체 외형을 감싸는 BoxCollider는 기본적으로 꺼져 있습니다. 월드에 놓인 소품에 충돌이 필요하면 활성화하세요. 물리적으로 움직이는 소품의 Rigidbody와 레이어 설정은 프로젝트에서 구성합니다.

## 재질과 파일

- 코팅 금속에 기존 도시 패키지에서 생성한 1K 금속 색상·노멀 텍스처를 재사용했습니다. 올리브색·사막색·짙은 회색과 금속의 재질값을 다르게 설정했습니다.
- 노멀·거칠기는 이미지에서 추정한 값입니다. 실측 스캔, 실제 도장 성분 또는 물성 데이터는 아닙니다. 폴리머·고무·광학 유리 등은 기본 PBR 값으로 표현합니다.
- Built-in Standard / URP Lit / HDRP Lit 중 현재 파이프라인에 맞춰 재질을 생성합니다. HDRP는 프로젝트의 노출·조명 설정에 맞춰 조정해야 할 수 있습니다.
- `*_metallic_smoothness.png`: Unity Built-in/URP용, R=Metallic, A=Smoothness.
- `*_hdrp_mask.png`: HDRP용, R=Metallic, G=1, B=1, A=Smoothness.
- `*_orm.png`: glTF용, R=1, G=Roughness, B=1. 금속도는 재질의 metallicFactor로 조정합니다.
- Unity/OBJ용 노멀과 glTF용 노멀은 UV V 방향 보정에 맞춰 G 채널이 반대입니다. 별도 AO는 굽지 않았습니다.
- LOD0·LOD1 두 단계가 Unity 프리팹에 포함됩니다. FPS 손에 든 모델은 가까운 거리의 LOD0을 사용하고, 월드 소품은 화면 크기에 따라 전환됩니다. 전환값은 프로젝트에 맞게 조정하세요.

`Models/*.glb` 3개와 `launcher_showcase.glb`는 필요한 텍스처가 모두 내장되어 있습니다. GLB/OBJ에는 LOD0만 들어 있고 LOD1과 기준점은 Unity 소스 JSON에 있습니다. OBJ는 `launcher_materials.mtl`과 `Textures`를 함께 보관하세요. 앱에 따라 노멀·거칠기는 수동 연결이 필요합니다.

GLB/OBJ 원본은 +X 전방, +Y 위쪽입니다. Unity 생성기가 `(x,y,z) → (z,y,x)`로 변환해 +Z 전방으로 맞춥니다. 기존 총기 패키지의 소켓 방향과 다르면 무기 루트에서 회전을 조정하세요.

미리보기 JPG는 실제 메시와 재질의 자체 CPU 렌더입니다. Unity 화면이나 최종 조명 결과는 아닙니다. `texture_provenance.json`에 텍스처 생성 기록이 있습니다. 게임 저장소의 `Tools/validate_launchers.py`로 포함된 데이터를 검사할 수 있습니다. 원본 GLB/OBJ·미리보기·SourceGenerator는 사용자가 제공한 다운로드 폴더의 원본 팩에 있습니다.
