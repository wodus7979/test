선택 사항: Python 제작 코드

Unity에서 패키지를 쓰는 데 Python은 필요하지 않습니다.
재생성할 경우 패키지 사본에서 실행하세요. 결과 파일을 덮어씁니다.
필요 라이브러리: Python 3, NumPy, Pillow.

패키지 루트에서 순서대로:
  python SourceGenerator/build_nature.py
  python SourceGenerator/bake_textures.py
  python SourceGenerator/connect_export.py
  python SourceGenerator/validate_nature.py
  python SourceGenerator/render_nature.py

마지막 렌더링은 주요 미리보기 4장을 생성합니다. meadow_detail.jpg는 별도 배치 미리보기입니다.
다른 경로로 만들려면 각 명령 마지막에 출력 패키지의 절대 경로를 지정하세요.
새 경로에는 기존 Textures/Sources의 원본 PNG를 먼저 복사해야 합니다.
Unity Editor 스크립트는 Python에서 재생성하지 않으므로 별도 보관하세요.

AI 이미지 재생성이나 네트워크 호출은 하지 않습니다. 원본 PNG에서 PBR 보조 데이터를 계산합니다.
한글 폰트가 없으면 NATURE_KOREAN_FONT 환경 변수에 .ttf/.ttc 경로를 지정하세요.
렌더링은 자체 CPU 근사 렌더이며 Unity 화면과 다릅니다.
