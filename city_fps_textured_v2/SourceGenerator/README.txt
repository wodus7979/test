텍스처 v2 재생성 도구

Unity에서 사용하는 데 Python 실행은 필요하지 않습니다.
Python 코드는 재질/UV를 수정하는 제작자를 위한 선택 사항입니다.
Python 3, NumPy, Pillow가 필요합니다. 재생성 전 패키지를 별도로 복사하세요.

패키지 루트에서:
  python SourceGenerator/build_textured.py
  python SourceGenerator/validate_geometry.py
  python SourceGenerator/render_textured.py

build_textured.py는 Textures/Sources에 보관된 원본 이미지에서 데이터 맵을
계산하고, Source JSON/GLB/OBJ/MTL/Unity 텍스처를 갱신합니다.
AI를 재호출하거나 비용을 발생시키지 않습니다. 기존 메시와 배치를 사용합니다.
Unity에서 이미 생성한 Generated 폴더는 갱신하지 않습니다.
Unity 메뉴의 Build Assets and Sample Scene을 다시 실행해 새 결과를 만드세요.

원본 v1과의 회귀 검증(기존 city_fps_asset_pack 필요):
  python SourceGenerator/validate_textures.py --base /path/to/city_fps_asset_pack

프리뷰의 한글 폰트가 없으면 CITY_KOREAN_FONT 환경 변수에 폰트 경로를 지정하세요.
프리뷰는 CPU 기반 근사 렌더로 Unity 조명 결과를 대체하지 않습니다.

BaseGeometry 폴더는 텍스처를 추가하기 전의 v1 형상 생성 코드입니다.
그 안의 README를 따라 별도 폴더에 생성하세요. v2 폴더에 덮어쓰지 마세요.
