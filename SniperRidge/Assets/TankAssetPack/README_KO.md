# Sniper Ridge 통합 안내

이 사본은 사용자 제공 `tank_asset_pack`을 Sniper Ridge에 통합한 버전입니다. 수정된 빌더는 **Sniper Ridge → 전차 에셋 생성**으로 실행하며 `Assets/Resources/Tank` 아래에 프리팹·메시·재질을 생성합니다. 프로젝트를 열거나 빌드할 때 누락된 프리팹을 자동 생성합니다. 샘플 씬은 만들지 않습니다. 게임 조작·테스트 안내는 프로젝트 README를 따르세요. 아래는 원본 팩 설명으로, 원본의 메뉴/출력 경로는 통합 버전과 다를 수 있습니다.

---

# 사진 참고형 현대 탱크 — Unity 3D 에셋

첨부 사진의 낮고 각진 차체·포탑, 전면 경사면, 측면 스커트와 궤도 형태를 참고한 게임용 외형 모델입니다. 한 장의 사진으로 보이지 않는 후면과 세부는 해석해 보완했습니다. 특정 실제 차종을 정확하게 복제한 정밀 모델은 아닙니다.

## Unity에서 사용하기

1. `Unity/Assets/TankAssetPack`을 프로젝트의 `Assets` 안으로 복사합니다.
2. **Tools → Tank Asset Pack → Build Assets and Sample Scene**을 실행합니다.
3. `Generated/Scenes/Tank_Showcase.unity`를 열어 확인합니다.
4. `Generated/Prefabs/tank_reference.prefab`을 기존 FPS 씬에 배치합니다.

생성기는 Unity의 Mesh·Material·LODGroup·BoxCollider·Prefab·Scene을 만듭니다. Blender나 GLB 임포터는 필요하지 않습니다. 다시 실행하면 새 Generated 폴더를 만들어 기존 결과를 덮어쓰지 않습니다. 기존에 열려 있던 씬을 유지합니다.

**Unity C# 컴파일·에셋 임포트·렌더링·Play Mode는 실행해 검증하지 못했습니다.** 메시, 텍스처 참조, GLB 계층, 좌표 변환과 포탑/포신의 기준점은 자체 검사했습니다.

## 모델 구성

| 구성 | 내용 |
|---|---|
| Hull | 경사 차체, 측면 스커트, 전조등, 운전석 덮개, 후면 그릴 |
| Turret | 각진 포탑, 해치, 관측 장치, 외장 패널, 안테나 |
| Barrel | 포신·포방패, 외형 돌출부, 포구의 얕은 시각적 깊이 |
| TrackLeft / TrackRight | 좌우 궤도 링크와 보기륜·허브 |

전체 LOD0은 **18,232 삼각형**, LOD1은 **7,984 삼각형**입니다. 1 unit = 1m로 제작했습니다. 모델 크기는 외형과 기존 도시 에셋에 맞춰 정한 게임용 비율입니다.

## 움직임을 연결하는 기준

Unity 프리팹의 전방은 **+Z**, 위쪽은 **+Y**입니다.

- `Turret`은 차체와 분리되어 있으며, 로컬 Y축을 회전시켜 포탑을 돌릴 수 있습니다.
- `Barrel`은 `Turret`의 자식입니다. 로컬 X축으로 상하 각도를 바꾸면 포탑 회전을 함께 따라갑니다. Unity에서는 로컬 X의 음수 방향이 포신을 위로 올리는 방향입니다.
- `Barrel/Muzzle`은 포구 위치의 빈 Transform입니다. +Z 방향이 포신 앞쪽입니다.
- `Hull/DriverView`, `Turret/TurretView`는 게임 카메라를 배치할 때 사용할 참고 위치입니다. 카메라 컴포넌트는 붙이지 않았습니다.
- 좌우 궤도는 각각 분리한 정적 메시입니다. 개별 바퀴 회전이나 궤도 링크 순환 애니메이션은 설정하지 않았습니다.

차체·포탑·좌우 궤도에 단순 BoxCollider 4개가 있습니다. 이 충돌체는 FPS에서 배경 장애물로 쓰거나 차량 물리의 시작점으로 사용할 수 있는 근사 형태입니다. 포신·안테나 등 가는 부품을 정확히 따라가는 충돌체는 없습니다.

**차량 조종, 서스펜션, Rigidbody 설정, 궤도 주행, 포탑 조준 제어, 발사·피격·파괴 효과, 실내, 탑승 기능은 포함하지 않습니다.** 회전 계층과 기준점을 제공하며 동작은 프로젝트에서 연결합니다. `tank_pose_preview.jpg`는 구조 확인용 포즈 렌더로, 저장된 게임 애니메이션이 아닙니다.

## 재질과 LOD

- 회색 도장 금속·궤도 금속에 1K 색상·노멀·거칠기/PBR 패킹 맵을 사용했습니다. 기존에 생성한 금속 표면 텍스처를 재사용하고 재질 색상을 사진 분위기에 맞췄습니다.
- 노멀·거칠기는 이미지에서 추정한 데이터이며 실제 도장이나 금속의 실측 물성은 아닙니다. 고무·먼지·관측창·등화는 기본 PBR 값으로 표현합니다.
- Built-in Standard / URP Lit / HDRP Lit 중 현재 파이프라인에 맞춰 재질을 생성합니다. HDRP는 프로젝트의 노출·조명·볼륨 설정을 조정해야 할 수 있습니다.
- 색상은 sRGB, 노멀·마스크는 Linear 데이터로 읽습니다. Unity용 노멀과 glTF용 노멀은 UV V 방향 변환에 맞춰 G 채널이 반대입니다.
- Metallic/Smoothness 맵은 R=Metallic, A=Smoothness입니다. HDRP Mask Map은 R=Metallic, G=1, B=1, A=Smoothness입니다. glTF ORM은 G=Roughness이며 B=1에 재질 metallicFactor를 곱합니다. 별도 AO는 굽지 않았습니다.
- 하나의 LODGroup이 모든 구성 부품의 LOD를 함께 바꿉니다. 카메라 화면 크기에 따라 전환하며 작은 크기에서는 컬링합니다. 프로젝트의 카메라와 성능 목표에 맞춰 전환값을 조정하세요.
- 바퀴·궤도와 사진의 세부는 단순화되어 있습니다. 최종 상용 수준의 디테일·마모·성능 최적화를 검증한 에셋은 아닙니다.

## 파일

- `Models/tank_reference.glb`: 텍스처 내장, 차체·포탑·포신·궤도 계층과 기준점을 가진 LOD0 모델.
- `Models/tank_reference.obj`, `tank_materials.mtl`: 정지 자세로 합친 OBJ. 구성별 그룹 이름은 있지만 부모/자식 회전 계층은 보존하지 않습니다. `Textures`를 함께 보관하세요.
- `Unity/Assets/TankAssetPack`: LOD0·LOD1, 부품 계층, 재질·충돌체 데이터와 생성기.
- `tank_preview.jpg`, `tank_rear.jpg`, `tank_side.jpg`, `tank_pose_preview.jpg`: 실제 메시의 자체 CPU 렌더. Unity 화면은 아닙니다.
- `manifest.json`, `validation.json`: 수량과 검사 결과.
- `texture_provenance.json`: 재사용 텍스처 생성 기록.
- `SourceGenerator`: 선택 사항인 Python 제작 코드.

원본 GLB/OBJ의 전방은 -Z입니다. Unity 생성기가 Z축 부호와 UV V 방향을 반전해 +Z 전방으로 변환합니다. GLB에서도 포신은 포탑을 부모로 갖습니다.
