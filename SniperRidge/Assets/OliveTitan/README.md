# Olive Titan — Unity 2022.3 asset prototype, waist revision 3

Unity **2022.3.62f3**, Built-in Render Pipeline 기준으로 제작하고 검사한 오리지널 올리브색 근육형 캐릭터입니다. 실제 스킨 메시와 FBX이며, 이미지 한 장을 3D 에셋으로 대체한 결과가 아닙니다.

## 이번 수정

이번 수정은 직전 버전보다 허리 폭 약 22%, 앞뒤 두께 약 12% 추가 증가. 몸과 바지에 같은 완만한 변형을 적용했습니다. 모든 LOD와 편집용 마스터, FBX, 프리팹, 프리뷰를 갱신했습니다. 뼈 구조·가중치·UV·삼각형 수는 유지했습니다. 기존에 보고한 메시/UV 한계는 그대로 남아 있습니다.

## SniperRidge 적용

이 프로젝트에서는 새 모델을 게임 캐릭터에 연결했습니다. 게임용 프리팹과 검증 방법은 [GAME_INTEGRATION.md](GAME_INTEGRATION.md)를 참고하세요. 아래는 원본 독립 패키지의 사용 방법과 제작 상태입니다.

## Unity에 넣기

1. Unity 2022.3 프로젝트에서 `Assets > Import Package > Custom Package…`로 함께 제공되는 `.unitypackage`를 가져옵니다. 또는 `Unity/Assets/OliveTitan` 폴더 전체를 프로젝트의 `Assets`로 복사합니다. `.meta`도 함께 복사해야 참조가 유지됩니다.
2. `Assets/OliveTitan/Prefabs/OliveTitan.prefab`을 씬으로 드래그합니다. Transform Scale은 `(1,1,1)`로 둡니다.
3. Animator에 Humanoid용 Animator Controller를 연결합니다. 이 패키지는 애니메이션 클립이나 플레이어 조작 코드를 포함하지 않습니다.
4. 프리팹을 다시 생성/검사하려면 `Tools > Olive Titan > Build and validate Unity 2022.3 prefab`을 실행합니다. 이 도구는 검사할 빈 씬을 열므로 현재 씬을 먼저 저장하세요.

Built-in의 `Standard` 셰이더를 사용합니다. URP/HDRP는 별도 재질 변환 및 검증이 필요합니다. 기존 SniperRidge의 Generic 캐릭터 리그와 다르므로 게임 캐릭터를 자동 교체하지 않습니다.

## 구성

- FBX 3개: Y-up, 미터 단위, 전체 높이 2.30m, 루트 원점은 양발 사이 지면.
- 몸 / 바지 / 머리카락 / 눈의 스킨 메시. 몸과 바지는 분리되어 있습니다.
- Humanoid Avatar, Root/Hips/Spine/Chest/UpperChest/Neck/Head, 양쪽 어깨·팔·손가락·다리·발·발가락 뼈.
- 자동 전환 LODGroup과 공유 스켈레톤. 얇은 의상·머리카락의 접힘을 줄이기 위해 낮은 LOD에서도 해당 메시를 유지하고 몸체를 주로 줄입니다.
- 4K(4096×4096) 공유 UV 아틀라스: BaseColor, tangent-space Normal, Roughness, Metallic, AO, MetallicSmoothness.
- MetallicSmoothness: RGB=metallic(0), A=1−roughness. BaseColor만 sRGB, 나머지는 선형 데이터입니다.
- `Source/*.blend`는 Blender 4.5용 편집 원본입니다. `quad_master`는 쿼드 중심 원본이며, 런타임 FBX는 삼각형 메시입니다.
- `Preview`는 실제 모델 렌더링, `Reports`는 메시 검사, Unity 폴더의 `Validation`은 실제 Unity 검사와 캡처입니다.

## 검증과 남은 작업

실제 Unity 2022.3에서 FBX 임포트, 유효한 Humanoid Avatar, UpperChest 매핑, 높이·접지, 정규화한 최대 4개 본 가중치, Mecanim을 통한 팔꿈치·무릎 회전을 검사했습니다. 이는 관절 전체 범위에서의 아티스트 수준 변형 품질을 보증하는 테스트는 아닙니다.

현재 결과는 **리깅된 제작용 초안**입니다. 요청한 AAA 실사 완성본이나 모든 제작 조건을 충족한 최종 에셋으로 간주하면 안 됩니다. 얼굴·머리카락·근육 조각·피부의 실제감과 카고 바지의 봉제/손상 표현에 추가 작업이 필요합니다. 쿼드 원본의 캡 부분에는 다각형이 있으며, 최종 산출물의 일부 접촉/교차 조건도 아직 미충족입니다. 정확한 수치는 `Reports/surface_audit.json`과 `Reports/delivery_status.md`를 확인하세요. 극단적인 포즈, 런타임 전투 애니메이션, 모바일 성능은 검증하지 않았습니다.

## 재현

이미 만들어진 FBX/프리팹을 쓰는 데 Blender나 MPFB는 필요하지 않습니다. 절차형 제작을 처음부터 다시 실행하려면 Blender 4.5, MPFB의 위 리비전, 공식 CC0 시스템 에셋이 필요합니다. `MUTANT_TOOLS`가 MPFB checkout(`mpfb2/src`)과 추출한 `assets` 폴더를 포함하는 경로를 가리키도록 하고 `Source/build_character.py`, `Source/finish_character.py`, `Source/audit_character.py` 순서로 실행합니다. 소스 경로 기준으로 출력 폴더를 결정합니다. 외부 이미지 생성 API나 API 키는 사용하지 않습니다.

출처와 라이선스 설명은 `Licenses`에 포함되어 있습니다.
