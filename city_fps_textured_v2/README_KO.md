# 현대 한국형 도시 v2 — 사실적 텍스처 추가

공장지대, 오피스, 아파트, 상가가 섞인 192 × 160m 도시의 텍스처 추가 버전입니다. 재배치 가능한 개별 에셋 22종과 오브젝트 131개를 배치한 도시 모델을 포함합니다. 기존 형상과 이동 공간에 콘크리트·아스팔트·벽돌·금속·보도 PBR 텍스처를 추가했습니다. 건물 구조는 기존 베이스 메시이며, 조명·유리·소품까지 완성된 실사급 최종 맵은 아닙니다.

## Unity 설치

1. 압축을 풉니다.
2. `Unity/Assets/KoreanCityPackTextured` 폴더를 프로젝트의 `Assets` 안으로 복사합니다. 경로와 이름을 유지해주세요.
3. Unity의 스크립트 컴파일이 끝나면 **Tools → Korean City Textured → Build Assets and Sample Scene**을 실행합니다.
4. 생성된 `Assets/KoreanCityPackTextured/Generated/Scenes/Korean_Mixed_District.unity`를 엽니다.
5. 개별 에셋은 `Generated/Prefabs`에서 가져다 배치할 수 있습니다. `Korean_Mixed_District.prefab`은 전체 도시 배치입니다.

다시 생성할 때는 `Generated 1`처럼 새 폴더를 만들므로 기존에 편집한 결과를 덮어쓰지 않습니다. 도구는 별도 씬에서 작업하고 저장한 뒤 그 씬을 닫으며, 기존에 열려 있던 씬을 유지합니다. 실패한 경우 생성 중이던 씬을 남겨 확인할 수 있게 합니다.

생성기는 원본 메시 데이터를 Unity Mesh·Material·Prefab으로 변환하므로 별도의 GLB 임포터나 Blender 설치가 필요하지 않습니다. Unity 2022.3 LTS 및 Unity 6 계열의 Editor API를 기준으로 작성했습니다. 실제 Unity Editor가 없는 환경에서 제작해 **C# 컴파일, 에셋 임포트, Unity 렌더링 및 Play Mode 검증은 하지 못했습니다.**

## 포함 에셋

| 구분 | 구성 |
|---|---|
| 공업 건물 | 공장, 물류창고, 자동차 정비소 |
| 업무 건물 | 12층 오피스, 6층 오피스 |
| 주거 건물 | 10층 판상형 아파트, 13층 아파트 |
| 상업 건물 | 4개 점포로 나뉜 2층 상가 |
| 도로 | 30m 대로 모듈, 20m 이면도로 모듈, 10m 보도, 교차로, 주차장 |
| 거리 소품 | 가로등, 신호등, 버스 정류장, 화단과 가로수 |
| 기타 소품 | 컨테이너, 콘크리트 엄폐물, 팔레트 적재물, 실외기 |
| 기반 | 포장 구역과 외곽 경계 충돌체를 가진 지형 |

개별 메시 총 약 2.1만 삼각형, 배치된 도시 전체 약 4.2만 삼각형입니다. 정확한 모델별 수치는 `manifest.json`에 있습니다. 이 수치는 그림자 패스, 재질별 드로콜, 충돌 계산 및 배칭에 의한 메모리 사용량을 포함하지 않습니다.

## 내부 진입과 FPS 사용

- 공장과 창고: 앞뒤 출입구, 바닥, 천장, 기둥, 내부 설비·선반을 포함합니다.
- 상가: 각각 앞뒤 문이 있는 1층 점포 4개와 기본 카운터·선반이 있습니다. 2층은 진입할 수 없는 외형입니다.
- 정비소: 앞뒤 출입구와 간단한 작업 공간이 있습니다.
- 아파트와 오피스: 외부 전투용 배경·장애물입니다. 실제 로비, 계단, 여러 층 내부는 없습니다. 옥상의 계단실처럼 보이는 부분도 외형 메시입니다.
- 진입 건물은 벽·문 위·바닥을 개별 BoxCollider로 구성합니다. 출입구를 가로막는 전체 건물 BoxCollider는 붙이지 않습니다.
- 시작 위치, 공장 입구, 상가 입구, 안뜰에 빈 오브젝트 마커가 있습니다. 이 마커는 자동 스폰 기능이 아닙니다.
- 경계 충돌체가 맵 외곽을 감쌉니다. 도시를 확장하려면 `city_ground/Collision/MapBoundary_*`를 이동하거나 제거하세요.
- 1 unit = 1m이며 보도 높이는 약 0.15m, 연석은 약 0.26m입니다. 사용 중인 플레이어 컨트롤러의 계단 오르기 설정을 확인해주세요.
- 마당과 골목을 통한 우회 경로가 있습니다. 대로에는 긴 시야가 열려 있으며, 실제 교전 거리·엄폐물 밀도·팀 간 균형은 플레이 테스트로 조정해야 합니다.

**플레이어 컨트롤러, 무기 연결, 발사 로직, AI, NavMesh, 파괴 효과, 사운드, 차량 동작은 포함하지 않습니다.** 첫 화면은 고정된 전체 보기 카메라입니다. 기존 FPS 프로젝트의 플레이어를 스폰 마커 근처에 배치한 뒤 전체 보기 카메라를 끄세요.

## 재질과 성능

- 24개 공유 재질과 한글 간판 아틀라스 PNG를 포함합니다. 간판은 가상의 업체명입니다.
- 5종 표면 텍스처를 13개 공유 재질에 적용했습니다. 콘크리트·회벽·아파트·실내 바닥, 벽돌 벽, 아스팔트, 금속 프레임·지붕·공장 외장·실외기, 보도에 연결됩니다. 나무·수목·유리·도로 페인트 등 나머지 11개 재질은 기존 값/간판을 유지합니다.
- 기본 색상, 탄젠트 공간 노멀, 거칠기, Unity Metallic/Smoothness 및 HDRP Mask Map을 제공합니다. 게임용 맵은 1024 × 1024이며, AI가 생성한 원본은 1254 × 1254입니다. 원본은 `Textures/Sources`에 보관했습니다.
- 노멀과 거칠기는 원본 이미지의 밝기/색상 변화에서 추정한 보조 데이터입니다. 실측 스캔 PBR 데이터가 아니며, 돌출된 벽돌이나 깊은 틈을 만드는 실제 메시 변위는 없습니다.
- 반복 가능한 UV와 Repeat 샘플링을 사용합니다. AI 원본의 패턴·가장자리는 완전히 무봉제라고 보장하지 않습니다. 가까이서 보면 패턴 반복과 이음이 보일 수 있으며, 단일 사진에 남아 있는 미세 음영도 완전히 제거된 것은 아닙니다.
- 색상 맵은 sRGB, 노멀·마스크는 Linear 데이터로 임포트합니다. Mipmap, Trilinear, Anisotropic 8을 설정합니다. 텍스처 압축 결과와 메모리 사용량은 플랫폼별 Unity 설정에 따릅니다.
- 유리는 불투명한 청록색 표면입니다. 투명 유리, 창문 파괴 또는 내부 투시는 구현하지 않았습니다.
- Built-in Standard / URP Lit / HDRP Lit 중 현재 파이프라인에 맞는 재질을 만듭니다. HDRP는 볼륨, 노출, 광원 세기와 카메라 추가 설정을 별도로 조정해야 할 수 있습니다. 커스텀 렌더 파이프라인은 별도 설정이 필요합니다.
- 하나의 건물·소품은 재질별 서브메시를 갖는 하나의 렌더러로 만들어지고, 반복 배치에는 같은 프리팹과 메시를 사용합니다. 일괄 배칭 및 오클루전용 정적 플래그를 설정하지만, 실제 오클루전 데이터는 구워져 있지 않습니다.
- LOD, Lightmap UV1, 라이트맵, 오클루전 베이크는 미포함입니다. 플랫폼별 FPS 성능을 측정하거나 최적화한 결과물은 아닙니다.
- 모델은 원점을 지면 중앙에 두었습니다. 도로와 보도 모듈을 복제해 확장할 수 있지만, 자동 도로 연결·자동 도시 생성 UI는 아닙니다.

## 파일 구성

- `korean_city_layout.glb`: 전체 배치, 색상·노멀·PBR 및 간판 텍스처가 모두 내장된 3D 도시 모델.
- `Models/*.glb`: 개별 에셋 22종. 용량 절약을 위해 공유 텍스처를 상대 경로로 참조합니다. `Models`와 `Textures`를 함께 이동하세요.
- `Models/*.obj`, `city_materials.mtl`: 교환용 OBJ. PNG 상대 경로가 유지되도록 `Textures` 폴더도 함께 보관하세요.
- `Textures/sign_atlas.png`: 간판 원본.
- `Textures/PBR`: 색상·노멀·거칠기 및 엔진별 채널 패킹 맵.
- `Textures/Sources`: AI 생성 원본 5종.
- `texture_prompts.json`: 내장 이미지 생성 도구에 사용한 프롬프트.
- `texture_report.json`: 해상도·타일 크기·가장자리 차이 측정 결과.
- `Unity/Assets/KoreanCityPackTextured`: Unity 생성기, 메시·배치·재질 데이터.
- `city_overview.jpg`: 실제 메시를 렌더링한 전체 보기.
- `industrial_detail.jpg`, `street_buildings_detail.jpg`, `retail_texture_detail.jpg`, `factory_texture_detail.jpg`: 텍스처가 연결된 실제 메시 미리보기. 자체 CPU 렌더이며 Unity 화면은 아닙니다.
- `interior_cutaway.jpg`: 내부 확인용으로 지붕·상층 외형을 숨긴 단면 미리보기. 실제 에셋에는 지붕과 상층이 유지됩니다.
- `validation.json`: 형상·파일 구조·출입구·경로 검사 결과.
- `SourceGenerator`: 텍스처 데이터 재생성과 검증 코드. 기본 형상 생성기는 `BaseGeometry`에 별도 보관했습니다. 실행법은 폴더의 `README.txt`를 참고하세요.

Unity 좌표계로 변환할 때 Z축을 반전하고 회전·UV 방향을 함께 보정합니다. 따라서 GLB 뷰어에서 본 배치의 Z 좌표와 Unity 씬의 Z 좌표는 부호가 반대입니다.

## 텍스처 수동 연결

| 파일 | 용도 / 채널 |
|---|---|
| `*_albedo.jpg` | 기본 색상, sRGB |
| `*_normal_unity.png` | 이 패키지의 Unity/OBJ UV 방향에 맞춘 노멀, Normal map 타입 |
| `*_normal_gltf.png` | GLB에 연결된 노멀; Unity용과 G 채널 방향이 반대 |
| `*_roughness.png` | 거칠기, Linear. Unity Smoothness는 `1 − Roughness` |
| `*_metallic_smoothness.png` | Built-in/URP Metallic Map. R=금속도, A=Smoothness |
| `*_hdrp_mask.png` | HDRP Mask Map. R=금속도, G=1, B=1, A=Smoothness |
| `*_orm.png` | glTF. R=1, G=거칠기, B=1. 실제 금속도는 재질의 metallicFactor로 조정 |

별도의 AO를 굽지 않았으므로 마스크의 AO 채널은 흰색입니다. MTL의 `norm`, `map_Pr` 확장은 앱별 지원이 달라 OBJ에서는 색상 외 채널을 수동 연결해야 할 수 있습니다. Unity에서는 포함된 생성기를 사용하는 편이 간단합니다.

UV에 미터 기준 배율이 이미 반영되어 있습니다. Unity 재질의 Tiling은 기본값 `(1, 1)`입니다. 기본 타일 영역: 콘크리트 3 × 3m, 아스팔트 2 × 2m, 벽돌 1.04 × 0.84m, 금속 2 × 2m, 보도 1.72 × 1.8m. 다른 UV의 모델에 노멀을 재사용하면 G 채널 방향을 확인하세요.

Built-in과 URP는 Metallic Map의 A를 Smoothness로 사용하도록, HDRP는 Mask Map을 사용하도록 구성했습니다. 관련 문서: [URP Lit](https://docs.unity.cn/Packages/com.unity.render-pipelines.universal%4016.0/manual/lit-shader.html), [HDRP Mask Map](https://docs.unity3d.com/kr/Packages/com.unity.render-pipelines.high-definition%4010.5/manual/Mask-Map-and-Detail-Map.html).

## 검증 범위

기존 버전과 비교해 정점 위치·법선·충돌체·출입구·도시 배치가 동일함을 확인했습니다. 텍스처 경로, 이미지 디코딩, GLB/Unity 원본 UV 일치, UV 삼각형 비퇴화, 노멀 길이, Smoothness 반전과 마스크 채널도 검사했습니다.

22개 모델의 삼각형 면적, 법선 방향과 길이, 정점/UV 배열을 검사했습니다. 개별 GLB 22개와 전체 GLB 1개의 헤더·버퍼·텍스처 참조를 검사했습니다.

출입구 14개 유형에 대해 폭 0.7m, 높이 1.8m의 서 있는 캐릭터가 문턱을 통과할 공간이 있는지 확인했습니다. 0.5m 간격의 2D 충돌 격자에서 두 시작 위치와 주요 마커, 실제 배치된 모든 진입 건물 출입구의 연결도 확인했습니다. 이는 자체 공간 검사이며 Unity의 CharacterController, Rigidbody 또는 NavMesh 검증을 대체하지 않습니다.

참고 API: [Unity Mesh](https://docs.unity3d.com/ScriptReference/Mesh.html), [PrefabUtility.SaveAsPrefabAsset](https://docs.unity3d.com/ScriptReference/PrefabUtility.SaveAsPrefabAsset.html), [EditorSceneManager.NewScene](https://docs.unity3d.com/ScriptReference/SceneManagement.EditorSceneManager.NewScene.html).
