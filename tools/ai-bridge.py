#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""WebCraft — AI 다리

게임 속 동료 Ellie 가 하는 말을, 이 컴퓨터에 깔린 AI 도구에게 건네주고 답을
받아 오는 작은 중계소다. 열쇠(API 키)를 넣지 않아도 되고, 이미 쓰고 있는
구독으로 답이 나온다.

  · claude — Claude Code            (claude.ai Pro·Max 구독)
  · codex  — OpenAI Codex CLI       (ChatGPT Plus·Pro 구독)

둘 다 처음 한 번 로그인해 두면 그 뒤로는 열쇠가 필요 없다. Codex 쪽 로그인이
바로 "Sign in with ChatGPT" — OAuth 다. 브라우저에서는 그 OAuth 를 쓸 수 없지만
(돌아올 주소를 등록할 수 없다), 이렇게 CLI 를 거치면 쓸 수 있다.

  python3 tools/claude-bridge.py

켜면 암호를 하나 찍어 준다. 그 암호를 게임 시작 화면에 붙여 넣으면 된다.

바깥에서는 못 들어온다 — 127.0.0.1 에만 귀를 연다. 그리고 암호가 맞아야만
답한다. 암호를 두는 까닭은, 이 컴퓨터에서 열어 둔 아무 웹페이지나 이 다리를
몰래 써 버리는 것을 막기 위해서다.
"""

import argparse
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8124
TIMEOUT = 90          # 초. 이보다 오래 걸리면 포기한다
MAX_BODY = 256 * 1024  # 한 번에 받는 글의 최대 크기

# 동료는 이야기만 하면 된다. 파일을 읽거나 명령을 돌릴 일이 없으므로
# 도구를 모두 떼어 둔다 (--restricted 로도 한 번 더 막는다).
NO_TOOLS = ('Bash Edit Write Read Glob Grep WebFetch WebSearch '
            'Task NotebookEdit TodoWrite')


class Warm:
    """claude 를 한 번만 띄워 놓고 계속 쓴다.

    매번 새로 띄우면 뜨는 데만 1~2.5초가 들고, 그때마다 밑글 1만5천 토큰을
    새로 만든다. 띄워 두면 그 둘이 사라진다 — 재 보니 5초가 3초로 줄고
    토큰은 1만5천에서 200으로 줄었다 (나머지는 캐시에서 읽는다).

    지침이 바뀌거나(영어 수준을 바꾼 때) 너무 오래 쓴 프로세스는 새로 띄운다.
    """

    MAX_TURNS = 40          # 이만큼 주고받았으면 새로 띄운다 (맥락이 계속 자란다)

    def __init__(self):
        self.p = None
        self.err = None
        self.system = None
        self.model = None
        self.turns = 0
        self.lock = threading.Lock()

    def why_dead(self):
        """끝난 까닭을 claude 가 남긴 말에서 찾아 온다."""
        code = self.p.returncode if self.p else None
        tail = ''
        try:
            if self.err:
                self.err.seek(0)
                lines = [l.strip() for l in self.err.read().splitlines() if l.strip()]
                if lines:
                    tail = ' — ' + ' / '.join(lines[-2:])[:200]
        except OSError:
            pass
        return (' (끝난 값 %s)' % code if code is not None else '') + tail

    def _spawn(self, system, model):
        exe = shutil.which('claude')
        if not exe:
            return 'claude 명령을 찾지 못했습니다. Claude Code 가 깔려 있는지 보세요.'
        cmd = [exe, '-p',
               '--restricted', '--strict-mcp-config', '--disable-slash-commands',
               '--disallowed-tools', NO_TOOLS,
               '--input-format', 'stream-json',
               '--output-format', 'stream-json',
               '--include-partial-messages',   # 글자가 오는 대로 흘려 받는다
               '--verbose',
               '--system-prompt', system]
        if model:
            cmd += ['--model', model]
        try:
            self.err = tempfile.TemporaryFile(mode='w+')
            self.p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                      stderr=self.err, text=True, bufsize=1)
        except OSError as e:
            self.p = None
            return 'claude 를 띄우지 못했습니다 — %s' % e
        self.system = system
        self.model = model
        self.turns = 0
        return None

    def _dead(self):
        return self.p is None or self.p.poll() is not None

    def stop(self):
        if self.p:
            try:
                self.p.stdin.close()
                self.p.terminate()
            except OSError:
                pass
        self.p = None
        if self.err:
            try:
                self.err.close()
            except OSError:
                pass
            self.err = None

    def ask(self, system, model, msgs, on_delta=None):
        """(답, 까닭, 처음인가). 처음이면 그동안의 말을 다 보내야 한다.

        on_delta 를 주면 글자가 오는 대로 넘겨준다 — 게임은 그것으로 첫 문장이
        되자마자 읽기 시작한다. 첫 글자는 0.8초쯤에 온다.
        """
        with self.lock:
            fresh = False
            if self._dead() or system != self.system or model != self.model \
                    or self.turns >= self.MAX_TURNS:
                self.stop()
                why = self._spawn(system, model)
                if why:
                    return None, why, True
                fresh = True
            # 띄워 둔 프로세스는 앞말을 기억한다. 새로 띄웠을 때만 다 보낸다.
            prompt = flatten(msgs) if fresh else str(msgs[-1].get('content', ''))
            try:
                self.p.stdin.write(json.dumps(
                    {'type': 'user', 'message': {'role': 'user', 'content': prompt}}) + '\n')
                self.p.stdin.flush()
            except (OSError, ValueError) as e:
                self.stop()
                return None, '말을 건네지 못했습니다 — %s' % e, fresh

            # 너무 오래 걸리면 프로세스를 끊어 읽기가 풀리게 한다
            killer = threading.Timer(TIMEOUT, self.stop)
            killer.start()
            text = ''
            try:
                for line in self.p.stdout:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        ev = json.loads(line)
                    except ValueError:
                        continue
                    t = ev.get('type')
                    if t == 'stream_event' and on_delta:
                        d = ev.get('event', {})
                        if d.get('type') == 'content_block_delta':
                            piece = (d.get('delta') or {}).get('text') or ''
                            if piece:
                                on_delta(piece)
                    elif t == 'assistant':
                        for c in ev['message'].get('content', []):
                            if c.get('type') == 'text':
                                text += c['text']
                    elif t == 'result':
                        break
            except (OSError, ValueError):
                pass
            finally:
                killer.cancel()

            # 답을 먼저 본다. 판에 따라 클로드가 한 마디 하고 바로 끝나기도 하는데,
            # 살아 있는지부터 따지면 멀쩡히 받아 둔 답을 버리게 된다.
            # (끝났으면 다음에 물을 때 저절로 새로 띄운다)
            text = text.strip()
            if text:
                self.turns += 1
                return text, None, fresh
            if self._dead():
                why = self.why_dead()
                self.stop()
                return None, '클로드가 답을 주지 못하고 끝났습니다%s' % why, fresh
            self.turns += 1
            return None, '빈 답이 돌아왔습니다.', fresh


WARM = Warm()


class CodexWarm:
    """codex 를 app-server 로 한 번만 띄워 놓고 계속 쓴다.

    codex exec 는 부를 때마다 새로 뜨고 다 받은 뒤에야 답을 준다. app-server 는
    stdio 로 JSON-RPC 를 주고받는 상주 서버라, 한 번 띄워 두면
      · 뜨는 값이 사라지고
      · item/agentMessage/delta 로 글자가 오는 대로 흘려 받을 수 있다.
    (프로토콜은 codex app-server generate-json-schema 로 뽑아 맞췄다.)

    실험 기능이라 안 되는 판이 있을 수 있다 — 그러면 codex exec 로 되돌아간다.
    """

    MAX_TURNS = 40

    def __init__(self):
        self.p = None
        self.thread = None
        self.system = None
        self.model = None
        self.turns = 0
        self.rid = 0
        self.lock = threading.Lock()
        self.lines = []
        self.cv = threading.Condition()
        self.work = None

    # ── 밑바닥 ────────────────────────────────────────────────────────
    def _pump(self):
        for line in self.p.stdout:
            line = line.strip()
            if not line:
                continue
            with self.cv:
                self.lines.append(line)
                self.cv.notify_all()

    def _send(self, method, params=None):
        self.rid += 1
        msg = {'jsonrpc': '2.0', 'id': self.rid, 'method': method}
        if params is not None:
            msg['params'] = params
        self.p.stdin.write(json.dumps(msg) + '\n')
        self.p.stdin.flush()
        return self.rid

    def _wait(self, rid, deadline, on_delta=None):
        """그 요청의 답이 올 때까지 기다린다. 오는 알림은 on_delta 로 흘린다."""
        seen = 0
        while time.time() < deadline:
            with self.cv:
                while seen >= len(self.lines):
                    left = deadline - time.time()
                    if left <= 0:
                        return None, '시간이 지났습니다'
                    self.cv.wait(min(0.5, left))
                line = self.lines[seen]
                seen += 1
            try:
                m = json.loads(line)
            except ValueError:
                continue
            meth = m.get('method')
            if meth == 'item/agentMessage/delta' and on_delta:
                on_delta((m.get('params') or {}).get('delta') or '')
            elif meth == 'error':
                return None, json.dumps((m.get('params') or {}), ensure_ascii=False)[:200]
            if m.get('id') == rid:
                if 'error' in m:
                    return None, json.dumps(m['error'], ensure_ascii=False)[:200]
                return m.get('result'), None
        return None, '시간이 지났습니다'

    def _wait_turn(self, rid, deadline, on_delta):
        """한 차례가 끝날 때까지 기다린다.

        끝은 turn/completed 알림으로 안다. turn/start 의 답은 접수 확인이라
        그것만 보고 돌아서면 아직 오지 않은 말을 놓친다.
        """
        seen = 0
        result = None
        last = None
        while time.time() < deadline:
            with self.cv:
                while seen >= len(self.lines):
                    left = deadline - time.time()
                    if left <= 0:
                        return result, last or '시간이 지났습니다'
                    self.cv.wait(min(0.5, left))
                line = self.lines[seen]
                seen += 1
            try:
                m = json.loads(line)
            except ValueError:
                continue
            meth = m.get('method')
            if meth == 'item/agentMessage/delta':
                on_delta((m.get('params') or {}).get('delta') or '')
            elif meth == 'error':
                # "Reconnecting... 2/5" 같은 것은 다시 해 보는 중이라는 말이다.
                # 여기서 포기하면 저절로 나을 일도 실패로 만든다. 적어만 두고
                # 계속 기다렸다가, 끝내 안 끝나면 그때 이 까닭을 알려 준다.
                last = json.dumps(m.get('params') or {}, ensure_ascii=False)[:200]
                continue
            elif meth == 'turn/completed':
                pa = m.get('params') or {}
                if not self.thread or pa.get('threadId') == self.thread:
                    return pa, None
            if m.get('id') == rid:
                if 'error' in m:
                    return None, json.dumps(m['error'], ensure_ascii=False)[:200]
                result = m.get('result')
        return result, last or '시간이 지났습니다'

    def _dead(self):
        return self.p is None or self.p.poll() is not None

    def stop(self):
        if self.p:
            try:
                self.p.stdin.close()
                self.p.terminate()
            except OSError:
                pass
        self.p = None
        self.thread = None

    def _spawn(self, system, model):
        exe = shutil.which('codex')
        if not exe:
            return 'codex 명령을 찾지 못했습니다.'
        try:
            self.p = subprocess.Popen([exe, 'app-server'], stdin=subprocess.PIPE,
                                      stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                      text=True, bufsize=1)
        except OSError as e:
            self.p = None
            return 'codex app-server 를 띄우지 못했습니다 — %s' % e
        self.lines = []
        self.rid = 0
        threading.Thread(target=self._pump, daemon=True).start()

        end = time.time() + 30
        rid = self._send('initialize', {'clientInfo': {
            'name': 'webcraft', 'title': 'WebCraft', 'version': '1.0'}})
        r, why = self._wait(rid, end)
        if why:
            self.stop()
            return 'codex 와 인사하지 못했습니다 — %s' % why

        # 동료는 이야기만 한다. 빈 폴더에서 읽기 전용으로, 승인은 묻지 않게.
        self.work = tempfile.mkdtemp(prefix='webcraft-codex-')
        params = {
            'cwd': self.work,
            'sandbox': 'read-only',
            'approvalPolicy': 'never',
            'ephemeral': True,
            'baseInstructions': system,
        }
        if model:
            params['model'] = model
        rid = self._send('thread/start', params)
        r, why = self._wait(rid, end)
        if why or not r:
            self.stop()
            return 'codex 실을 열지 못했습니다 — %s' % (why or '빈 답')
        self.thread = r.get('threadId') or r.get('thread', {}).get('id')
        if not self.thread:
            self.stop()
            return 'codex 가 실 번호를 주지 않았습니다'
        self.system = system
        self.model = model
        self.turns = 0
        return None

    # ── 물어보기 ──────────────────────────────────────────────────────
    def ask(self, system, model, msgs, on_delta=None):
        with self.lock:
            fresh = False
            if self._dead() or system != self.system or model != self.model \
                    or self.turns >= self.MAX_TURNS:
                self.stop()
                why = self._spawn(system, model)
                if why:
                    return None, why, True
                fresh = True
            prompt = flatten(msgs) if fresh else str(msgs[-1].get('content', ''))
            text = ['']

            def delta(d):
                text[0] += d
                if on_delta and d:
                    on_delta(d)

            rid = self._send('turn/start', {
                'threadId': self.thread,
                'input': [{'type': 'text', 'text': prompt}],
            })
            # turn/start 의 답은 "접수했다"일 뿐이라 그것만 보고 끝내면 안 된다.
            # 말이 다 끝났다는 turn/completed 알림을 기다린다.
            r, why = self._wait_turn(rid, time.time() + TIMEOUT, delta)
            # 클로드 쪽과 같은 함정을 피한다 — 받아 둔 말이 있으면 그것부터 쓴다.
            # (도중에 끊겼더라도 이미 온 문장은 멀쩡하다)
            if why and not text[0].strip():
                self.stop()
                return None, why, fresh
            self.turns += 1
            out = text[0].strip()
            if not out:
                # 흘러온 조각이 없으면 결과 안에서 찾아본다
                try:
                    items = ((r or {}).get('turn') or {}).get('items') or []
                    for it in items:
                        if it.get('type') in ('agentMessage', 'assistantMessage'):
                            out = (it.get('text') or it.get('content') or '').strip()
                except Exception:
                    pass
            if not out:
                return None, '빈 답이 돌아왔습니다.', fresh
            return out, None, fresh


CODEX = CodexWarm()


def ask_codex(system, prompt, model):
    """Codex CLI 로 한 번 묻는다. ChatGPT 구독으로 나간다.

    codex 는 --system-prompt 가 없어서 지침을 글 맨 앞에 붙여 보낸다.
    답은 -o 로 받는다 (화면에는 진행 상황이 섞여 나오므로 파일이 깨끗하다).
    빈 폴더를 일터로 주어, 곁에 있는 파일이나 AGENTS.md 를 끌어오지 않게 한다.
    """
    exe = shutil.which('codex')
    if not exe:
        return None, 'codex 명령을 찾지 못했습니다. Codex CLI 를 깔고 codex login 을 해 주세요.'
    with tempfile.TemporaryDirectory(prefix='webcraft-codex-') as work:
        out = os.path.join(work, 'answer.txt')
        cmd = [exe, 'exec',
               '--skip-git-repo-check',   # 깃 저장소가 아니어도 된다
               '--ephemeral',             # 대화 기록을 디스크에 남기지 않는다
               '--ignore-user-config',    # 그 사람의 codex 설정을 끌어오지 않는다
               '--ignore-rules',
               '--sandbox', 'read-only',  # 명령을 돌리더라도 아무것도 못 고친다
               '--color', 'never',
               '-C', work,                # 빈 폴더에서 돈다
               '-o', out]
        if model:
            cmd += ['-m', model]
        cmd.append(system + '\n\n' + prompt)
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            return None, 'codex 가 %d초 안에 답하지 않았습니다.' % TIMEOUT
        except OSError as e:
            return None, 'codex 를 실행하지 못했습니다 — %s' % e
        text = ''
        try:
            with open(out, encoding='utf-8') as f:
                text = f.read().strip()
        except OSError:
            pass
        if not text:
            why = (r.stderr or r.stdout or '').strip()[:200]
            if 'login' in why.lower() or 'auth' in why.lower():
                why = '로그인이 되어 있지 않은 것 같습니다 — codex login 을 해 주세요. (%s)' % why
            return None, why or 'codex 가 빈 답을 주었습니다.'
        return text, None


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


def looks_like_game(path):
    """정말 그 게임인지 앞부분만 조금 읽어 확인한다."""
    try:
        with open(path, 'rb') as f:
            head = f.read(4096).decode('utf-8', 'ignore')
        return 'WebCraft' in head or 'minecraft' in head.lower()
    except OSError:
        return False


def find_game(given):
    """게임 HTML 을 찾는다. 못 찾으면 None.

    file:// 로 열면 브라우저가 마이크 권한을 기억하지 못해 쓸 때마다 묻는다.
    http://localhost 로 열면 한 번만 묻는다. 그래서 다리가 게임도 내준다.

    이름을 정확히 맞추라고 하지 않는다 — 내려받다 보면 "minecraft (1).html"
    처럼 바뀌기 일쑤다. 곁에 있는 html 을 훑어 그 게임인 것을 고른다.
    """
    if given:
        g = os.path.abspath(os.path.expanduser(given))
        return g if os.path.isfile(g) else None

    here = os.path.dirname(os.path.abspath(__file__))
    home = os.path.expanduser('~')
    spots = [here, os.getcwd(), os.path.join(here, '..', 'dist'),
             os.path.join(here, 'dist'), os.path.join(os.getcwd(), 'dist'),
             os.path.join(home, 'Downloads'), os.path.join(home, 'Desktop')]

    found = []
    seen = set()
    for d in spots:
        d = os.path.abspath(d)
        if d in seen or not os.path.isdir(d):
            continue
        seen.add(d)
        try:
            names = os.listdir(d)
        except OSError:
            continue
        for n in names:
            if not n.lower().endswith(('.html', '.htm')):
                continue
            full = os.path.join(d, n)
            if not os.path.isfile(full) or os.path.getsize(full) < 100000:
                continue          # 게임은 1MB 가 넘는다. 작은 건 딴것이다.
            if not looks_like_game(full):
                continue
            # 이름에 minecraft 가 든 것 · 새 것을 먼저 친다
            score = (2 if 'minecraft' in n.lower() else 0, os.path.getmtime(full))
            found.append((score, full))
    if not found:
        return None
    found.sort(reverse=True)
    return found[0][1]


def flatten(messages):
    """주고받은 말을 한 덩어리 글로 편다. claude -p 는 글 하나만 받는다."""
    lines = []
    for m in messages:
        who = 'Player' if m.get('role') == 'user' else 'Ellie'
        body = str(m.get('content', ''))
        lines.append('%s: %s' % (who, body))
    return '\n\n'.join(lines)


ENGINES = {'claude': ask_claude, 'codex': ask_codex}


def have(engine):
    return shutil.which('claude' if engine == 'claude' else 'codex') is not None


class Bridge(BaseHTTPRequestHandler):
    server_version = 'WebCraftBridge'
    token = ''
    model = ''
    engine = 'claude'
    warm = True
    game = None

    # ── 잔손질 ────────────────────────────────────────────────────────
    def cors(self):
        # 게임은 file:// 로 열리는 일이 많아 출처가 null 이다. 그래서 * 로 연다.
        # 대신 암호를 요구하므로 아무나 쓰지는 못한다.
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'content-type, authorization')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Max-Age', '600')

    def stream_open(self):
        """길이를 모르는 답을 흘려보낼 채비. HTTP/1.0 이라 닫으면 끝난 것이다."""
        self.send_response(200)
        self.cors()
        self.send_header('content-type', 'application/x-ndjson; charset=utf-8')
        self.send_header('cache-control', 'no-store')
        self.send_header('connection', 'close')
        self.end_headers()

    def stream_line(self, obj):
        try:
            self.wfile.write((json.dumps(obj, ensure_ascii=False) + '\n').encode('utf-8'))
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ValueError):
            pass   # 게임이 먼저 끊었다

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
        route = self.path.split('?')[0]
        # 게임 자체를 내준다 — 오직 미리 찾아 둔 그 파일 하나만 (경로 장난 불가)
        if route in ('/', '/index.html', '/minecraft.html', '/game') and not Bridge.game:
            self.send_response(200)
            self.send_header('content-type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(('<!doctype html><meta charset="utf-8">'
                '<title>WebCraft 다리</title>'
                '<body style="font:16px/1.7 system-ui;max-width:40em;margin:3em auto;padding:0 1em">'
                '<h2>다리는 켜져 있는데, 게임 파일을 못 찾았습니다</h2>'
                '<p>이 파이썬 파일과 <b>같은 폴더</b>에 게임 HTML 을 두면 알아서 찾습니다. '
                '이름은 달라도 됩니다.</p>'
                '<p>이미 뒀는데도 이 화면이 나온다면, 자리를 직접 알려 주세요:</p>'
                '<pre style="background:#f4f4f6;padding:1em;border-radius:8px;overflow:auto">'
                'python3 ai-bridge.py --game /자리/파일이름.html</pre>'
                '<p style="color:#666">찾아본 곳: 이 파일 곁 · 지금 폴더 · dist · Downloads · Desktop<br>'
                '(100KB 가 넘고 안에 WebCraft 가 든 .html 만 게임으로 봅니다)</p>'
                '</body>').encode('utf-8'))
            return
        if route in ('/', '/index.html', '/minecraft.html', '/game') and Bridge.game:
            try:
                with open(Bridge.game, 'rb') as f:
                    body = f.read()
            except OSError as e:
                self.reply(500, {'error': '게임 파일을 읽지 못했습니다 — %s' % e})
                return
            self.send_response(200)
            self.send_header('content-type', 'text/html; charset=utf-8')
            self.send_header('content-length', str(len(body)))
            self.send_header('cache-control', 'no-store')
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass
            return
        if route == '/ping':
            self.reply(200, {'ok': True, 'name': 'webcraft-ai-bridge',
                             'engine': Bridge.engine,
                             'engines': [e for e in ENGINES if have(e)]})
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

        # 게임이 어느 도구로 물을지 고른다. 안 고르면 다리를 켤 때 정한 것을 쓴다.
        engine = str(req.get('engine') or Bridge.engine)
        if engine not in ENGINES:
            self.reply(400, {'error': '모르는 엔진입니다 — %s' % engine})
            return
        if not have(engine):
            self.reply(503, {'error': '%s 를 이 컴퓨터에서 찾지 못했습니다' % engine})
            return

        # 흘려 달라고 하면 글자가 오는 대로 보낸다 (띄워 둔 클로드만 된다)
        flow = bool(req.get('stream')) and Bridge.warm and engine in ('claude', 'codex')
        if flow:
            self.stream_open()
            self.stream_line({'open': True})
            send = lambda piece: self.stream_line({'delta': piece})
            warm = CODEX if engine == 'codex' else WARM
            text, why, _ = warm.ask(system, Bridge.model, messages, send)
            if why and not text and engine == 'codex':
                # 상주 서버가 말썽이면 예전처럼 codex exec 로 한 번 더
                print('  ! 띄워 둔 codex 가 답하지 못했습니다 (%s) — exec 로 갑니다' % why)
                text, why = ask_codex(system, flatten(messages), Bridge.model)
            if text:
                print('  → %s' % text[:70])
                self.stream_line({'text': re.sub(r'[*_`#]', '', text).strip()})
            else:
                print('  ! %s' % why)
                self.stream_line({'error': why})
            return

        if Bridge.warm and engine in ('claude', 'codex'):
            warm = CODEX if engine == 'codex' else WARM
            text, why, _ = warm.ask(system, Bridge.model, messages)
            if why and not text:
                # 띄워 둔 것이 말썽이면 예전 방식으로 한 번 더 물어본다
                print('  ! 띄워 둔 %s 가 답하지 못했습니다 (%s) — 예전 방식으로 갑니다' % (engine, why))
                text, why = ENGINES[engine](system, flatten(messages), Bridge.model)
        else:
            text, why = ENGINES[engine](system, flatten(messages), Bridge.model)
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
    ap = argparse.ArgumentParser(description='WebCraft 동료를 이 컴퓨터의 AI 도구에 잇는다')
    ap.add_argument('--port', type=int, default=PORT, help='귀를 열 포트 (기본 %d)' % PORT)
    ap.add_argument('--engine', default='', choices=['', 'claude', 'codex'],
                    help='게임이 따로 고르지 않을 때 쓸 도구. 비우면 깔려 있는 것 중 하나')
    ap.add_argument('--model', default='', help='쓸 모델. 비우면 그 도구의 기본값')
    ap.add_argument('--token', default='', help='암호를 직접 정하고 싶을 때')
    ap.add_argument('--game', default='',
                    help='게임 HTML 자리. 비우면 곁·Downloads·Desktop 을 뒤진다')
    ap.add_argument('--cold', action='store_true',
                    help='claude 를 띄워 두지 않고 물을 때마다 새로 띄운다 (느리다)')
    a = ap.parse_args()

    found = [e for e in ENGINES if have(e)]
    if not found:
        print('\n  claude 도 codex 도 찾지 못했습니다.')
        print('  둘 중 하나를 깔고 한 번 로그인한 뒤에 다시 켜 주세요.')
        print('    Claude Code  →  claude  (claude.ai Pro·Max 구독)')
        print('    Codex CLI    →  codex   (ChatGPT Plus·Pro 구독)\n')
        return 1
    if a.engine and not have(a.engine):
        print('\n  %s 를 이 컴퓨터에서 찾지 못했습니다.\n' % a.engine)
        return 1

    Bridge.token = a.token or secrets.token_urlsafe(18)
    Bridge.model = a.model
    Bridge.engine = a.engine or found[0]
    Bridge.warm = not a.cold
    Bridge.game = find_game(a.game)

    label = {'claude': 'Claude Code (claude.ai 구독)',
             'codex': 'Codex CLI (ChatGPT 구독)'}
    print('')
    print('  WebCraft ─ AI 다리를 켰습니다.')
    print('  ────────────────────────────────────────────────')
    print('  주소   http://localhost:%d' % a.port)
    for e in ENGINES:
        mark = '●' if e in found else '○'
        tail = '  ← 기본' if e == Bridge.engine else ('' if e in found else '  (없음)')
        print('  %s %-6s %s%s' % (mark, e, label[e], tail))
    print('  모델   %s' % (a.model or '각 도구의 기본값'))
    print('  방식   %s' % ('띄워 두고 흘려 받습니다 (빠름)' if Bridge.warm
                            else '물을 때마다 새로 띄웁니다 (--cold)'))
    print('')
    print('  암호   %s' % Bridge.token)
    print('')
    if Bridge.game:
        print('  게임   http://localhost:%d  ← 여기로 여세요' % a.port)
        print('         (%s)' % Bridge.game)
        print('         이렇게 열면 마이크 권한을 한 번만 묻습니다.')
        print('         file:// 로 열면 브라우저가 권한을 기억하지 못해 매번 묻습니다.')
    else:
        print('  게임   게임 HTML 을 못 찾았습니다.')
        print('         이 파일과 같은 폴더에 두면 이름이 달라도 찾습니다.')
        print('         또는 --game <파일자리> 로 알려 주세요.')
        print('         (http://localhost:%d 로 열어야 마이크를 매번 묻지 않습니다)' % a.port)
    print('')
    print('  이 암호를 게임 시작 화면의 "다리 암호" 칸에 붙여 넣으세요.')
    print('  그리고 동료 AI 모델에서 "Claude Code 다리" 나 "Codex 다리" 를 고릅니다.')
    print('  이 창을 닫으면 다리가 끊깁니다.  (멈추기: Ctrl+C)')
    print('')

    try:
        ThreadingHTTPServer(('127.0.0.1', a.port), Bridge).serve_forever()
    except KeyboardInterrupt:
        WARM.stop()
        CODEX.stop()
        print('\n  다리를 내렸습니다.\n')
    except OSError as e:
        print('\n  포트 %d 를 열지 못했습니다 — %s' % (a.port, e))
        print('  이미 다리가 켜져 있는지 보시고, 아니면 --port 로 다른 번호를 주세요.\n')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
