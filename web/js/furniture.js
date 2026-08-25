// furniture.js - 진짜 가구 모델.
// 마인크래프트 가구 모드팩(MrCrayfish's Furniture 계열)처럼
// 블록을 쌓아 흉내 내는 게 아니라, 다리·좌판·등받이를 각각 작은 상자로 깎아 만든다.
// 한 블록 안에서 나무·천·금속·화면이 섞이도록 상자마다 텍스처를 따로 준다.
'use strict';

// ── 가구 전용 텍스처 (textures.js 가 아틀라스에 그려 넣는다) ───────────
const FURNITURE_TEX = {};
function defFurnTex(name, fn) { FURNITURE_TEX[name] = fn; }

defFurnTex('f_wood', function (p, rnd) {
  p.noise(rnd, '#a9793f', 8, 4);
  for (let y = 0; y < 16; y++) {
    if (y % 5 === 2) for (let x = 0; x < 16; x++) p.set(x, y, shade('#a9793f', -18));
  }
  p.speckle(rnd, '#8d6231', 6, 1);
});
defFurnTex('f_wood_dark', function (p, rnd) {
  p.noise(rnd, '#5b3d28', 7, 4);
  for (let y = 0; y < 16; y++) {
    if (y % 6 === 3) for (let x = 0; x < 16; x++) p.set(x, y, shade('#5b3d28', -14));
  }
});
defFurnTex('f_white', function (p, rnd) {
  p.noise(rnd, '#eceef1', 4, 5);
  p.frame(0, 0, 16, 16, '#dcdfe4');
});
defFurnTex('f_metal', function (p, rnd) {
  p.noise(rnd, '#b6bcc4', 5, 2);
  for (let x = 0; x < 16; x += 3) for (let y = 0; y < 16; y++) p.set(x, y, shade('#b6bcc4', -12));
});
defFurnTex('f_metal_dark', function (p, rnd) {
  p.noise(rnd, '#4a5058', 6, 3);
  for (let x = 1; x < 16; x += 4) for (let y = 0; y < 16; y++) p.set(x, y, shade('#4a5058', 10));
});
function fabric(base, weft) {
  return function (p, rnd) {
    p.noise(rnd, base, 7, 2);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) if (((x + y) & 3) === 0) p.set(x, y, weft);
    }
  };
}
defFurnTex('f_fabric_blue', fabric('#3a5f9e', '#33558d'));
defFurnTex('f_fabric_gray', fabric('#6d7480', '#626873'));
defFurnTex('f_fabric_red', fabric('#9c3f42', '#8a373a'));
defFurnTex('f_leather', function (p, rnd) {
  p.noise(rnd, '#2b2e34', 5, 3);
  p.speckle(rnd, '#3a3e46', 14, 1);
});
defFurnTex('f_marble', function (p, rnd) {
  p.noise(rnd, '#e6e7ea', 4, 5);
  for (let k = 0; k < 3; k++) {
    let x = (rnd() * 16) | 0;
    for (let y = 0; y < 16; y++) {
      p.set(x, y, '#c9ccd3');
      x += rnd() < 0.5 ? -1 : 1;
    }
  }
});
// 항공편 안내판 — 검은 화면에 노란 글줄이 흐른다
defFurnTex('f_screen', function (p, rnd) {
  p.fill('#0b0e14');
  for (let r = 1; r < 15; r += 3) {
    let x = 1;
    while (x < 15) {
      const w = 1 + ((rnd() * 3) | 0);
      if (x + w > 15) break;
      const c = rnd() < 0.25 ? '#63d27a' : '#e8b93c';
      p.rect(x, r, w, 2, c);
      x += w + 1 + ((rnd() * 2) | 0);
    }
  }
});
defFurnTex('f_screen_blue', function (p, rnd) {
  p.fill('#123a63');
  p.rect(2, 2, 12, 5, '#2f79c4');
  p.rect(3, 9, 10, 2, '#9fd0f5');
  p.rect(3, 12, 6, 2, '#9fd0f5');
});
defFurnTex('f_leaf', function (p, rnd) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 7.6 || rnd() < 0.16) continue;
      p.set(x, y, mixc('#2f7a34', '#4ca44f', rnd()));
    }
  }
});
defFurnTex('f_soil', function (p, rnd) { p.noise(rnd, '#4a3626', 9, 2); });
defFurnTex('f_vend', function (p, rnd) {
  p.fill('#c9302c');
  p.rect(1, 1, 14, 10, '#20242b');
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      p.rect(2 + c * 3, 2 + r * 3, 2, 2, ['#e8d24a', '#4aa8e8', '#7ad06a', '#e87a4a'][(r + c) & 3]);
    }
  }
  p.rect(2, 12, 5, 3, '#3a3f47');
});
defFurnTex('f_sign', function (p, rnd) {
  p.fill('#1f6b46');
  p.frame(0, 0, 16, 16, '#175338');
  p.rect(2, 6, 7, 2, '#f2f4f7');
  p.rect(10, 5, 2, 4, '#f2f4f7');
  p.set(12, 6, '#f2f4f7'); p.set(12, 7, '#f2f4f7');
  p.rect(2, 10, 9, 1, '#cfe6d8');
});
defFurnTex('f_lampshade', function (p, rnd) {
  p.noise(rnd, '#f5efdc', 5, 4);
  p.rect(0, 13, 16, 3, '#e6dcc0');
});
defFurnTex('f_glass_case', function (p, rnd) {
  p.fill([210, 230, 240, 70]);
  p.frame(0, 0, 16, 16, [235, 245, 250, 150]);
});
defFurnTex('f_belt', function (p, rnd) {
  p.noise(rnd, '#23262c', 5, 3);
  for (let x = 0; x < 16; x += 4) p.rect(x, 0, 1, 16, '#3c414a');
});
defFurnTex('f_rope', function (p, rnd) { p.noise(rnd, '#8a1f28', 6, 2); });

// ── 가구 등록 헬퍼 ────────────────────────────────────────────────────
function defFurn(name, kr, boxes, opts) {
  opts = opts || {};
  return defBlock(name, kr, {
    render: RENDER_BOXES,
    boxes: boxes,
    tex: { all: opts.tex || 'f_wood' },
    facing: opts.facing !== false,
    solid: opts.solid !== false,
    opaque: false,
    cutout: opts.cutout !== false,
    light: opts.light || 0,
    hardness: opts.hardness !== undefined ? opts.hardness : 1.4,
    tool: opts.tool || TOOL_AXE,
    group: 'furniture',
    stack: 16
  });
}

// 다리 네 개를 한 번에
function furnLegs(x0, z0, x1, z1, h, w, tex) {
  const o = [];
  o.push(box(x0, 0, z0, x0 + w, h, z0 + w, tex));
  o.push(box(x1 - w, 0, z0, x1, h, z0 + w, tex));
  o.push(box(x0, 0, z1 - w, x0 + w, h, z1, tex));
  o.push(box(x1 - w, 0, z1 - w, x1, h, z1, tex));
  return o;
}

// ── 앉는 가구 ─────────────────────────────────────────────────────────
// 상자는 모두 "정면이 +Z" 기준으로 깎는다. 메타 0~3 이 +Z / +X / -Z / -X 를 본다.
defFurn('oak_chair', '참나무 의자',
  furnLegs(2, 2, 14, 14, 8, 2, 'f_wood').concat([
    box(2, 8, 2, 14, 10, 14, 'f_wood'),          // 좌판
    box(2, 10, 2, 14, 16, 4, 'f_wood')           // 등받이(뒤쪽 = -Z)
  ]), { tex: 'f_wood' });

defFurn('walnut_chair', '호두나무 의자',
  furnLegs(2, 2, 14, 14, 8, 2, 'f_wood_dark').concat([
    box(2, 8, 2, 14, 10, 14, 'f_fabric_red'),
    box(2, 10, 2, 14, 16, 4, 'f_wood_dark')
  ]), { tex: 'f_wood_dark' });

defFurn('office_chair', '사무용 의자', [
  box(3, 0, 7, 13, 1, 9, 'f_metal_dark'),        // 별 모양 받침
  box(7, 0, 3, 9, 1, 13, 'f_metal_dark'),
  box(6.5, 1, 6.5, 9.5, 8, 9.5, 'f_metal'),      // 기둥
  box(3, 8, 3, 13, 10, 13, 'f_leather'),         // 좌판
  box(3, 10, 3, 13, 16, 5, 'f_leather')          // 등받이
], { tex: 'f_leather', tool: TOOL_PICKAXE });

defFurn('oak_stool', '나무 스툴',
  furnLegs(3, 3, 13, 13, 9, 2, 'f_wood').concat([
    box(2, 9, 2, 14, 11, 14, 'f_wood')
  ]), { tex: 'f_wood' });

defFurn('blue_sofa', '파란 소파', [
  box(1, 0, 2, 3, 3, 4, 'f_wood_dark'), box(13, 0, 2, 15, 3, 4, 'f_wood_dark'),
  box(1, 0, 12, 3, 3, 14, 'f_wood_dark'), box(13, 0, 12, 15, 3, 14, 'f_wood_dark'),
  box(0, 3, 1, 16, 9, 15, 'f_fabric_blue'),      // 방석
  box(0, 9, 1, 16, 16, 4, 'f_fabric_blue'),      // 등받이
  box(0, 9, 4, 3, 13, 15, 'f_fabric_blue'),      // 팔걸이
  box(13, 9, 4, 16, 13, 15, 'f_fabric_blue')
], { tex: 'f_fabric_blue' });

defFurn('gray_sofa', '회색 소파', [
  box(1, 0, 2, 3, 3, 4, 'f_metal'), box(13, 0, 2, 15, 3, 4, 'f_metal'),
  box(1, 0, 12, 3, 3, 14, 'f_metal'), box(13, 0, 12, 15, 3, 14, 'f_metal'),
  box(0, 3, 1, 16, 9, 15, 'f_fabric_gray'),
  box(0, 9, 1, 16, 16, 4, 'f_fabric_gray'),
  box(0, 9, 4, 3, 13, 15, 'f_fabric_gray'),
  box(13, 9, 4, 16, 13, 15, 'f_fabric_gray')
], { tex: 'f_fabric_gray' });

// 공항 대기 벤치 — 금속 다리에 가죽 좌판, 가운데 팔걸이
defFurn('airport_bench', '공항 벤치', [
  box(1, 0, 3, 3, 7, 13, 'f_metal'), box(13, 0, 3, 15, 7, 13, 'f_metal'),
  box(0, 7, 2, 16, 9, 14, 'f_leather'),
  box(0, 9, 3, 1.5, 13, 13, 'f_metal'),
  box(14.5, 9, 3, 16, 13, 13, 'f_metal')
], { tex: 'f_leather', tool: TOOL_PICKAXE });

// ── 탁자·책상 ─────────────────────────────────────────────────────────
defFurn('oak_table', '참나무 탁자',
  furnLegs(1, 1, 15, 15, 13, 2, 'f_wood').concat([
    box(0, 13, 0, 16, 15, 16, 'f_wood')
  ]), { tex: 'f_wood', facing: false });

defFurn('round_table', '원형 탁자', [
  box(4, 0, 4, 12, 1, 12, 'f_metal_dark'),
  box(6.5, 1, 6.5, 9.5, 13, 9.5, 'f_metal'),
  box(2, 13, 4, 14, 15, 12, 'f_marble'),
  box(4, 13, 2, 12, 15, 14, 'f_marble'),
  box(3, 13, 3, 13, 15, 13, 'f_marble')
], { tex: 'f_marble', facing: false, tool: TOOL_PICKAXE });

defFurn('coffee_table', '낮은 탁자',
  furnLegs(1, 1, 15, 15, 6, 2, 'f_wood_dark').concat([
    box(0, 6, 0, 16, 8, 16, 'f_wood_dark')
  ]), { tex: 'f_wood_dark', facing: false });

defFurn('office_desk', '사무 책상', [
  box(0, 0, 2, 2, 12, 14, 'f_white'), box(14, 0, 2, 16, 12, 14, 'f_white'),
  box(2, 4, 1, 14, 12, 3, 'f_white'),            // 가림판(뒤)
  box(0, 12, 0, 16, 14, 16, 'f_wood')
], { tex: 'f_white' });

// ── 카운터·수납 ───────────────────────────────────────────────────────
defFurn('white_counter', '카운터', [
  box(2, 0, 3, 14, 2, 14, 'f_metal_dark'),       // 발판 안쪽
  box(1, 2, 2, 15, 13, 15, 'f_white'),
  box(0, 13, 0, 16, 15, 16, 'f_marble')
], { tex: 'f_white', tool: TOOL_PICKAXE });

defFurn('wood_counter', '나무 카운터', [
  box(2, 0, 3, 14, 2, 14, 'f_wood_dark'),
  box(1, 2, 2, 15, 13, 15, 'f_wood'),
  box(0, 13, 0, 16, 15, 16, 'f_wood_dark')
], { tex: 'f_wood' });

defFurn('white_cabinet', '수납장', [
  box(1, 0, 2, 15, 15, 15, 'f_white'),
  box(0, 15, 1, 16, 16, 16, 'f_marble'),
  box(5, 4, 15, 11, 5, 15.6, 'f_metal'),         // 손잡이
  box(5, 10, 15, 11, 11, 15.6, 'f_metal')
], { tex: 'f_white' });

defFurn('display_case', '진열장', [
  box(1, 0, 1, 15, 3, 15, 'f_wood_dark'),
  box(1, 3, 1, 2, 14, 15, 'f_metal'), box(14, 3, 1, 15, 14, 15, 'f_metal'),
  box(2, 3, 1, 14, 14, 2, 'f_glass_case'), box(2, 3, 14, 14, 14, 15, 'f_glass_case'),
  box(2, 3, 2, 14, 4, 14, 'f_fabric_red'),
  box(1, 14, 1, 15, 15, 15, 'f_wood_dark')
], { tex: 'f_glass_case', facing: false, light: 6 });

defFurn('wall_shelf', '벽 선반', [
  box(0, 5, 0, 16, 7, 8, 'f_wood'),
  box(1, 0, 0, 3, 5, 3, 'f_metal'), box(13, 0, 0, 15, 5, 3, 'f_metal')
], { tex: 'f_wood', solid: false });

// ── 공항 설비 ─────────────────────────────────────────────────────────
// 항공편 안내판 — 벽에 붙는 넓은 화면
defFurn('flight_board', '항공편 안내판', [
  box(0, 0, 0, 16, 16, 2, 'f_metal_dark'),
  box(0.5, 0.5, 2, 15.5, 15.5, 2.8, 'f_screen')
], { tex: 'f_screen', light: 9, solid: false, tool: TOOL_PICKAXE });

defFurn('wall_tv', '벽걸이 화면', [
  box(1, 2, 0, 15, 14, 1.5, 'f_metal_dark'),
  box(2, 3, 1.5, 14, 13, 2.2, 'f_screen_blue')
], { tex: 'f_screen_blue', light: 7, solid: false, tool: TOOL_PICKAXE });

// 무인 발권기
defFurn('checkin_kiosk', '무인 발권기', [
  box(3, 0, 4, 13, 3, 12, 'f_metal_dark'),
  box(4, 3, 5, 12, 14, 11, 'f_white'),
  box(4, 9, 11, 12, 15, 12.8, 'f_screen_blue'),  // 화면
  box(4.5, 7, 11, 11.5, 8.5, 13, 'f_metal')      // 발권구
], { tex: 'f_white', light: 5, tool: TOOL_PICKAXE });

// 수하물 컨베이어 (한 칸씩 이어 놓으면 벨트가 된다)
defFurn('baggage_belt', '수하물 벨트', [
  box(0, 0, 2, 16, 2, 14, 'f_metal_dark'),
  box(0, 2, 1, 16, 6, 15, 'f_belt'),
  box(0, 6, 1, 16, 6.6, 2, 'f_metal'),
  box(0, 6, 14, 16, 6.6, 15, 'f_metal')
], { tex: 'f_belt', facing: false, tool: TOOL_PICKAXE });

// 보안 검색대 — 옆 기둥 두 개와 윗보를 따로 세운다
defFurn('security_pillar', '검색대 기둥', [
  box(3, 0, 3, 13, 16, 13, 'f_white'),
  box(4, 3, 2.4, 12, 13, 3, 'f_screen_blue')
], { tex: 'f_white', tool: TOOL_PICKAXE });

defFurn('security_beam', '검색대 윗보', [
  box(3, 0, 3, 13, 8, 13, 'f_white'),
  box(4, 8, 4, 12, 12, 12, 'f_metal')
], { tex: 'f_white', tool: TOOL_PICKAXE, facing: false });

// 줄 세우는 차단 기둥
defFurn('rope_post', '차단 기둥', [
  box(5, 0, 5, 11, 1, 11, 'f_metal_dark'),
  box(6.5, 1, 6.5, 9.5, 13, 9.5, 'f_metal'),
  box(7, 13, 7, 9, 15, 9, 'f_metal_dark'),
  box(7.5, 10, 0, 8.5, 11.5, 7, 'f_rope'),       // 앞뒤로 걸린 줄
  box(7.5, 10, 9, 8.5, 11.5, 16, 'f_rope')
], { tex: 'f_metal', facing: true, tool: TOOL_PICKAXE });

defFurn('luggage_cart', '수하물 카트', [
  box(2, 0, 2, 4, 3, 4, 'f_metal_dark'), box(12, 0, 2, 14, 3, 4, 'f_metal_dark'),
  box(2, 0, 12, 4, 3, 14, 'f_metal_dark'), box(12, 0, 12, 14, 3, 14, 'f_metal_dark'),
  box(1, 3, 1, 15, 5, 15, 'f_metal'),
  box(2, 5, 1, 4, 14, 3, 'f_metal'), box(12, 5, 1, 14, 14, 3, 'f_metal'),
  box(2, 13, 1, 14, 15, 3, 'f_wood'),            // 손잡이 (뒤)
  box(1, 5, 1, 15, 7, 2, 'f_metal')
], { tex: 'f_metal', tool: TOOL_PICKAXE });

defFurn('suitcase', '여행 가방', [
  box(3, 0, 5, 5, 1, 7, 'f_metal_dark'), box(11, 0, 5, 13, 1, 7, 'f_metal_dark'),
  box(3, 1, 5, 13, 12, 11, 'f_fabric_red'),
  box(3, 5, 4.6, 13, 7, 11.4, 'f_metal_dark'),
  box(7, 12, 7, 9, 14, 9, 'f_metal')
], { tex: 'f_fabric_red', tool: TOOL_NONE, hardness: 0.6 });

defFurn('vending_machine', '자판기', [
  box(1, 0, 2, 15, 16, 14, 'f_metal_dark'),
  box(1.5, 2, 14, 14.5, 15, 14.8, 'f_vend')
], { tex: 'f_metal_dark', light: 6, tool: TOOL_PICKAXE });

defFurn('trash_bin', '휴지통', [
  box(4, 0, 4, 12, 12, 12, 'f_metal'),
  box(3.5, 12, 3.5, 12.5, 14, 12.5, 'f_metal_dark'),
  box(6, 14, 6, 10, 15, 10, 'f_metal_dark')
], { tex: 'f_metal', facing: false, tool: TOOL_PICKAXE, hardness: 0.8 });

defFurn('airport_sign', '안내 표지판', [
  box(0, 10, 6, 16, 16, 8, 'f_sign'),
  box(7, 16, 6.5, 9, 16, 7.5, 'f_metal')
], { tex: 'f_sign', solid: false, light: 5, tool: TOOL_PICKAXE });

// ── 조명·화초 ─────────────────────────────────────────────────────────
defFurn('floor_lamp', '스탠드 조명', [
  box(5, 0, 5, 11, 1, 11, 'f_metal_dark'),
  box(7, 1, 7, 9, 11, 9, 'f_metal'),
  box(4, 11, 4, 12, 16, 12, 'f_lampshade')
], { tex: 'f_lampshade', facing: false, light: 14, tool: TOOL_PICKAXE });

defFurn('ceiling_panel', '천장 조명', [
  box(1, 14, 1, 15, 16, 15, 'f_lampshade'),
  box(0, 15, 0, 16, 16, 16, 'f_metal')
], { tex: 'f_lampshade', facing: false, solid: false, light: 15, tool: TOOL_PICKAXE });

defFurn('potted_tree', '실내 화분', [
  box(4, 0, 4, 12, 7, 12, 'f_white'),
  box(5, 7, 5, 11, 8, 11, 'f_soil'),
  box(7, 8, 7, 9, 12, 9, 'f_wood_dark'),
  box(2, 10, 2, 14, 16, 14, 'f_leaf')
], { tex: 'f_leaf', facing: false, tool: TOOL_NONE, hardness: 0.8 });

defFurn('potted_fern', '작은 화분', [
  box(5, 0, 5, 11, 6, 11, 'f_wood_dark'),
  box(5.5, 6, 5.5, 10.5, 7, 10.5, 'f_soil'),
  box(3, 6, 3, 13, 13, 13, 'f_leaf')
], { tex: 'f_leaf', facing: false, tool: TOOL_NONE, hardness: 0.5 });

// ── 전동차 표면 (train.js 가 쓰는 엔티티 텍스처) ──────────────────────
// 코레일 전동차처럼 은백색 차체에 파랑·청록 띠를 두른다.
defFurnTex('tr_body', function (p, rnd) {
  p.noise(rnd, '#e2e6ea', 4, 4);
  p.rect(0, 0, 16, 1, '#c2c8d0');
  p.rect(0, 15, 16, 1, '#f2f5f8');
});
defFurnTex('tr_win', function (p, rnd) {
  p.rect(0, 0, 16, 3, '#e2e6ea');
  p.rect(0, 3, 16, 10, '#101b26');       // 짙게 코팅된 창
  p.rect(0, 3, 16, 1, '#4d6b86');
  p.rect(0, 12, 16, 1, '#2f4358');
  p.rect(0, 13, 16, 3, '#e2e6ea');
});
defFurnTex('tr_roof', function (p, rnd) { p.noise(rnd, '#9aa2ab', 5, 3); });
defFurnTex('tr_skirt', function (p, rnd) { p.noise(rnd, '#3a4048', 5, 3); });
defFurnTex('tr_stripe', function (p, rnd) {
  p.noise(rnd, '#1f4f9c', 5, 4);
  p.rect(0, 12, 16, 4, '#12a3a3');       // 아래쪽 청록 띠
});
defFurnTex('tr_teal', function (p, rnd) { p.noise(rnd, '#12a3a3', 5, 4); });
defFurnTex('tr_face', function (p, rnd) {
  p.noise(rnd, '#e2e6ea', 4, 4);
  p.rect(1, 2, 14, 7, '#0e1720');        // 앞유리
  p.rect(1, 2, 14, 1, '#39536e');
  p.rect(0, 10, 16, 2, '#1f4f9c');
  p.rect(1, 12, 4, 3, '#fff3c0');        // 전조등
  p.rect(11, 12, 4, 3, '#fff3c0');
});
defFurnTex('tr_door', function (p, rnd) {
  p.noise(rnd, '#cfd6dd', 4, 4);
  p.rect(7, 0, 2, 16, '#8c959e');        // 가운데 여닫이 이음매
  p.rect(1, 3, 5, 8, '#101b26');         // 문 창
  p.rect(10, 3, 5, 8, '#101b26');
});
defFurnTex('tr_floor', function (p, rnd) {
  p.noise(rnd, '#4a5058', 6, 2);
  for (let y = 0; y < 16; y += 4) p.rect(0, y, 16, 1, '#3c424a');
});
defFurnTex('tr_wall', function (p, rnd) {
  p.noise(rnd, '#dfe4e9', 4, 5);
  p.rect(0, 14, 16, 2, '#c6ccd3');
});
defFurnTex('tr_seat', function (p, rnd) {
  p.noise(rnd, '#2f5f9e', 6, 3);
  for (let y = 0; y < 16; y += 5) p.rect(0, y, 16, 1, '#27508a');
});
defFurnTex('tr_light', function (p, rnd) { p.noise(rnd, '#fdf7e2', 4, 6); });
// ── 우주왕복선 ────────────────────────────────────────────────────────
defFurnTex('sh_body', function (p, rnd) {
  p.noise(rnd, '#eef1f4', 3, 4);
  for (let y = 0; y < 16; y += 4) p.rect(0, y, 16, 1, '#dfe3e8');   // 내열 타일 이음매
  for (let x = 0; x < 16; x += 4) p.rect(x, 0, 1, 16, '#dfe3e8');
});
defFurnTex('sh_black', function (p, rnd) {
  p.noise(rnd, '#232629', 4, 3);
  for (let y = 0; y < 16; y += 4) p.rect(0, y, 16, 1, '#15181a');
});
defFurnTex('sh_tank', function (p, rnd) {
  p.noise(rnd, '#c1662a', 6, 4);
  p.rect(0, 0, 16, 2, '#9d4f1e');
  p.rect(0, 14, 16, 2, '#d47a3c');
});
defFurnTex('sh_srb', function (p, rnd) {
  p.noise(rnd, '#e6e8ea', 4, 4);
  p.rect(0, 5, 16, 2, '#b9bcc0');      // 분리 이음매
  p.rect(0, 12, 16, 1, '#b9bcc0');
});
defFurnTex('sh_nozzle', function (p, rnd) {
  p.noise(rnd, '#3a3f45', 5, 4);
  for (let y = 1; y < 16; y += 3) p.rect(0, y, 16, 1, '#6b727a');
});
defFurnTex('sh_glass', function (p, rnd) {
  p.noise(rnd, '#131c26', 4, 3);
  p.rect(1, 3, 14, 9, '#3f6488');
});
// 객실 안 — 스테인리스 봉과 노란 손잡이
defFurnTex('tr_pole', function (p, rnd) {
  p.noise(rnd, '#c6ccd2', 4, 5);
  p.rect(0, 0, 16, 2, '#8e959c');
  p.rect(0, 6, 16, 1, '#eef2f5');
});
// 손잡이 — 가운데가 뚫린 고리 (알파로 잘라 낸다)
defFurnTex('tr_strap', function (p, rnd) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      // 위쪽은 천장 봉에서 내려오는 띠, 아래쪽은 잡는 고리
      if (y < 6) { if (x >= 7 && x <= 8) p.set(x, y, '#d8dde2'); continue; }
      const d = Math.hypot(x - 7.5, y - 10.5);
      if (d < 5.2 && d > 3.1) p.set(x, y, '#f0b429');
      else if (d <= 3.1 && d > 2.6) p.set(x, y, '#c98f16');
    }
  }
});
defFurnTex('tr_seatback', function (p, rnd) {
  p.noise(rnd, '#27508a', 6, 3);
  for (let x = 0; x < 16; x += 5) p.rect(x, 0, 1, 16, '#1f4373');
});
defFurnTex('tr_wheel', function (p, rnd) {
  p.noise(rnd, '#22262b', 5, 3);
  p.rect(0, 7, 16, 2, '#4a5058');
});
defFurnTex('tr_bogie', function (p, rnd) {
  p.noise(rnd, '#2e343b', 6, 3);
  p.rect(0, 4, 16, 2, '#454c55');
});

// ── 자동차 표면 (cars.js) ─────────────────────────────────────────────
function carPaint(base, dark) {
  return function (p, rnd) {
    p.noise(rnd, base, 5, 4);
    p.rect(0, 0, 16, 1, dark);
    p.rect(0, 15, 16, 1, dark);
  };
}
defFurnTex('car_red', carPaint('#b62a28', '#8d1f1e'));
defFurnTex('car_blue', carPaint('#2a4f9c', '#1e3a76'));
defFurnTex('car_white', carPaint('#e6e9ec', '#c3c8cd'));
defFurnTex('car_black', carPaint('#25282d', '#171a1e'));
defFurnTex('car_silver', carPaint('#9aa2ab', '#7b838c'));
defFurnTex('car_green', carPaint('#2f7a46', '#215c34'));
defFurnTex('car_glass', function (p, rnd) {
  p.noise(rnd, '#1b2530', 5, 3);
  p.rect(0, 2, 16, 3, '#31465c');
});
defFurnTex('car_wheel', function (p, rnd) {
  p.noise(rnd, '#1c1f23', 5, 3);
  p.rect(5, 5, 6, 6, '#8b939c');
});
defFurnTex('car_lightF', function (p, rnd) { p.noise(rnd, '#fff3c8', 4, 5); });
defFurnTex('car_lightR', function (p, rnd) { p.noise(rnd, '#d33a30', 5, 4); });
// 택시 — 노란 차체에 갓등
defFurnTex('car_taxi', function (p, rnd) {
  p.noise(rnd, '#e8b23a', 5, 4);
  p.rect(0, 6, 16, 4, '#2b2f35');
});
// 버스 — 파란 띠를 두른 흰 차체
defFurnTex('car_bus', function (p, rnd) {
  p.noise(rnd, '#f0f2f4', 4, 5);
  p.rect(0, 9, 16, 3, '#1f5fb0');
  p.rect(0, 12, 16, 2, '#12a3a3');
});
defFurnTex('car_bus_win', function (p, rnd) {
  p.noise(rnd, '#f0f2f4', 4, 5);
  p.rect(1, 3, 14, 8, '#16202c');
});
// 트럭 짐칸
defFurnTex('car_cargo', function (p, rnd) {
  p.noise(rnd, '#8a8f96', 5, 3);
  for (let x = 0; x < 16; x += 4) p.rect(x, 0, 1, 16, '#71767c');
});
// 순찰차
defFurnTex('car_police', function (p, rnd) {
  p.noise(rnd, '#f0f2f4', 4, 5);
  p.rect(0, 5, 16, 6, '#1b3f8c');
  p.rect(2, 6, 12, 4, '#f0f2f4');
});
defFurnTex('car_siren', function (p, rnd) {
  p.rect(0, 0, 8, 16, '#d33a30');
  p.rect(8, 0, 8, 16, '#2f6fd0');
});
// ── 신호등 ────────────────────────────────────────────────────────────
defFurnTex('sig_body', function (p, rnd) {
  p.noise(rnd, '#2a2c32', 5, 3);
  p.frame(0, 0, 16, 16, '#1a1c21');
});
defFurnTex('sig_red', function (p, rnd) {
  p.noise(rnd, '#2a2c32', 4, 3);
  for (let y = 2; y < 14; y++) {
    for (let x = 2; x < 14; x++) {
      if (Math.hypot(x - 7.5, y - 7.5) < 5.6) p.set(x, y, '#e03a2a');
    }
  }
});
defFurnTex('sig_amber', function (p, rnd) {
  p.noise(rnd, '#2a2c32', 4, 3);
  for (let y = 2; y < 14; y++) {
    for (let x = 2; x < 14; x++) {
      if (Math.hypot(x - 7.5, y - 7.5) < 5.6) p.set(x, y, '#e8a41c');
    }
  }
});
defFurnTex('sig_green', function (p, rnd) {
  p.noise(rnd, '#2a2c32', 4, 3);
  for (let y = 2; y < 14; y++) {
    for (let x = 2; x < 14; x++) {
      if (Math.hypot(x - 7.5, y - 7.5) < 5.6) p.set(x, y, '#2fc25a');
    }
  }
});

// ── 포크레인 ──────────────────────────────────────────────────────────
defFurnTex('ex_body', function (p, rnd) {
  p.noise(rnd, '#e0a41f', 5, 4);
  p.rect(0, 0, 16, 2, '#a8761a');
  p.rect(0, 13, 16, 3, '#2e3238');
});
defFurnTex('ex_track', function (p, rnd) {
  p.noise(rnd, '#33383f', 5, 3);
  for (let y = 0; y < 16; y += 3) p.rect(0, y, 16, 1, '#1d2126');
});
defFurnTex('ex_boom', function (p, rnd) {
  p.noise(rnd, '#e0a41f', 4, 4);
  p.rect(0, 6, 16, 2, '#a8761a');
});
defFurnTex('ex_bucket', function (p, rnd) {
  p.noise(rnd, '#4a5057', 5, 4);
  p.rect(0, 12, 16, 4, '#8d949c');
});
defFurnTex('ex_glass', function (p, rnd) {
  p.noise(rnd, '#1b2530', 5, 3);
  p.rect(1, 2, 14, 10, '#3c5871');
});
defFurnTex('ex_dirt', function (p, rnd) { p.noise(rnd, '#6b4c2e', 7, 6); });

// 덤프트럭 — 주황 차체
defFurnTex('car_dump', function (p, rnd) {
  p.noise(rnd, '#d98324', 5, 4);
  p.rect(0, 0, 16, 2, '#a8601a');
  p.rect(0, 14, 16, 2, '#a8601a');
});
// 소방차
defFurnTex('car_fire', function (p, rnd) {
  p.noise(rnd, '#c22f26', 5, 4);
  p.rect(0, 10, 16, 2, '#f0f2f4');
});
