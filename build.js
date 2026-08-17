#!/usr/bin/env node
// build.js - web/ 의 모든 파일을 하나의 HTML로 합쳐 dist/minecraft.html 을 만든다.
// 웹뷰(안드로이드 WebView, iOS WKWebView, 파일 열기 등)에서 파일 하나만으로 실행하기 위함.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WEB = path.join(ROOT, 'web');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'minecraft.html');

function read(p) { return fs.readFileSync(path.join(WEB, p), 'utf8'); }

let html = read('index.html');

// <link rel="stylesheet" href="..."> -> <style>
html = html.replace(/<link[^>]*href="([^"]+\.css)"[^>]*>/g, function (_, href) {
  const css = read(href);
  return '<style>\n' + css + '\n</style>';
});

// <script src="..."></script> -> <script>...</script>
html = html.replace(/<script src="([^"]+)"><\/script>/g, function (_, src) {
  const js = read(src);
  // 스크립트 안의 </script> 문자열이 태그를 닫아버리지 않도록 방어
  return '<script>\n/* ==== ' + src + ' ==== */\n' +
    js.replace(/<\/script>/g, '<\\/script>') + '\n</script>';
});

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');

const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log('생성됨: dist/minecraft.html (' + kb + ' KB)');
