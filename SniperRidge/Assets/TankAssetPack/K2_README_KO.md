# K2 흑표 통합본

사용자가 제공한 `k2_black_panther_3d_asset.zip`의 GLB를 Unity 추가 패키지 없이 사용할 수 있도록 프로젝트 전차 메시 형식으로 변환했습니다. 원본의 `Hull → Turret → Gun` 피벗을 `Hull → Turret → Barrel`에 대응시켜 차체 주행, 포탑 선회, 포신 고각과 총구 발사를 그대로 지원합니다.

- 게임 리소스: `Resources/Tank/Prefabs/k2_black_panther`
- 메시: 약 19,000 삼각형, Hull/Turret/Barrel 3부품
- 재질: Unity용 2K 알베도·노멀·Metallic/Smoothness 및 HDRP Mask 변환본
- 재생성: `python3 Tools/import_k2_asset.py ~/Downloads/k2_black_panther_3d_asset.zip`
- Unity 생성: **Sniper Ridge → 전차 에셋 생성**

원본 압축의 해시는 `Source/k2_import_manifest.json`에 기록했습니다. 저장소에는 Unity 실행에 필요한 변환 데이터와 텍스처만 포함하고 GLB/OBJ 중복본은 포함하지 않습니다.
