# 사진 참고형 헐크 리깅 캐릭터 — Unity용 3D 에셋과 움직임

사용자가 제공한 앞·뒤 사진을 참고해 녹색 피부, 작은 머리, 넓은 등과 가슴, 긴 팔과 펼친 손, 해진 갈색 반바지의 외형을 새로 구성했습니다. 뒤주머니, 허리 고리, 봉제선과 손발가락을 추가했습니다. 사진 두 장에서 형태를 해석한 절차적 게임용 모델이며, 정밀 스캔이나 영화 수준의 디지털 더블은 아닙니다. 사진 속 인물과 주변 사물은 모델에 포함하지 않았습니다.

## Unity에서 사용하기

1. `Unity/Assets/HulkReference` 폴더를 프로젝트의 `Assets` 안으로 복사합니다.
2. 스크립트 컴파일 후 **Tools → Hulk Reference → Build Character and Animation Scene**을 실행합니다.
3. `Assets/HulkReference/Generated/Scenes/HulkReference_Animations.unity`를 엽니다.
4. **Play**를 누르면 Idle / Walk / Run / Punch / Jump 버튼으로 동작을 바꿀 수 있습니다. 재생 속도와 캐릭터 방향도 조절할 수 있습니다.
5. 기존 씬에는 `Generated/Prefabs/HulkReference.prefab`을 배치합니다.

생성 도구는 SkinnedMeshRenderer, Generic Avatar, Animator Controller, AnimationClip 5개, LODGroup, 재질과 예제 씬을 만듭니다. 재실행하면 새 Generated 폴더를 만들므로 이전 결과를 덮어쓰지 않습니다. 별도 Blender나 GLB 임포터 없이 사용할 수 있습니다.

**Unity Editor의 C# 컴파일, 실제 임포트와 Play Mode는 실행해 검증하지 못했습니다.** 메시·스킨 가중치·바인드 포즈·좌표 변환·GLB 애니메이션 채널·루프 연결을 자체 검사했고, 같은 데이터를 CPU로 스키닝해 미리보기를 만들었습니다. Unity 버전과 렌더 파이프라인에 따른 최종 확인은 필요합니다.

## 포함 애니메이션

| 클립 | 길이 | 반복 | 내용 |
|---|---:|---|---|
| Idle | 2.4초 | 반복 | 호흡과 팔의 작은 움직임 |
| Walk | 1.2초 | 반복 | 제자리 걷기, 좌우 팔·다리 교차 |
| Run | 0.8초 | 반복 | 더 큰 보폭과 팔 흔들기 |
| Punch | 1.2초 | 1회 | 준비 → 한쪽 주먹 뻗기 → 복귀 |
| Jump | 1.6초 | 1회 | 몸 낮추기 → 상승 → 착지 |

모든 클립은 초당 30프레임으로 저장됩니다. 예제 Animator에서 Punch와 Jump가 끝나면 Idle로 돌아갑니다. Walk와 Run은 제자리 애니메이션이며 실제 씬 내 이동은 이동 속도에 맞춰 게임 코드에서 연결해야 합니다.

점프 높이는 Hips의 로컬 이동으로 표현하며 루트 오브젝트 위치를 움직이는 물리 점프가 아닙니다. 프레임별 발 하단 위치를 보정했지만 지형을 인식하는 런타임 Foot IK, 계단 적응, 모션 캡처 수준의 보행은 아닙니다. 주먹 공격은 시각적 포즈이며 판정·피해·사운드는 없습니다.

## 모델과 리깅

- 약 2.96m 높이의 게임용 비율. 1 unit = 1m.
- **뼈대 43개**, 버텍스당 최대 4개 영향.
- **LOD0: 139,559 삼각형**, **LOD1: 49,703 삼각형**. LOD0은 근접 외형용으로 비교적 무겁습니다. 프로젝트의 캐릭터 수와 성능 목표에 맞춰 LOD 전환값을 조정하세요.
- 피부·바지·머리·눈·입·치아 등 11개 재질.
- 피부와 천에 2K 색상 및 미세 노멀 맵. 절차적 표면 데이터이며 실측 피부, 모공 스캔, 고유 UV 마모, SSS는 아닙니다.
- 기본 자세는 펼친 손입니다. 양손 각 5개 손가락에 2개씩 관절을 적용했으며 Punch에서 오므립니다. 표정 BlendShape와 립싱크는 없습니다.
- 바지에 완전히 가려지는 허벅지·골반 피부 면은 관통 방지를 위해 제외했습니다. 의상을 제거하거나 교체하려면 해당 면을 보완해야 합니다.
- Generic 리그이므로 Unity Humanoid 재타기팅 설정은 되어 있지 않습니다.
- 이동 컨트롤러, Rigidbody, 충돌 캡슐, 래그돌, AI, 공격 판정은 포함하지 않습니다.

LODGroup은 화면 크기 0.30에서 LOD1로 전환하고 0.012 이하에서 컬링합니다. SkinnedMeshRenderer에는 점프와 공격 자세를 포함하는 여유 있는 Bounds를 지정했습니다.

## 좌표와 재질

Unity 프리팹은 **+Z 전방, +Y 위쪽**입니다. 원본 GLB는 -Z 전방입니다. 생성기가 메시·노멀·위치의 Z축과 회전 쿼터니언을 함께 변환합니다. 루트 모션은 꺼져 있고 Generic Avatar에는 별도 루트 모션 본을 지정하지 않았습니다.

Built-in Standard / URP Lit / HDRP Lit 중 현재 파이프라인에 맞춰 재질을 만듭니다. HDRP에서는 프로젝트의 Volume·노출·조명 설정이 추가로 필요할 수 있습니다. 색상은 sRGB, 노멀은 Linear 데이터입니다. Unity용 노멀은 UV V 변환에 맞춰 glTF용과 G 채널이 반대입니다.

## 파일

- `Models/hulk_reference_animated.glb`: LOD0 메시, 텍스처, 스킨, 뼈대와 5개 애니메이션이 모두 들어 있는 GLB.
- `Unity/Assets/HulkReference`: 두 LOD, 재질, 동작 소스, Editor 생성 도구, Play Mode 보기 스크립트.
- `character_preview.jpg`: 실제 스킨드 메시의 정면 미리보기.
- `animation_preview.gif`: 5개 동작을 순서대로 보여주는 LOD1 미리보기. GIF는 낮은 프레임 수이며 원본 클립은 30fps입니다.
- `animation_poses.jpg`, `Previews`: 동작별 한 프레임과 후면.
- `manifest.json`, `validation.json`: 수량과 자체 검사 결과.
- `SourceGenerator`: Python 제작 코드. Python 3 + NumPy + Pillow가 필요하며 Unity에서 사용하는 데는 필요하지 않습니다.

미리보기는 자체 CPU 렌더로 Unity 화면이 아닙니다. ZIP은 일반 압축 파일이며 Unity Package Manager용 파일은 아닙니다.
