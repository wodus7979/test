# FPS Weapons V2 — Unity용 무기 11종 개선판

참고 이미지의 근접 디테일과 재질 구분을 목표로 기존 무기 전체를 개선했습니다. 기존 총기 6종, 헬기 장착 기관총, 로켓 발사기 3종, 수류탄이 포함됩니다. 도시·자연·차량은 이번 무기 패키지의 대상이 아닙니다.

기존 모델의 외형을 바탕으로 만든 절차적 게임 에셋입니다. 참고 이미지의 특정 총기를 그대로 복제한 모델이나 동일한 상용 게임 품질을 재현한 결과는 아닙니다. 보이는 외형과 표면 재질을 개선했으며 고유 마모 텍스처, 내부 구조, 손과 애니메이션 등은 별도 제작이 필요합니다.

## Unity 적용

1. `Unity/Assets/FPSWeaponsV2`를 프로젝트의 `Assets` 폴더로 복사합니다. Unity 전용 ZIP에는 `Assets/FPSWeaponsV2`가 바로 들어 있습니다.
2. 스크립트 컴파일을 기다린 뒤 **Tools → FPS Weapons V2 → Build Assets and Sample Scene**을 실행합니다.
3. `Assets/FPSWeaponsV2/Generated/Scenes/FPS_Weapons_V2_Showcase.unity`를 엽니다.
4. `Generated/Prefabs`의 개별 무기를 FPS 씬에 배치합니다.
5. 샘플 씬에서 Play를 누르면 Previous / Next로 무기를 전환하고 **First-person detail angle**로 후방 근접 각도를 확인할 수 있습니다. 체크를 해제하면 회전 슬라이더로 제품 외형을 살펴볼 수 있습니다.

생성 도구가 Mesh, Material, Prefab, LODGroup, 근사 BoxCollider와 예제 Scene을 만듭니다. 별도 Blender나 GLB 임포터는 필요하지 않습니다. 재실행 시 새 Generated 폴더를 만들어 이전 생성 결과를 덮어쓰지 않습니다. 기존 에셋 팩과 다른 폴더·네임스페이스를 사용합니다.

**Unity Editor의 C# 컴파일·임포트·렌더링·Play Mode는 실행 검증하지 못했습니다.** 자체 검사에서 11종의 메시, 노멀, UV, 파일 참조, GLB 계층과 PBR 채널 패킹을 확인했습니다. 오류가 나오면 Console 메시지를 기준으로 프로젝트 버전에 맞춰 조정해야 합니다.

## 개선 내용

- 전체 공통 2048×2048 PBR 표면: 금속, 도장, 폴리머와 고무의 미세 요철·거칠기·스크래치 구분.
- 저격총·경기관총·돌격소총·일부 발사기의 스코프를 새로 제작. 렌즈 곡면, 열린 캡, 마운트, 초점 링과 조절 다이얼 추가.
- 기관단총·샷건·권총에 열린 프레임의 소형 조준기 추가. 돌격소총·기관단총에 외부 조명 장치 추가.
- 일부 작은 경사 모서리를 노출 금속 재질로 구분. 평면 모서리 전체의 고유 마모를 베이크한 것은 아닙니다.
- 탄창, 장전 손잡이, 펌프, 슬라이드, 스코프, 수류탄 레버·링 등을 의미 있는 그룹으로 분리.
- 모든 무기에 LOD0과 LOD1 제공. 주로 둥근 부품과 미세 표면 부품을 줄입니다.
- Unity 예제에 근접 보기와 반사 환경 추가. 손을 포함한 플레이어 무기 리그나 조작 시스템은 아닙니다.

## 구성

| 에셋 | LOD0 삼각형 | LOD1 삼각형 | 부품 그룹 |
|---|---:|---:|---|
| 정밀 저격총 | 32,508 | 8,488 | Body, Magazine, Optic, ChargingHandle, Lens |
| 경기관총 | 33,140 | 8,412 | Body, Magazine, ChargingHandle, Optic, Lens |
| 돌격소총 | 32,172 | 8,456 | Body, Magazine, ChargingHandle, Optic, Lens |
| 기관단총 | 8,732 | 5,112 | Body, Magazine, ChargingHandle, Optic, Lens |
| 펌프 샷건 | 5,936 | 3,692 | Body, Pump, ChargingHandle, Optic, Lens |
| 권총 | 5,312 | 3,364 | Body, Slide, Magazine, Optic, Lens |
| 재사용형 로켓 발사기 | 29,992 | 5,204 | Body, Optic, Lens |
| 일회용 튜브형 발사기 | 5,996 | 3,248 | Body |
| 중량형 로켓 발사기 | 27,900 | 5,160 | Body, Optic, Lens |
| 수류탄 | 3,936 | 1,848 | Body, Lever, PinRing |
| 헬기 장착 기관총 | 11,928 | 5,396 | Base, YawMount, Weapon, ShieldLeft, ShieldRight |

## 부품과 좌표

원본 GLB·OBJ는 -Z 전방, +Y 위쪽입니다. Unity 생성기는 Z 부호와 UV V 방향을 변환해 **+Z 전방, +Y 위쪽**, 1 unit = 1m로 만듭니다. 크기는 게임용 비율입니다.

`Body`는 무기의 기준입니다. `Magazine`, `ChargingHandle`, `Pump`, `Slide`, `Optic` 등을 로컬 Transform으로 움직일 수 있습니다. `Lens`는 `Optic`의 자식입니다. 권총의 Optic은 별도 Body 자식이므로 실제 슬라이드 연동 리그를 만들 때 함께 움직이도록 연결하세요. 총기마다 존재하는 부품은 위 표에 표시되어 있습니다.

`Muzzle`, `SightLine`은 게임 이펙트나 카메라 배치용 참고점입니다. 기능을 실행하는 컴포넌트는 아닙니다. 수류탄에는 `Grip`이 있습니다. 장착 기관총은 `Base → YawMount → Weapon` 구조로, YawMount의 로컬 Y축과 Weapon의 로컬 X축을 회전할 수 있습니다. 양옆 보호판은 Weapon을 따라갑니다.

분리 부품은 외관 그룹입니다. 탄창을 뽑았을 때 보이는 슬롯 내부, 슬라이드 내부, 작동 기구는 완성하지 않았습니다. 재장전용 이동 경로·회전 중심·손 접촉·클리핑은 실제 애니메이션에 맞춰 추가 조정해야 합니다. 핀·레버도 외형만 있습니다.

## 재질과 화면 표현

새 2K 텍스처는 결정적 절차로 만든 반복 표면입니다. 사진 스캔이나 특정 무기에 직접 손으로 그린 고유 텍스처는 아닙니다. 색상·노멀·거칠기와 금속성 패킹을 제공하며 별도 AO, 고해상도 조각에서 베이크한 노멀, Lightmap UV2는 없습니다.

- Built-in Standard, URP Lit, HDRP Lit 중 현재 파이프라인에 맞춰 재질을 생성합니다.
- 색상은 sRGB, 노멀·PBR 마스크는 Linear입니다.
- Unity용 노멀과 glTF용 노멀은 UV V 방향 변환에 맞춰 G 채널이 반대입니다.
- Unity Metallic/Smoothness는 R=Metallic, A=Smoothness. HDRP Mask는 R=Metallic, G=1, B=1, A=Smoothness.
- glTF ORM은 G=Roughness, B=1에 재질 metallicFactor를 곱합니다. R=1은 별도 AO 없음입니다.
- 예제의 StudioReflection은 Built-in/URP의 금속·렌즈를 확인하기 위한 합성 반사 환경입니다. HDRP는 프로젝트의 Sky·Volume·Reflection 설정을 추가로 구성해야 합니다.
- 렌즈는 표면 반사용 PBR 외형입니다. 스코프의 작은 조준선은 장식 메시이며 광학 배율, 관통 시야, 렌더 텍스처 스코프나 ADS 셰이더는 구현하지 않았습니다. 열린 조준기의 유리도 불투명 기본 외형입니다.
- LODGroup 전환은 화면 크기 0.18, 컬링은 0.008입니다. 1인칭 전용 리그에서는 LOD0 고정 등 프로젝트 요구에 맞춰 설정하세요. 예제의 근접 보기 복제본은 LOD0을 사용합니다.

참고 이미지의 완성된 FPS 화면에는 손·장갑 모델, 무기 애니메이션, 조준 렌즈 셰이더, 장면 조명, 환경 반사와 후처리도 기여합니다. 이 팩에는 손·팔, 애니메이션, 발사·반동·재장전·피격·사운드·게임플레이 제어가 없습니다.

## 파일

- `Unity/Assets/FPSWeaponsV2`: Unity 생성기, Runtime 보기 스크립트, LOD 데이터, 텍스처.
- `Models/*.glb`: LOD0과 분리 계층. 용량을 줄이기 위해 **외부 Textures 폴더를 참조**하므로 GLB만 따로 옮기면 텍스처가 누락됩니다.
- `Models/*.obj`, `fps_materials.mtl`: 정지 자세의 OBJ. 그룹은 있지만 부모/자식 계층은 없습니다.
- `Textures/PBR`: GLB·OBJ용 공통 표면 맵. Unity 폴더에는 독립적으로 가져갈 수 있도록 같은 맵이 포함됩니다.
- `Previews`, `collection_preview.jpg`: 실제 메시의 자체 CPU 렌더. Unity 스크린샷은 아닙니다.
- `manifest.json`, `validation.json`: 구성과 검사 결과.
- `texture_provenance.json`: 표면 생성 방식.
- `SourceGenerator`: 선택 사항인 Python 재생성 코드. Python 3, NumPy, Pillow가 필요하며 Unity 사용에는 필요하지 않습니다.

ZIP은 일반 압축 파일입니다. Unity Package Manager에 직접 추가하는 패키지가 아닙니다.
