// 간단한 정적 서버:  npm start  →  http://localhost:8000
// 마이크는 https 또는 localhost 에서만 쓸 수 있어서, 파일을 더블클릭해 열기보다 이 서버로 여는 것을 권장합니다.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.musicxml': 'application/xml',
  '.xml': 'application/xml',
  '.png': 'image/png',
};

function createServer() {
  return http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

if (require.main === module) {
  const port = +process.env.PORT || 8000;
  createServer().listen(port, () => console.log(`http://localhost:${port} 에서 열어 주세요`));
}

module.exports = { createServer };
