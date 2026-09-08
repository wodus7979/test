# Unity 총기 외형 에셋 팩

스나이퍼, 경기관총, 돌격소총, 기관단총, 펌프 샷건, 권총 총 6종입니다. 특정 제조사의 제품을 복제하지 않은 가상 디자인입니다. 사실적인 비율을 목표로 만든 절차적 하드서피스 베이스 모델이며, 손으로 조형·텍스처링한 포토리얼 최종 에셋 수준은 아닙니다.

## Unity에 넣기

1. `Unity/Assets/FirearmAssetPack` 폴더를 프로젝트의 `Assets` 안으로 복사합니다.
2. 스크립트 컴파일이 끝나면 상단 메뉴 **Tools → Firearm Asset Pack → Build Prefabs**를 누릅니다.
3. `Assets/FirearmAssetPack/Generated/Prefabs` 안의 프리팹을 씬에 드래그합니다.

별도 3D 임포터 플러그인은 필요 없습니다. Editor 스크립트가 포함된 원본 메시 데이터에서 Unity Mesh, Material, Prefab 에셋을 생성합니다. 재실행 시 `Generated 1`처럼 새로운 폴더를 만들어 이전 결과를 유지합니다. 원본 폴더 이름과 위치는 유지해주세요.

Built-in Standard / URP Lit / HDRP Lit 셰이더를 현재 렌더 파이프라인에 따라 선택합니다. 파이프라인을 바꾼 뒤에는 메뉴를 다시 실행합니다. 커스텀 렌더 파이프라인에는 수동 재질 조정이 필요할 수 있습니다.

Unity 2022.3 LTS와 Unity 6 계열에서 사용되는 Editor API를 기준으로 작성했습니다. 제작 환경에 Unity Editor가 없어 실제 프로젝트 안에서 컴파일·임포트·렌더링 검증은 하지 못했습니다. 메시 데이터와 GLB/OBJ 파일 구조는 별도 검증했습니다.

## 구성

| 모델 | 삼각형 수 |
|---|---:|
| 01_precision_rifle | 12,604 |
| 02_light_machine_gun | 10,408 |
| 03_assault_rifle | 9,752 |
| 04_submachine_gun | 7,008 |
| 05_pump_shotgun | 4,680 |
| 06_service_pistol | 4,352 |

- 각 모델 폴더: GLB, OBJ, MTL, 실제 메시로 렌더링한 PNG 미리보기.
- Unity 폴더: 외부 의존성이 없는 C# Editor 생성기와 원본 메시 JSON.
- `preview_3d.html`: 인터넷 연결 없이 모델을 회전·확대할 수 있는 미리보기.
- `manifest.json`: 삼각형 수, 원본 부품 수, 바운딩 박스 등 메타데이터.

## 메시와 재질

- Unity 결과는 1 unit = 1 m, Y 위쪽, Z 앞쪽입니다. 루트 기준점은 몸통 중앙 부근이며 총구 앞에 `Muzzle` 빈 오브젝트가 생성됩니다.
- 교환용 GLB/OBJ는 Y 위쪽, X 앞쪽입니다. Unity 생성기는 축과 좌표계 방향을 변환합니다.
- GLB와 OBJ에는 원래의 개별 외형 부품이 들어 있습니다. Unity에서는 Body, Magazine, Optic, Stock, Bipod 등 해당 모델에 존재하는 부품군으로 합치고 재질별 서브메시를 만듭니다. 부품군 피벗은 각 군의 바운딩 박스 중앙입니다.
- 기본 금속·폴리머·고무·세라코트·렌즈 재질을 포함합니다. 텍스처 맵 없이 색상·메탈릭·러프니스 값으로 표현합니다. GLB는 PBR 값을 저장하며 OBJ의 MTL은 도구에 따라 광택이 다르게 보일 수 있습니다.
- 렌즈는 불투명한 청록색의 고광택 표면입니다. 실제 투명 렌즈나 투시 가능한 조준경 셰이더가 아닙니다.
- 기본 반복 UV0가 있습니다. 유니크 UV, 베이크된 노멀·AO·러프니스 텍스처, 사용감·스크래치 맵은 없습니다. 고품질 텍스처링을 하려면 UV를 새로 펴야 합니다.
- 부품끼리 겹쳐 구성된 외형 메시입니다. 단일 수밀 솔리드나 제조용 설계 데이터가 아닙니다. 통풍구 등 일부 디테일은 어두운 외형 패널로 표현되어 있습니다.
- Unity 프리팹에는 전체를 감싸는 단순 BoxCollider만 있습니다. 정확한 충돌 형상은 용도에 맞게 조정해주세요.
- 리깅, 발사·장전 애니메이션, 1인칭 손, 사운드, 이펙트, 게임플레이 코드, LOD는 포함하지 않습니다. 분리된 부품군 역시 장전 리깅이나 관절 피벗이 완성된 상태는 아닙니다.

## 제작 및 검증

원본 생성 코드는 `source/build_assets.py`에 포함되어 있습니다. 재생성에는 Python 3와 Pillow가 필요하며, 상단 OUT 경로를 환경에 맞게 수정합니다. 프리팹 생성 시에는 Python이 필요 없습니다.

API 참고: [Unity Mesh](https://docs.unity3d.com/ScriptReference/Mesh.html), [PrefabUtility.SaveAsPrefabAsset](https://docs.unity3d.com/ScriptReference/PrefabUtility.SaveAsPrefabAsset.html), [Unity 모델 파일 형식](https://docs.unity3d.com/Manual/3D-formats.html).
