// blocks.js - 블록 레지스트리 코어. 모양(모델), 성질, 텍스처 요청을 정의한다.
// 실제 블록 목록은 이 파일 뒤쪽과 blockfamilies.js 에서 만든다.
'use strict';

// ── 렌더 방식 ─────────────────────────────────────────────────────────
const RENDER_CUBE = 0;    // 꽉 찬 정육면체
const RENDER_CROSS = 1;   // X자 (꽃, 풀, 묘목)
const RENDER_LIQUID = 2;  // 액체
const RENDER_BOXES = 3;   // 상자 여러 개로 이루어진 모델 (계단, 반블록, 담장...)

// 이웃에 따라 모양이 달라지는 특수 모양
const SHAPE_STATIC = 0;   // 고정된 상자 목록
const SHAPE_STAIRS = 1;
const SHAPE_FENCE = 2;
const SHAPE_WALL = 3;
const SHAPE_PANE = 4;

// ── 도구 ──────────────────────────────────────────────────────────────
const TOOL_NONE = 0, TOOL_PICKAXE = 1, TOOL_AXE = 2, TOOL_SHOVEL = 3;
const TOOL_SHEARS = 4, TOOL_SWORD = 5, TOOL_HOE = 6;

const TIER = { none: 0, wood: 1, gold: 1, stone: 2, iron: 3, diamond: 4, netherite: 5 };

// ── 메타(블록 상태) 비트 ──────────────────────────────────────────────
const META_FACING = 0x03;  // 0=+Z 1=-X 2=-Z 3=+X
const META_TOP = 0x04;     // 반블록/계단이 위쪽에 붙음
const META_OPEN = 0x08;    // 문/트랩도어/울타리문 열림
const META_HALF2 = 0x10;   // 문·침대의 윗부분 / 뒷부분

// ── 상자 모델 헬퍼 (0~16 픽셀 단위) ──────────────────────────────────
// 7번째 칸(tex)은 그 상자만 다른 텍스처로 그리고 싶을 때 쓴다.
// 가구처럼 한 블록 안에서 나무·천·화면이 섞이는 모델에 필요하다.
function box(x0, y0, z0, x1, y1, z1, tex) {
  return [x0 / 16, y0 / 16, z0 / 16, x1 / 16, y1 / 16, z1 / 16, tex];
}

const SHAPES = {
  full: [box(0, 0, 0, 16, 16, 16)],
  slab: [box(0, 0, 0, 16, 8, 16)],
  layer: [box(0, 0, 0, 16, 2, 16)],
  carpet: [box(0, 0, 0, 16, 1, 16)],
  plate: [box(1, 0, 1, 15, 1, 15)],
  button: [box(5, 0, 5, 11, 2, 11)],
  trapdoor: [box(0, 0, 0, 16, 3, 16)],
  door: [box(0, 0, 0, 16, 16, 3)],
  bed: [box(0, 0, 0, 16, 9, 16)],
  cake: [box(1, 0, 1, 15, 8, 15)],
  pot: [box(5, 0, 5, 11, 6, 11)],
  torch: [box(7, 0, 7, 9, 10, 9)],
  candle: [box(7, 0, 7, 9, 6, 9)],
  lantern: [box(5, 0, 5, 11, 9, 11)],
  chain: [box(6.5, 0, 6.5, 9.5, 16, 9.5)],
  rod: [box(6, 0, 6, 10, 16, 10)],
  ladder: [box(0, 0, 13, 16, 16, 16)],
  rail: [box(0, 0, 0, 16, 1, 16)],
  hopper: [box(0, 10, 0, 16, 16, 16), box(4, 4, 4, 12, 10, 12)],
  anvil: [box(2, 0, 2, 14, 4, 14), box(4, 4, 5, 12, 10, 11), box(0, 10, 3, 16, 16, 13)],
  cauldron: [box(0, 0, 0, 16, 3, 16), box(0, 3, 0, 2, 16, 16), box(14, 3, 0, 16, 16, 16),
    box(2, 3, 0, 14, 16, 2), box(2, 3, 14, 14, 16, 16)],
  brewing: [box(7, 0, 7, 9, 16, 9), box(1, 0, 1, 15, 2, 15)],
  enchant: [box(0, 0, 0, 16, 12, 16)],
  stonecutter: [box(0, 0, 0, 16, 9, 16)],
  grindstone: [box(2, 4, 4, 14, 16, 12)],
  campfire: [box(0, 0, 0, 16, 4, 16)],
  lectern: [box(0, 0, 0, 16, 2, 16), box(4, 2, 4, 12, 10, 12)],
  sign: [box(0, 4, 7, 16, 16, 9)],
  banner: [box(7, 0, 7, 9, 16, 9)],
  end_portal_frame: [box(0, 0, 0, 16, 13, 16)],
  pointed: [box(5, 0, 5, 11, 16, 11)],
  amethyst_cluster: [box(5, 0, 5, 11, 12, 11)],
  sculk_vein: [box(0, 0, 0, 16, 1, 16)],
  lily: [box(1, 0, 1, 15, 1, 15)],
  turtle_egg: [box(5, 0, 5, 11, 7, 11)],
  conduit: [box(5, 5, 5, 11, 11, 11)],
  piston_head: [box(0, 12, 0, 16, 16, 16), box(6, 0, 6, 10, 12, 10)],
  daylight: [box(0, 0, 0, 16, 6, 16)],
  repeater: [box(0, 0, 0, 16, 2, 16), box(3, 2, 2, 5, 5, 4), box(3, 2, 11, 5, 5, 13)],
  bell: [box(5, 4, 5, 11, 12, 11), box(4, 12, 4, 12, 16, 12)],
  flower_pot: [box(5, 0, 5, 11, 6, 11)],
  scaffold: [box(0, 14, 0, 16, 16, 16), box(0, 0, 0, 2, 14, 2), box(14, 0, 0, 16, 14, 2),
    box(0, 0, 14, 2, 14, 16), box(14, 0, 14, 16, 14, 16)]
};

// 계단(정면이 +Z일 때). 회전은 렌더러가 메타를 보고 처리한다.
const STAIR_BOXES = [box(0, 0, 0, 16, 8, 16), box(0, 8, 8, 16, 16, 16)];
// 담장 기둥/가로대
const FENCE_POST = box(6, 0, 6, 10, 16, 10);
// 벽 기둥
const WALL_POST = box(4, 0, 4, 12, 16, 12);
// 유리판 중심
const PANE_POST = box(7, 0, 7, 9, 16, 9);

// ── 텍스처 요청 ───────────────────────────────────────────────────────
// textures.js 가 읽어서 실제 픽셀을 그린다. 같은 이름은 한 번만 등록된다.
const TEX_SPEC = {};
function tex(name, spec) {
  if (!TEX_SPEC[name]) TEX_SPEC[name] = spec;
  return name;
}

// ── 레지스트리 ────────────────────────────────────────────────────────
const BLOCKS = [];
const BLOCK_BY_NAME = {};
const B = {};
let _nextBlockId = 1;

function defBlock(name, kr, opts) {
  opts = opts || {};
  const t = opts.tex || {};
  const all = t.all !== undefined ? t.all : name;
  const render = opts.render !== undefined ? opts.render : RENDER_CUBE;
  const isCube = render === RENDER_CUBE;

  const def = {
    id: _nextBlockId++,
    name: name,
    kr: kr,
    texTop: t.top !== undefined ? t.top : all,
    texBottom: t.bottom !== undefined ? t.bottom : all,
    texSide: t.side !== undefined ? t.side : all,
    render: render,
    shape: opts.shape !== undefined ? opts.shape : SHAPE_STATIC,
    boxes: opts.boxes || (render === RENDER_BOXES ? SHAPES.full : null),
    solid: opts.solid !== undefined ? opts.solid : true,
    // opaque = 빛을 완전히 막고 이웃 면을 가린다 (꽉 찬 정육면체만)
    opaque: opts.opaque !== undefined ? opts.opaque : isCube,
    cutout: !!opts.cutout,
    liquid: !!opts.liquid,
    light: opts.light || 0,
    filter: opts.filter || 0,
    hardness: opts.hardness !== undefined ? opts.hardness : 1,
    tool: opts.tool || TOOL_NONE,
    tier: opts.tier || 0,
    drop: opts.drop !== undefined ? opts.drop : name,
    dropCount: opts.dropCount || 1,
    dropChance: opts.dropChance !== undefined ? opts.dropChance : 1,
    silkOnly: !!opts.silkOnly,
    gravity: !!opts.gravity,
    flammable: !!opts.flammable,
    placeOnly: !!opts.placeOnly,
    needsSupport: !!opts.needsSupport,
    fuel: opts.fuel || 0,
    damage: opts.damage || 0,
    // 설치할 때 바라보는 방향을 메타에 기록
    facing: !!opts.facing,
    // 아래/위 절반 선택 (반블록, 계단, 트랩도어)
    halfable: !!opts.halfable,
    openable: !!opts.openable,
    tall: !!opts.tall,           // 2칸 높이 (문, 침대는 가로 2칸)
    interact: opts.interact || null,
    group: opts.group || 'misc',  // 창작 모드 분류
    kr_group: opts.kr_group || null,
    variantOf: opts.variantOf || null,
    stack: opts.stack || 64,
    seeThrough: !!opts.seeThrough, // 유리처럼 뒤가 보임 (같은 종류끼리 면 생략)
    translucent: !!opts.translucent // 반투명 (알파 블렌딩 패스로 그린다)
  };
  BLOCKS[def.id] = def;
  BLOCK_BY_NAME[name] = def;
  B[name] = def.id;
  return def;
}

// 공기(0번)
BLOCKS[0] = {
  id: 0, name: 'air', kr: '공기', texTop: 'stone', texBottom: 'stone', texSide: 'stone',
  render: -1, shape: SHAPE_STATIC, boxes: null, solid: false, opaque: false, cutout: false,
  liquid: false, light: 0, filter: 0, hardness: 0, tool: 0, tier: 0, drop: null,
  dropCount: 0, dropChance: 0, silkOnly: false, gravity: false, flammable: false,
  placeOnly: true, needsSupport: false, fuel: 0, damage: 0, facing: false,
  halfable: false, openable: false, tall: false, interact: null, group: 'misc',
  stack: 64, seeThrough: false
};
BLOCK_BY_NAME.air = BLOCKS[0];
B.air = 0;

// ── 헬퍼 ──────────────────────────────────────────────────────────────
function blockDef(id) { return BLOCKS[id] || BLOCKS[0]; }
function isLiquid(id) { return blockDef(id).liquid; }

// face: 0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z
function blockTexName(id, face) {
  const d = blockDef(id);
  if (face === 2) return d.texTop;
  if (face === 3) return d.texBottom;
  return d.texSide;
}

function shouldDrawFace(self, neighbor) {
  if (neighbor === 0) return true;
  const n = blockDef(neighbor);
  if (!n.opaque) {
    // 유리·잎처럼 같은 종류끼리는 맞닿은 면을 생략해 깔끔하게 보이게 한다
    if (self === neighbor && n.seeThrough) return false;
    return true;
  }
  return false;
}

// 충돌/선택에 쓰는 상자 목록 (0~1 정규화 좌표)
function blockBoxes(id, meta) {
  const d = blockDef(id);
  if (!d.solid) return null;
  if (d.render !== RENDER_BOXES) return SHAPES.full;
  if (d.shape === SHAPE_STAIRS) return rotateBoxes(STAIR_BOXES, meta);
  if (d.shape === SHAPE_FENCE || d.shape === SHAPE_WALL || d.shape === SHAPE_PANE) {
    // 충돌은 기둥 + 전체 가로폭으로 단순화 (지나갈 수 없게)
    return [box(0, 0, 0, 16, d.shape === SHAPE_PANE ? 16 : 24, 16)];
  }
  return rotateBoxes(d.boxes, meta);
}

// 메타의 facing/top 에 맞춰 상자를 돌린다
function rotateBoxes(boxes, meta) {
  meta = meta || 0;
  const facing = meta & META_FACING;
  const top = !!(meta & META_TOP);
  if (!facing && !top) return boxes;
  const out = [];
  for (let i = 0; i < boxes.length; i++) {
    const src = boxes[i];
    let b = src;
    if (top) b = [b[0], 1 - b[4], b[2], b[3], 1 - b[1], b[5], src[6]];
    for (let r = 0; r < facing; r++) {
      // Y축 90° 회전: (x,z) -> (z, 1-x)
      b = [b[2], b[1], 1 - b[3], b[5], b[4], 1 - b[0], src[6]];
    }
    out.push(b);
  }
  return out;
}

// 두 AABB가 겹치는지
function boxOverlap(a, bx, by, bz, min, max) {
  return a[0] + bx < max[0] && a[3] + bx > min[0] &&
    a[1] + by < max[1] && a[4] + by > min[1] &&
    a[2] + bz < max[2] && a[5] + bz > min[2];
}
