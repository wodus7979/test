#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""WebCraft — 클로드 다리

게임 속 동료 Ellie 가 하는 말을, 이 컴퓨터에 깔린 Claude Code 에게 건네주고
답을 받아 오는 작은 중계소다. 열쇠(API 키)를 넣지 않아도 되고, 이미 쓰고 있는
Claude Code 로 답이 나온다.

  python3 tools/claude-bridge.py

켜면 암호를 하나 찍어 준다. 그 암호를 게임 시작 화면에 붙여 넣으면 된다.

바깥에서는 못 들어온다 — 127.0.0.1 에만 귀를 연다. 그리고 암호가 맞아야만
답한다. 암호를 두는 까닭은, 이 컴퓨터에서 열어 둔 아무 웹페이지나 이 다리를
몰래 써 버리는 것을 막기 위해서다.
"""

import argparse
import json
import re
import secrets
import shutil
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8124
TIMEOUT = 90          # 초. 이보다 오래 걸리면 포기한다
MAX_BODY = 256 * 1024  # 한 번에 받는 글의 최대 크기

# 동료는 이야기만 하면 된다. 파일을 읽거나 명령을 돌릴 일이 없으므로
# 도구를 모두 떼어 둔다 (--restricted 로도 한 번 더 막는다).
NO_TOOLS = ('Bash Edit Write Read Glob Grep WebFetch WebSearch '
            'Task NotebookEdit TodoWrite')


def ask_claude(system, prompt, model):
    """claude 를 한 번 부르고 답만 돌려준다. 실패하면 (None, 까닭)."""
    exe = shutil.which('claude')
    if not exe:
        return None, 'claude 명령을 찾지 못했습니다. Claude Code 가 깔려 있는지 보세요.'
    cmd = [exe, '-p',
           '--restricted',                # 명령·코드 실행 도구를 뺀다
           '--strict-mcp-config',         # 다른 MCP 서버를 끌어오지 않는다
           '--disable-slash-commands',
           '--disallowed-tools', NO_TOOLS,
           '--output-format', 'json',
           '--system-prompt', system]
    if model:
        cmd += ['--model', model]
    cmd.append(prompt)
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=TIMEOUT)
    except subprocess.TimeoutExpired:
        return None, '클로드가 %d초 안에 답하지 않았습니다.' % TIMEOUT
    except OSError as e:
        return None, 'claude 를 실행하지 못했습니다 — %s' % e
    if r.returncode != 0:
        return None, 'claude 가 오류로 끝났습니다 — %s' % (r.stderr or '')[:200].strip()
    try:
        out = json.loads(r.stdout)
    except ValueError:
        return None, '클로드의 답을 읽지 못했습니다 — %s' % r.stdout[:200].strip()
    text = (out.get('result') or '').strip()
    if out.get('is_error') or not text:
        return None, text or '빈 답이 돌아왔습니다.'
    return text, None


def flatten(messages):
    """주고받은 말을 한 덩어리 글로 편다. claude -p 는 글 하나만 받는다."""
    lines = []
    for m in messages:
        who = 'Player' if m.get('role') == 'user' else 'Ellie'
        body = str(m.get('content', ''))
        lines.append('%s: %s' % (who, body))
    return '\n\n'.join(lines)


class Bridge(BaseHTTPRequestHandler):
    server_version = 'WebCraftBridge'
    token = ''
    model = ''

    # ── 잔손질 ────────────────────────────────────────────────────────
    def cors(self):
        # 게임은 file:// 로 열리는 일이 많아 출처가 null 이다. 그래서 * 로 연다.
        # 대신 암호를 요구하므로 아무나 쓰지는 못한다.
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'content-type, authorization')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Max-Age', '600')

    def reply(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.cors()
        self.send_header('content-type', 'application/json; charset=utf-8')
        self.send_header('content-length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass

    def allowed(self):
        got = self.headers.get('authorization', '')
        want = 'Bearer ' + Bridge.token
        # 길이가 같을 때만 한 글자씩 비교해도 되도록 compare_digest 를 쓴다
        return len(got) == len(want) and secrets.compare_digest(got, want)

    # ── 길목 ──────────────────────────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header('content-length', '0')
        self.end_headers()

    def do_GET(self):
        if self.path.split('?')[0] == '/ping':
            self.reply(200, {'ok': True, 'name': 'webcraft-claude-bridge'})
        else:
            self.reply(404, {'error': '없는 길입니다'})

    def do_POST(self):
        if self.path.split('?')[0] != '/ask':
            self.reply(404, {'error': '없는 길입니다'})
            return
        if not self.allowed():
            self.reply(401, {'error': '암호가 다릅니다'})
            return
        try:
            n = int(self.headers.get('content-length') or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > MAX_BODY:
            self.reply(400, {'error': '글의 크기가 알맞지 않습니다'})
            return
        try:
            req = json.loads(self.rfile.read(n).decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            self.reply(400, {'error': '글을 읽지 못했습니다'})
            return

        system = str(req.get('system') or '').strip()
        messages = req.get('messages')
        if not system or not isinstance(messages, list) or not messages:
            self.reply(400, {'error': 'system 과 messages 가 있어야 합니다'})
            return

        text, why = ask_claude(system, flatten(messages), Bridge.model)
        if text is None:
            print('  ! %s' % why)
            self.reply(502, {'error': why})
            return
        # 소리 내어 읽으므로 표시 문자는 걷어낸다
        text = re.sub(r'[*_`#]', '', text).strip()
        print('  → %s' % text[:70])
        self.reply(200, {'text': text})

    def log_message(self, fmt, *args):
        pass   # 기본 접속 기록은 시끄러우므로 끈다


def main():
    ap = argparse.ArgumentParser(description='WebCraft 동료를 이 컴퓨터의 Claude Code 에 잇는다')
    ap.add_argument('--port', type=int, default=PORT, help='귀를 열 포트 (기본 %d)' % PORT)
    ap.add_argument('--model', default='', help="쓸 모델 (예: haiku, sonnet, opus). 비우면 Claude Code 기본값")
    ap.add_argument('--token', default='', help='암호를 직접 정하고 싶을 때')
    a = ap.parse_args()

    if not shutil.which('claude'):
        print('\n  claude 명령을 찾지 못했습니다.')
        print('  Claude Code 를 깔고 한 번 로그인한 뒤에 다시 켜 주세요.\n')
        return 1

    Bridge.token = a.token or secrets.token_urlsafe(18)
    Bridge.model = a.model

    print('')
    print('  WebCraft ─ 클로드 다리를 켰습니다.')
    print('  ────────────────────────────────────────────────')
    print('  주소   http://localhost:%d' % a.port)
    print('  모델   %s' % (a.model or 'Claude Code 기본값'))
    print('')
    print('  암호   %s' % Bridge.token)
    print('')
    print('  이 암호를 게임 시작 화면의 "다리 암호" 칸에 붙여 넣으세요.')
    print('  그리고 동료 AI 모델에서 "내 컴퓨터의 Claude Code" 를 고르면 됩니다.')
    print('  이 창을 닫으면 다리가 끊깁니다.  (멈추기: Ctrl+C)')
    print('')

    try:
        ThreadingHTTPServer(('127.0.0.1', a.port), Bridge).serve_forever()
    except KeyboardInterrupt:
        print('\n  다리를 내렸습니다.\n')
    except OSError as e:
        print('\n  포트 %d 를 열지 못했습니다 — %s' % (a.port, e))
        print('  이미 다리가 켜져 있는지 보시고, 아니면 --port 로 다른 번호를 주세요.\n')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
