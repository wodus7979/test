#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
게임 전체를 HTML 한 파일로 합친다.

  python3 tools/build_single.py            → kkukkuki-single.html (그냥 더블클릭해서 실행)
  python3 tools/build_single.py --body OUT  → <body> 안쪽만 (아티팩트/임베드용)

CSS·JS 를 전부 인라인하므로 결과 파일 하나만 있으면 어디서든 돌아간다.
"""
import os, re, sys, io

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))

JS_ORDER = ['core.js', 'sprites.js', 'levels.js', 'world.js', 'entities.js', 'game.js']


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


def body_html():
    """index.html 에서 <body> 안쪽만 뽑아 <script src> 를 인라인으로 바꾼다."""
    html = read('index.html')
    inner = re.search(r'<body[^>]*>(.*?)</body>', html, re.S).group(1)
    inner = re.sub(r'\s*<script src="js/[^"]+"></script>', '', inner).rstrip()

    css = read('css', 'style.css')
    js = '\n'.join(
        '/* ===== js/%s ===== */\n%s' % (name, read('js', name))
        for name in JS_ORDER
    )

    return (
        '<title>꾹꾹이의 대모험</title>\n'
        '<style>\n%s\n</style>\n%s\n<script>\n%s\n</script>\n' % (css, inner, js)
    )


def standalone(body):
    return (
        '<!DOCTYPE html>\n<html lang="ko">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, '
        'minimum-scale=1, user-scalable=no, viewport-fit=cover">\n'
        '<meta name="theme-color" content="#0d1220">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
        '</head>\n<body>\n' + body + '</body>\n</html>\n'
    )


def main():
    body = body_html()
    if '--body' in sys.argv:
        out = sys.argv[sys.argv.index('--body') + 1]
        data = body
    else:
        out = os.path.join(ROOT, 'kkukkuki-single.html')
        data = standalone(body)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(data)
    print('%s  (%.1f KB)' % (os.path.normpath(out), len(data.encode('utf-8')) / 1024))


if __name__ == '__main__':
    main()
