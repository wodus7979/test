#!/usr/bin/env node
// build3d.js - web3d/ 를 하나의 HTML 로 합쳐 dist/webcraft3d.html 을 만든다.
// (블록판은 build.js -> dist/minecraft.html 로 따로 만든다)
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WEB = path.join(ROOT, 'web3d');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'webcraft3d.html');

function read(p) { return fs.readFileSync(path.join(WEB, p), 'utf8'); }

let html = read('index.html');

html = html.replace(/<link[^>]*href="([^"]+\.css)"[^>]*>/g, function (_, href) {
  return '<style>\n' + read(href) + '\n</style>';
});

html = html.replace(/<script src="([^"]+)"><\/script>/g, function (_, src) {
  const js = read(src);
  return '<script>\n/* ==== ' + src + ' ==== */\n' +
    js.replace(/<\/script>/g, '<\\/script>') + '\n</script>';
});

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log('생성됨: dist/webcraft3d.html (' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB)');
