// buildproto.js - 프로토타입을 단일 HTML 로 묶는다 (본 게임 build.js 와 같은 방식)
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'web', 'proto');
const OUT = path.join(__dirname, 'dist', 'proto.html');

let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

const css = fs.readFileSync(path.join(SRC, 'style.css'), 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">',
  '<style>\n' + css + '\n</style>');

html = html.replace(/<script src="js\/([^"]+)"><\/script>\s*/g, function (_, f) {
  const p = path.join(SRC, f);
  if (!fs.existsSync(p)) throw new Error('없는 파일: ' + f);
  return '<script>\n' + fs.readFileSync(p, 'utf8') + '\n</script>\n';
});

if (/<script src=/.test(html)) throw new Error('묶이지 않은 script 가 남았습니다');
if (/<link rel="stylesheet"/.test(html)) throw new Error('묶이지 않은 css 가 남았습니다');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log('생성됨: dist/proto.html (' + (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB)');
