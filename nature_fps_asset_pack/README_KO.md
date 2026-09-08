# 산 · 나무 · 들판 — Unity 자연 환경 에셋

산과 들판에 나무·관목·풀·바위를 배치할 수 있는 **개별 3D 에셋 13종**과 **192 × 192m 샘플 배치**입니다. 앞서 만든 도시 패키지와 같은 1 unit = 1m 기준입니다. 실제 메시와 사진풍 표면 텍스처를 조합한 절차적 기본 모델이며, 실측 스캔이나 최종 상용 숲 환경은 아닙니다.

## Unity에서 사용하기

1. 압축을 풀고 `Unity/Assets/NatureFPSPack`을 프로젝트의 `Assets` 안으로 복사합니다. 폴더 이름을 유지하세요.
2. 스크립트 컴파일이 끝나면 **Tools → Nature FPS Pack → Build Assets and Sample Scene**을 실행합니다.
3. `Assets/NatureFPSPack/Generated/Scenes/Nature_Landscape.unity`를 엽니다.
4. 개별 에셋은 `Generated/Prefabs`에서 기존 도시 씬이나 FPS 씬으로 드래그해 배치합니다. 전체 배치는 `Nature_Landscape.prefab`입니다.
5. FPS 플레이어를 `PlayerStart` 마커 근처에 배치하고 `OverviewCamera`를 끕니다. 마커는 스폰 기능이 없는 빈 오브젝트입니다.

생성기는 Mesh·Material·Prefab·Scene을 Unity 안에서 생성합니다. 별도의 GLB 임포터나 Blender는 필요하지 않습니다. 다시 실행하면 `Generated 1`처럼 새 폴더에 생성하며 기존 결과를 덮어쓰지 않습니다. 기존에 열려 있던 씬을 유지하고, 생성한 씬은 저장 후 닫습니다.

**Unity에서 C# 컴파일·임포트·렌더링·Play Mode를 실행해 검증하지는 못했습니다.** Editor API를 기준으로 작성하고 파일·형상·텍스처를 자체 검사했습니다. URP/Built-in/HDRP의 실제 결과는 프로젝트에서 확인해주세요.

## 구성

| 에셋 | 개수 | 특징 |
|---|---:|---|
| 산 지형 | 2 | 192 × 192m 능선형, 암산형. 암반과 풀밭 재질 |
| 언덕 | 1 | 64 × 64m, 가장자리가 평평해지는 완만한 언덕 |
| 들판 | 1 | 64 × 64m, 완만한 기복. 같은 방향으로 이어 붙일 때 반대쪽 경계 높이가 일치 |
| 활엽수 | 2 | 넓은 수관과 비교적 곧게 자란 수관. 줄기·가지·개별 잎 메시 |
| 침엽수 | 2 | 높이가 다른 침엽수형 나무. 줄기·가지·뾰족한 잎 묶음 메시 |
| 관목 | 1 | 낮은 덤불 |
| 풀 | 2 | 짧은 풀, 길고 마른 풀이 섞인 군락 |
| 바위 | 2 | 크기와 비율이 다른 바위 |

모든 모델에 LOD0·LOD1 2단계를 제공합니다. 정확한 삼각형 수와 샘플 배치 수는 `manifest.json`에 있습니다. 나무는 특정 수종을 정확히 재현한 식물학 모델이 아닙니다. 나뭇잎은 색상 재질과 실제 형상으로 만들었으며 잎맥 사진 텍스처는 없습니다.

## 지형과 FPS 사용

- 산·언덕·들판은 **일반 Mesh**입니다. Unity Terrain 컴포넌트의 붓 도구로 직접 편집하는 TerrainData는 아닙니다. 메시 편집기 또는 포함된 Python 생성 코드로 형상을 바꿀 수 있습니다.
- 산과 바위에는 LOD0 메시를 사용하는 정적 MeshCollider가 붙습니다. 나무줄기에는 CapsuleCollider가 붙고, 잎·작은 가지·관목·풀에는 충돌체를 붙이지 않습니다.
- 산은 위쪽 표면을 가진 높이장입니다. 바닥과 옆면을 막은 입체 덩어리는 아닙니다. 맵 외부나 아래에서 볼 수 있는 구성에는 별도 측면 메시가 필요합니다.
- 샘플은 중앙의 완만한 들판을 이동 공간으로 남겨 두었습니다. 모든 산비탈이 보행 가능하도록 설계된 것은 아닙니다.
- 표본 지형의 경사와 나무·바위의 보수적인 평면 점유 영역으로 시작 지점부터 들판 마커까지 연결을 검사했습니다. Unity CharacterController·Rigidbody·NavMesh 검증을 대체하지 않습니다.
- 들판 타일의 경계 높이는 이어지지만, 텍스처 무늬나 다른 종류의 지형까지 자동으로 연결되지는 않습니다. 산과 도시 지형의 접점은 높이·회전·위치를 맞춰 배치하세요.
- 맵 외곽 차단벽, FPS 컨트롤러, 무기, AI, NavMesh, 바람 애니메이션, 나무 벌목·파괴, 계절 변화는 포함하지 않습니다.

## 재질과 LOD

- 바위·수피·풀밭에 **1K 색상·노멀·거칠기 맵**을 제공합니다. 색상 원본은 내장 이미지 생성 도구로 만든 1254 × 1254 PNG이며 `Textures/Sources`에 보관했습니다.
- 노멀과 거칠기는 이미지 밝기 변화에서 추정한 데이터입니다. 실제 높이·광택 스캔이 아니며 메시 변위나 AO 베이크는 포함하지 않습니다.
- 반복 텍스처는 완전한 무봉제를 보장하지 않습니다. 근접 화면에서 반복 무늬나 경계가 보일 수 있습니다. 지형의 풀밭/암반 경계는 삼각형 단위 재질 분리이며 부드러운 Terrain Layer 블렌딩은 아닙니다.
- Built-in Standard, URP Lit, HDRP Lit 중 현재 파이프라인에 맞춰 재질을 생성합니다. HDRP의 노출·볼륨·광원은 프로젝트에 맞게 별도 조정해야 합니다. 커스텀 파이프라인은 지원 범위에 포함하지 않습니다.
- 색상 맵은 sRGB, 노멀·마스크는 Linear 데이터로 읽습니다. 노멀은 Normal map 타입으로 임포트하며 Mipmap·Trilinear·Anisotropic 8을 설정합니다.
- Unity용 노멀과 glTF용 노멀은 UV V 방향 보정에 맞춰 G 채널이 반대입니다. 다른 메시로 재사용할 때는 UV 방향을 확인하세요.
- `*_metallic_smoothness.png`: R=금속도(0), A=Smoothness. Built-in/URP용입니다.
- `*_hdrp_mask.png`: R=금속도(0), G=AO(1), B=Detail Mask(1), A=Smoothness입니다.
- `*_orm.png`: R=AO(1), G=Roughness, B=Metallic(0). glTF용입니다.
- Unity LODGroup이 화면에서 차지하는 크기에 따라 모델을 전환합니다. 지형은 먼 거리에서도 LOD1을 유지하고, 나무·소품은 아주 작게 보일 때 컬링합니다. 프로젝트의 시야·해상도에 맞춰 전환값을 조정하세요.
- Built-in Standard의 잎 뒷면은 반대 방향의 면을 추가해 표시합니다. 따라서 Built-in에서 생성된 잎/풀 메시의 삼각형 수는 원본보다 많습니다. URP/HDRP와 GLB는 양면 재질을 사용합니다.
- LOD는 기본 간소화 단계이며 실루엣 전환이 보일 수 있습니다. SpeedTree, GPU 식생 인스턴싱 전용 셰이더, 빌보드, 라이트맵 UV1, 오클루전 베이크는 미포함입니다. 모바일·VR 및 대규모 숲의 프레임 성능을 검증한 패키지는 아닙니다.

## 교환 파일과 미리보기

- `nature_landscape.glb`: 텍스처가 모두 내장된 전체 샘플 배치. LOD0 모델을 배치한 고정 장면입니다.
- `Models/*.glb`: 개별 LOD0 에셋. 공유 텍스처를 상대 경로로 참조하므로 `Models`와 `Textures`를 함께 이동하세요.
- `Models/*.obj` + `nature_materials.mtl`: 교환용 OBJ. 앱에 따라 양면 재질·노멀·거칠기는 수동 연결이 필요합니다.
- `Unity/Assets/NatureFPSPack/Source`: LOD0·LOD1 메시와 재질·충돌체·배치 JSON.
- `nature_overview.jpg`: 실제 LOD1 모델로 렌더링한 전체 배치 미리보기.
- `tree_lineup.jpg`, `mountain_detail.jpg`, `ground_cover.jpg`, `meadow_detail.jpg`: 실제 모델의 자체 CPU 렌더. Unity 화면이나 최종 조명 결과는 아닙니다.
- `validation.json`: 형상·GLB·텍스처·경계 높이·이동 경로 검사 결과.
- `texture_prompts.json`: 내장 이미지 생성 도구에 사용한 프롬프트.
- `SourceGenerator`: 선택 사항인 Python 제작 코드. 사용법은 폴더의 README를 참고하세요.

GLB/OBJ 원본은 오른손 좌표계 Y-up입니다. Unity 변환 시 Z와 yaw 부호, UV V 방향을 보정합니다. 기존 도시 패키지와 같은 변환 규칙입니다.

참고: [Unity LODGroup.SetLODs](https://docs.unity3d.com/ScriptReference/LODGroup.SetLODs.html), [Unity MeshCollider](https://docs.unity3d.com/ScriptReference/MeshCollider.html).
