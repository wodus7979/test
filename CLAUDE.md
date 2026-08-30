# 우리 여행 발자국

사진의 촬영 위치(EXIF GPS)를 읽어 다녀온 **국내 시·군·구**를 지도에 칠하는 도구.
**서울은 집계에서 제외**한다 (사용자 요청).

## 사용자의 전제 — 바뀌지 않음

- **서비스 이용은 스마트폰(안드로이드)에서 한다.** PC 는 빌드 용도로만 쓴다
- 사진을 **압축하거나 파일명·확장자를 바꾸는 방식은 쓰지 않는다**

## 왜 앱이 필요한가

안드로이드는 갤러리의 사진을 다른 앱에 넘길 때 EXIF 의 GPS 태그를 지운다. 브라우저도
예외가 아니라 웹페이지로는 기존 사진의 위치를 읽을 수 없다. 그 자리에서 카메라로 찍은
사진만 위치가 남는 것도 이 때문이다(사용자가 직접 확인함).

`ACCESS_MEDIA_LOCATION` 권한을 가진 앱이 `MediaStore.setRequireOriginal()` 로 요청하면
지워지지 않은 원본을 받는다. `android-app/` 은 그 한 가지를 하려고 존재한다.

## 구성

| 경로 | 무엇 |
|---|---|
| `travel_map.html` | 지도·집계·서울 제외·UI 전부. 단일 파일, 외부 의존 없음 |
| `geo.json` | 통계청 행정구역 경계(2013) 단순화, 251개 시·군·구 |
| `scan_photos.py` | 폴더를 훑는 오프라인 스캐너 (표준 라이브러리만) |
| `android-app/` | 안드로이드 앱. 스캔만 하고 지도는 WebView 가 그린다 |

**로직을 중복 구현하지 말 것.** 지역 판정·서울 제외·집계는 `travel_map.html` 에만 있다.
앱은 좌표 목록을 `window.__SCAN__ = {files, points:[{lat,lon,t}]}` 로 넘길 뿐이다.
`__SCAN__` 이 있으면 페이지가 `app-mode` 로 바뀌어 파일 넣는 UI 를 감춘다.

`android-app/app/src/main/assets/travel_map.html` 은 루트의 `travel_map.html` 사본이다.
페이지를 고치면 **양쪽을 함께 갱신**해야 한다.

## 지금 할 일

`android-app` 을 빌드해서 폰에 설치하는 것. 아직 아무도 빌드해 본 적이 없다.

```
cd android-app
./gradlew assembleDebug          # 윈도우는 gradlew.bat
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 검증 상태

했음:
- `MainActivity.kt` 를 Android API 스텁 37개와 함께 kotlinc 1.9.24 로 컴파일 — 오류 0
- XML 9개 유효성, 리소스 참조 해석, 레이아웃 id 와 코드 일치
- 페이지 쪽은 앱과 같은 형식의 `__SCAN__` 주입으로 브라우저에서 확인
- 웹 경로(낱개 파일 93장 / ZIP / 폴더 선택 / 테이크아웃 JSON) 모두 회귀 통과

**안 했음 — 여기서부터가 남은 일:**
- 실제 Gradle 빌드 (작성 환경에 Android SDK 없음, `dl.google.com` 차단)
- APK 설치와 기기 동작
- 특히 `setRequireOriginal()` 이 이 기기에서 실제로 원본 좌표를 주는지

버전 조합은 AGP 8.5.2 / Kotlin 1.9.24 / Gradle 8.7 / compileSdk 34 / minSdk 24.
Android Studio 가 업그레이드를 제안하면 받아들여도 된다.

## 브랜치

작업 브랜치는 `claude/google-photos-travel-map-653j6x`. main 에 직접 푸시하지 말 것.
