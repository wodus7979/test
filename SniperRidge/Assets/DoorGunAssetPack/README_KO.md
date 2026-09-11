# Sniper Ridge 적용본

이 폴더는 사용자가 제공한 `Downloads/door_gun_asset_pack/Unity/Assets/DoorGunAssetPack`에서 복사했습니다. 원본 메시·텍스처·부품 계층을 유지하고 Editor 빌더를 현재 프로젝트에 맞게 수정했습니다.

- Unity를 열거나 Play/빌드 직전에 `Assets/Resources/DoorGun`으로 프리팹·메시·재질을 자동 생성합니다. 수동 메뉴는 **Sniper Ridge → 헬기 중기관총 에셋 생성**입니다.
- 재생성은 기존 생성 에셋 GUID를 유지하며, 샘플 씬을 생성하거나 현재 씬을 바꾸지 않습니다.
- 런타임 `DoorGunView`가 Base/YawMount/Weapon 계층으로 조준하고 Muzzle에서 발사합니다. `GunnerHands`가 RearGripLeft/Right에 장갑 낀 양손·손가락·소매를 생성합니다. 손은 원본 팩에 포함된 에셋이 아닙니다.
- 아래 내용은 제공받은 원본 안내입니다. `Generated` 경로와 Tools 메뉴 안내는 원본 단독 사용법이며, 이 게임 적용본에는 위의 자동 생성 경로/메뉴를 사용하세요.

---

# 사진 참고형 헬기 장착 기관총 — Unity 3D 에셋

첨부 사진의 긴 단일 총열, 주변 지지봉, 각진 총몸, 뒤쪽 손잡이와 양옆 보호판을 참고한 게임용 외형 모델입니다. 장착 받침과 사진에서 가려진 부분은 해석해 보완했습니다. 특정 실물의 정밀 복제품은 아니며 헬리콥터와 인물은 포함하지 않습니다.

## Unity에서 사용하기

1. `Unity/Assets/DoorGunAssetPack` 폴더를 프로젝트의 `Assets` 안으로 복사합니다.
2. 컴파일이 끝나면 **Tools → Mounted Machine Gun → Build Assets and Sample Scene**을 실행합니다.
3. `Generated/Scenes/DoorGun_Showcase.unity`를 열어 확인합니다.
4. `Generated/Prefabs/door_gun_reference.prefab`을 원하는 씬에 배치합니다.

Mesh·Material·LODGroup·BoxCollider·Prefab과 예제 Scene을 만드는 Editor 스크립트가 포함되어 있습니다. 별도 GLB 임포터나 Blender는 필요하지 않습니다. 다시 실행하면 새 Generated 폴더가 생기므로 이전 생성 결과를 덮어쓰지 않습니다.

**Unity Editor에서 C# 컴파일, 임포트, 렌더링과 Play Mode를 실행해 검증하지 못했습니다.** 자체 검사에서 메시, UV, 노멀, GLB 계층, 텍스처 연결 및 좌우·상하 회전 좌표 변환을 확인했습니다.

## 구성과 움직임

| 부품 | 역할 |
|---|---|
| Base | 고정 받침과 소켓 |
| Base/YawMount | 장착대. 로컬 Y축을 회전하면 전체 기관총이 좌우로 돌아갑니다. |
| Base/YawMount/Weapon | 총몸·총열·손잡이. 로컬 X축으로 상하 각도를 바꿉니다. |
| Weapon/ShieldLeft, ShieldRight | 좌우 보호판. 총몸 회전을 함께 따라갑니다. |
| Weapon/Muzzle | 총열 끝의 빈 Transform. Unity에서 로컬 +Z가 앞쪽입니다. |
| Weapon/RearGripLeft, RearGripRight | 뒤쪽 손잡이 위치의 빈 Transform |

Unity는 +Z 전방, +Y 위쪽입니다. 로컬 X축의 음수 회전이 총열을 위로 올리는 방향입니다. 각도 제한과 조준 제어는 프로젝트에서 설정합니다. 기존 헬리콥터에 자동 부착하거나 헬리콥터 파일을 수정하지 않았습니다.

- LOD0: **11,928 삼각형**. LOD1: **5,396 삼각형**.
- 게임용 미터 단위. 받침 포함 정지 자세의 전체 크기는 약 **0.61m 폭 × 1.00m 높이 × 2.38m 길이**입니다. 사진으로 비율을 추정한 값으로 실물 치수가 아닙니다.
- 하나의 LODGroup이 5개 부품의 LOD를 함께 전환합니다. 화면상 크기 0.18에서 LOD1로 전환하고 0.008 이하에서는 컬링합니다.
- 받침과 총몸을 근사하는 BoxCollider 2개가 있습니다. 총열과 보호판을 정확히 따라가는 충돌체는 없습니다.
- 조준·발사·반동·재장전 애니메이션, 탄약, 소리, 효과와 플레이어 손은 포함하지 않습니다. 외관과 연결 기준점만 제공합니다.

## 재질과 형식

흑회색 도장·금속에 기존 생성 금속 표면의 1K 색상·노멀·거칠기/PBR 맵을 재사용했습니다. 노멀·거칠기는 이미지에서 추정한 값이며, 실측 재질이나 개별 부위의 고유 마모 텍스처는 아닙니다. 고무와 어두운 홈은 기본 PBR 값입니다.

생성기는 Built-in Standard / URP Lit / HDRP Lit 중 현재 파이프라인에 맞춰 재질을 구성합니다. 조명·노출·반사 환경에 따라 외관이 달라집니다.

색상은 sRGB, 노멀과 마스크는 Linear로 읽습니다. Unity용 노멀과 glTF용 노멀은 UV V축 변환에 맞춰 G 채널이 반대입니다. Metallic/Smoothness는 R=Metallic, A=Smoothness이며 HDRP Mask는 R=Metallic, G=1, B=1, A=Smoothness입니다. glTF ORM은 G=Roughness, B=1에 metallicFactor를 곱합니다. 별도 AO 베이크는 없습니다.

## 포함 파일

- `Models/door_gun_reference.glb`: 텍스처 내장 LOD0, 부품 계층과 회전 중심 보존.
- `Models/door_gun_reference.obj`, `door_gun_materials.mtl`: 정지 자세 OBJ. 부품 그룹은 있지만 부모/자식 회전 계층은 없습니다. `Textures`를 함께 보관하세요.
- `Unity/Assets/DoorGunAssetPack`: LOD0·LOD1 소스, 텍스처, Unity 생성기.
- `door_gun_preview.jpg`, `door_gun_rear.jpg`, `door_gun_side.jpg`: 실제 메시의 자체 CPU 렌더 미리보기. Unity 화면은 아닙니다.
- `manifest.json`, `validation.json`: 수량과 검사 기록.
- `texture_provenance.json`: 재사용 텍스처 생성 기록.
- `SourceGenerator`: 선택 사항인 Python 제작 코드. Unity 사용에는 필요하지 않습니다.

원본 GLB·OBJ는 -Z 전방, +Y 위쪽이며 Unity 생성기가 좌표와 UV 방향을 변환합니다. ZIP은 일반 압축 파일로 Unity Package Manager용 패키지가 아닙니다.
