// 앱(안드로이드·iOS)에 넣을 웹 파일을 www/ 폴더로 모읍니다.
//   npm run build:web
// 어떤 파일이 앱에 필요한지는 서비스 워커(sw.js)의 PRECACHE 목록을 그대로 씁니다.
// (오프라인 PWA 와 앱이 같은 파일 목록을 쓰므로, 파일을 추가할 때 한 곳만 고치면 됩니다)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'www');

function precacheList() {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const m = sw.match(/const PRECACHE = (\[[\s\S]*?\]);/);
  return JSON.parse(m[1].replace(/'/g, '"').replace(/,\s*\]/, ']')).filter((f) => f !== './');
}

fs.rmSync(OUT, { recursive: true, force: true });
const files = precacheList();
for (const f of files) {
  const dest = path.join(OUT, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(ROOT, f), dest);
}
console.log(`www/ 에 ${files.length}개 파일을 복사했습니다.`);
