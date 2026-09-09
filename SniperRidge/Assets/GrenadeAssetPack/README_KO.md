# Sniper Ridge 수류탄 에셋

사용자 제공 `grenade_asset_pack`의 Unity 소스 메시/텍스처를 사용합니다. 올리브색 가상 수류탄 1종이며 LOD0 3,936 / LOD1 1,848 삼각형입니다.

빌더를 게임용으로 수정했습니다. 프로젝트를 열거나 Play/빌드 전에 `Assets/Resources/Grenades`에 프리팹을 자동 생성합니다. 수동 메뉴는 **Sniper Ridge → 수류탄 프리팹 생성 (Grenade Asset Pack)** 입니다. 샘플 씬은 생성하지 않습니다. 기존 에셋 GUID를 유지하며 갱신합니다.

원본의 Z축과 UV V축을 반전하고 삼각형 순서는 유지합니다. 텍스처와 `Grip`/`EffectOrigin` 기준점은 원본 그대로입니다. Built-in/URP/HDRP용 재질 생성을 지원합니다.

**W를 누른 채 마우스로 위치 조준 → W를 놓아 투척**, 우클릭/Esc 취소. 궤적과 예상 폭발 지점이 표시됩니다. 자세한 조작 및 검증 상태는 프로젝트 README를 참고하세요.

원본은 정적 외형이며 별도 핀 제거/손 애니메이션은 포함되어 있지 않습니다. 원본 생성 기록은 `texture_provenance.json`에 있습니다. Unity 실행 검증은 개발 PC에 Unity가 없어 수행하지 못했습니다.
