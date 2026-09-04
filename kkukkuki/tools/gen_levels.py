#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
kkukkuki/js/levels.js 생성기.

ASCII 맵을 손으로 정렬하면 열이 어긋나기 쉬워서, 여기서 안전하게 만든 뒤
사람이 읽고 고칠 수 있는 ASCII 형태로 levels.js 에 써 넣는다.

  ── 지형 타일 ──          ── 배치용 문자 ──
  .  빈 칸                  P  꾹꾹이 시작 위치
  #  흙(윗면 잔디)          G  골 깃발
  =  돌 블록                K  체크포인트
  -  통과 가능 발판         C  코인(꾹꾹이 열매)
  B  부술 수 있는 벽돌      1  고양이(총)
  ?  아이템 박스            2  강아지(돌진+총)
  T  나무 기둥              3  새(폭탄)
  ^  나뭇잎                 4  고릴라(드럼통)
  H  빌딩 벽
  h  빌딩 창문
  S  가시
"""
import io, os, sys

ROWS = 15
FLOOR_TOP = 13          # 기본 바닥 윗면 행 (13, 14 두 줄이 흙)


class LB:
    def __init__(self, width):
        self.w = width
        self.g = [['.'] * width for _ in range(ROWS)]

    # --- 기본 조작 -------------------------------------------------
    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < ROWS:
            self.g[y][x] = c

    def rect(self, x0, x1, y0, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, c)

    def row(self, x0, x1, y, c):
        self.rect(x0, x1, y, y, c)

    # --- 지형 -------------------------------------------------------
    def ground(self, x0, x1, top=FLOOR_TOP):
        self.rect(x0, x1, top, ROWS - 1, '#')

    def plat(self, x0, x1, y, c='='):
        self.row(x0, x1, y, c)

    def stairs(self, x, y, steps, dirx=1, c='='):
        """계단: 한 칸씩 올라가며 바닥까지 채운다."""
        for i in range(steps):
            cx = x + i * dirx
            self.rect(cx, cx, y - i, FLOOR_TOP - 1, c)

    def tree(self, x, top, width=2, trunk='T', leaf='^'):
        """x = 기둥 중심. top = 잎 윗면 행. 잎 위에 설 수 있다."""
        self.rect(x, x, top + 2, FLOOR_TOP - 1, trunk)
        self.rect(x - width, x + width, top, top + 1, leaf)

    def building(self, x0, x1, top, solid_base=False):
        """빌딩. 기본은 1층이 뚫린 '필로티' 구조라 아래로 지나갈 수 있다."""
        bottom = FLOOR_TOP - 1 if solid_base else FLOOR_TOP - 3
        self.rect(x0, x1, top, bottom, 'H')
        for y in range(top + 1, bottom, 2):
            for x in range(x0 + 1, x1, 2):
                self.put(x, y, 'h')
        if not solid_base:                      # 장식 기둥(통과 가능)
            self.rect(x0, x0, bottom + 1, FLOOR_TOP - 1, 'p')
            self.rect(x1, x1, bottom + 1, FLOOR_TOP - 1, 'p')

    def roof_access(self, x, top, dirx=-1, gap=3):
        """지붕까지 올라갈 수 있는 통과 발판 계단.

        낮은 발판일수록 건물에서 멀고, 가장 높은 발판이 지붕 바로 옆에 온다.
        (반대로 놓으면 꼭대기 발판이 건물에서 멀어져 지붕에 못 올라간다)
        """
        rows = list(range(FLOOR_TOP - 3, top, -2))
        n = len(rows)
        for i, row in enumerate(rows):
            cx = x + dirx * (2 + (n - 1 - i) * gap)
            self.plat(cx, cx + 1, row, '-')
            self.put(cx, row - 1, 'C')

    def coins(self, x0, x1, y, step=1):
        for x in range(x0, x1 + 1, step):
            if self.g[y][x] == '.':
                self.put(x, y, 'C')

    def coin_arc(self, cx, y, half=3):
        """점프 궤적을 따라 도는 코인 아치."""
        for i in range(-half, half + 1):
            yy = y - (half - abs(i))
            self.put(cx + i, yy, 'C')

    def dump(self):
        return [''.join(r) for r in self.g]


# ══════════════════════════════════════════════════════════════════
# STAGE 1 — 꾹꾹이 숲
# ══════════════════════════════════════════════════════════════════
def stage1():
    L = LB(178)
    # 바닥 (구덩이: 41-43, 76-78, 112-115)
    L.ground(0, 40); L.ground(44, 75); L.ground(79, 111); L.ground(116, 177)

    L.put(3, 12, 'P')

    # 도입부 — 조작 익히기
    L.put(9, 9, '?')
    L.coins(6, 8, 10)
    L.row(14, 17, 9, 'B'); L.put(16, 9, '?')
    L.coins(14, 17, 7)

    # 첫 고양이 & 나무
    L.tree(22, 7)
    L.put(27, 12, '1')
    L.plat(31, 34, 9)
    L.coins(31, 34, 8)
    L.put(37, 12, '1')

    # 구덩이 1
    L.coin_arc(42, 10, 3)

    # 벽돌 + 아이템
    L.row(48, 52, 9, 'B'); L.put(50, 9, '?')
    L.coins(48, 52, 7)

    # 나무 위 고릴라
    L.tree(57, 6, width=3)
    L.put(57, 5, '4')
    L.roof_access(54, 6, -1)
    L.put(62, 12, '1')
    L.put(66, 12, '2')

    # 계단 오르막 + 새
    L.stairs(69, 12, 4)
    L.plat(73, 75, 8)
    L.put(72, 5, '3')
    L.coins(73, 75, 7)

    # 구덩이 2
    L.coin_arc(77, 10, 3)

    # 체크포인트
    L.put(84, 12, 'K')
    L.put(88, 8, '?')
    L.plat(92, 97, 10)
    L.plat(95, 100, 7)
    L.coins(92, 97, 9)
    L.coins(95, 100, 6)
    L.put(101, 12, '2')
    L.put(105, 4, '3')

    # 두 번째 나무 고릴라
    L.tree(108, 6, width=3)
    L.put(108, 5, '4')
    L.roof_access(105, 6, -1)

    # 구덩이 3 (발판 있음)
    L.plat(113, 114, 10, '-')
    L.coins(113, 114, 9)

    # 후반 — 벽돌 미로
    L.row(119, 124, 9, 'B'); L.put(121, 9, '?')
    L.row(121, 123, 6, 'B')
    L.coins(119, 124, 7)
    L.put(125, 12, 'K')
    L.put(127, 12, '1'); L.put(129, 12, '2')
    L.tree(133, 7)
    L.put(137, 3, '3')

    # 오르막 마무리
    L.stairs(140, 12, 5)
    L.plat(146, 151, 7)
    L.coins(146, 151, 6)
    L.put(148, 6, '?')
    L.put(154, 12, '2')
    L.put(156, 12, '1')

    L.row(160, 166, 9, 'B')
    L.coins(160, 166, 8)
    L.plat(158, 159, 11, '-')

    L.put(172, 12, 'G')
    return L.dump()


# ══════════════════════════════════════════════════════════════════
# STAGE 2 — 꾹꾹이 시티
# ══════════════════════════════════════════════════════════════════
def stage2():
    L = LB(196)
    L.ground(0, 33); L.ground(38, 68); L.ground(73, 104); L.ground(109, 140); L.ground(145, 195)

    L.put(3, 12, 'P')

    # 첫 빌딩 구역
    L.building(8, 13, 8)
    L.roof_access(8, 8, -1)
    L.put(10, 7, '?')
    L.coins(8, 13, 6)
    L.put(17, 12, '2')
    L.building(20, 27, 6)
    L.put(24, 5, '4')
    L.roof_access(20, 6, -1)            # 옥상 고릴라
    L.coins(20, 23, 4)
    L.put(30, 12, '1')

    # 구덩이 + 공중 발판
    L.plat(35, 36, 10, '-')
    L.coin_arc(36, 9, 2)
    L.put(34, 4, '3')

    # 간판 발판 지대
    L.plat(41, 45, 9); L.plat(48, 52, 7); L.plat(55, 59, 5)
    L.coins(41, 45, 8); L.coins(48, 52, 6); L.coins(55, 59, 4)
    L.put(50, 6, '?')
    L.put(44, 12, '2'); L.put(57, 12, '1')
    L.put(62, 3, '3')

    # 체크포인트
    L.put(66, 12, 'K')

    # 구덩이
    L.plat(70, 71, 10, '-')

    # 벽돌 벽 + 고릴라 빌딩
    L.row(76, 82, 9, 'B'); L.put(79, 9, '?')
    L.row(78, 80, 6, 'B')
    L.coins(76, 82, 7)
    L.building(86, 94, 5)
    L.put(90, 4, '4')
    L.roof_access(94, 5, 1)
    L.coins(86, 89, 3)
    L.put(97, 12, '2'); L.put(99, 12, '2')
    L.put(101, 4, '3')

    # 구덩이
    L.plat(106, 107, 10, '-')
    L.coin_arc(107, 9, 2)

    # 가시 구간
    L.row(114, 117, 12, 'S')
    L.plat(113, 118, 9)
    L.coins(113, 118, 8)
    L.put(119, 12, 'K')
    L.put(121, 12, '1'); L.put(123, 12, '1')
    L.put(126, 3, '3'); L.put(131, 5, '3')
    L.building(128, 136, 7)
    L.put(132, 6, '?')
    L.roof_access(128, 7, -1)

    # 구덩이
    L.plat(142, 143, 10, '-')

    # 마지막 고층 구역
    L.building(148, 158, 4)
    L.put(153, 3, '4')
    L.roof_access(148, 4, -1)
    L.coins(148, 152, 2)
    L.row(162, 168, 9, 'B'); L.put(165, 9, '?')
    L.put(171, 12, '2'); L.put(174, 12, '1')
    L.stairs(178, 12, 5)
    L.coins(178, 182, 6)
    L.put(190, 12, 'G')
    return L.dump()


# ══════════════════════════════════════════════════════════════════
# STAGE 3 — 노을 폐허 (보스)
# ══════════════════════════════════════════════════════════════════
def stage3():
    L = LB(206)
    L.ground(0, 28); L.ground(33, 60); L.ground(65, 92); L.ground(97, 126); L.ground(131, 160); L.ground(165, 205)

    L.put(3, 12, 'P')

    L.put(8, 9, '?')
    L.coins(6, 10, 10)
    L.put(13, 12, '2'); L.put(16, 12, '1')
    L.tree(21, 6, width=3)
    L.put(21, 5, '4')
    L.roof_access(18, 6, -1)
    L.put(25, 4, '3')

    L.plat(30, 31, 10, '-'); L.coin_arc(31, 9, 2)

    L.row(36, 42, 9, 'B'); L.put(39, 9, '?')
    L.row(38, 40, 6, 'B')
    L.coins(36, 42, 7)
    L.put(45, 12, '2'); L.put(47, 12, '2')
    L.building(50, 58, 6)
    L.put(54, 5, '4')
    L.roof_access(50, 6, -1)
    L.coins(50, 53, 4)

    L.plat(62, 63, 10, '-')

    L.put(68, 12, 'K')
    L.row(72, 75, 12, 'S')
    L.plat(71, 76, 9); L.coins(71, 76, 8)
    L.put(79, 3, '3'); L.put(84, 5, '3')
    L.stairs(82, 12, 4)
    L.plat(86, 91, 7); L.coins(86, 91, 6)
    L.put(88, 6, '?')

    L.plat(94, 95, 10, '-'); L.coin_arc(95, 9, 2)

    L.tree(101, 5, width=3); L.put(101, 4, '4')
    L.roof_access(98, 5, -1)
    L.put(104, 12, 'K')
    L.put(106, 12, '1'); L.put(108, 12, '2')
    L.row(112, 118, 9, 'B'); L.put(115, 9, '?')
    L.coins(112, 118, 7)
    L.put(122, 3, '3')

    L.plat(128, 129, 10, '-')

    L.building(134, 144, 5)
    L.put(139, 4, '4')
    L.roof_access(134, 5, -1)
    L.coins(134, 138, 3)
    L.row(147, 152, 12, 'S')
    L.plat(146, 153, 9); L.coins(146, 153, 8)
    L.put(156, 12, '2'); L.put(158, 12, '1')

    L.plat(162, 163, 10, '-')

    # ── 보스 아레나 ──
    L.put(166, 12, 'K')                 # 보스 직전 체크포인트
    L.building(169, 174, 8)             # 왼쪽 엄폐물 (1층은 뚫려 있음)
    L.roof_access(169, 8, -1)
    L.plat(178, 185, 8, '-')            # 공중 발판 : 밟기 공격용
    L.put(181, 7, '?')
    L.coins(178, 185, 6)
    L.put(190, 12, '?')                 # 바닥의 예비 아이템 상자
    L.put(196, 12, '5')                 # 킹 고릴라
    L.put(203, 12, 'G')
    return L.dump()


META = [
    dict(id=1, name='꾹꾹이 숲', theme='forest', song='forest', time=200,
         intro='나무 위 고릴라가 드럼통을 굴린다! 점프로 피하고 아이템 박스를 깨자.',
         quests=[('coins', 24, '열매 24개 모으기'),
                 ('kills', 8, '적 8마리 물리치기'),
                 ('time', 120, '120초 안에 도착하기')]),
    dict(id=2, name='꾹꾹이 시티', theme='city', song='city', time=220,
         intro='빌딩 옥상의 고릴라와 폭탄을 던지는 새를 조심해!',
         quests=[('coins', 30, '열매 30개 모으기'),
                 ('kills', 12, '적 12마리 물리치기'),
                 ('nohit', 1, '한 대도 맞지 않고 통과하기')]),
    dict(id=3, name='노을 폐허', theme='sunset', song='sunset', time=260,
         intro='마지막 관문. 끝에서 보스 고릴라가 기다린다!',
         quests=[('coins', 34, '열매 34개 모으기'),
                 ('boss', 1, '보스 고릴라 물리치기'),
                 ('time', 170, '170초 안에 도착하기')]),
]


def js_rows(rows):
    out = []
    for i, r in enumerate(rows):
        out.append("      '%s'," % r)
    return '\n'.join(out)


def ruler(width):
    """열 번호를 읽기 쉽게 알려주는 눈금 주석."""
    tens = ''.join(str((i // 10) % 10) if i % 10 == 0 else ' ' for i in range(width))
    ones = ''.join(str(i % 10) for i in range(width))
    return "      // %s\n      // %s" % (tens, ones)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, '..', 'js', 'levels.js')
    stages = [stage1(), stage2(), stage3()]

    buf = io.StringIO()
    buf.write("""/* ============================================================
   꾹꾹이의 대모험 — levels.js   (tools/gen_levels.py 로 생성)
   맵을 직접 손으로 고쳐도 된다. 행 길이가 달라도 로더가 '.'으로 채운다.

     .  빈 칸          P  꾹꾹이 시작      1  고양이(총)
     #  흙             G  골 깃발          2  강아지(돌진)
     =  돌 블록        K  체크포인트       3  새(폭탄)
     -  통과 발판      C  열매(코인)       4  고릴라(드럼통)
     B  부술 벽돌                          5  보스 고릴라
     ?  아이템 박스
     T  나무 기둥   ^  나뭇잎   H  빌딩 벽   h  창문   S  가시
   ============================================================ */
(function (global) {
  'use strict';
  const KK = global.KK;

  KK.LEVELS = [
""")

    for meta, rows in zip(META, stages):
        w = len(rows[0])
        buf.write("    /* ── STAGE %d : %s ───────────────────────── */\n" % (meta['id'], meta['name']))
        buf.write("    {\n")
        buf.write("      id: %d,\n" % meta['id'])
        buf.write("      name: '%s',\n" % meta['name'])
        buf.write("      theme: '%s',\n" % meta['theme'])
        buf.write("      song: '%s',\n" % meta['song'])
        buf.write("      timeLimit: %d,\n" % meta['time'])
        buf.write("      intro: '%s',\n" % meta['intro'])
        buf.write("      quests: [\n")
        for kind, target, label in meta['quests']:
            buf.write("        { kind: '%s', target: %d, label: '%s' },\n" % (kind, target, label))
        buf.write("      ],\n")
        buf.write("      rows: [\n")
        buf.write(js_rows(rows))
        buf.write("\n      ]\n    },\n")

    buf.write("""  ];

})(window);
""")

    with open(out, 'w', encoding='utf-8') as f:
        f.write(buf.getvalue())

    for meta, rows in zip(META, stages):
        widths = set(len(r) for r in rows)
        print('STAGE %d %-10s  %d행 x %s열  코인 %d  적 %d' % (
            meta['id'], meta['name'], len(rows), sorted(widths),
            sum(r.count('C') for r in rows),
            sum(sum(r.count(c) for c in '12345') for r in rows)))
    print('→', os.path.normpath(out))


if __name__ == '__main__':
    main()
