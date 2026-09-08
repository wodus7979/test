// lab.js - 용암·물 실험장. 도시 남쪽 하늘에 큰 용광로와 큰 컵이 떠 있고,
// 땅의 레버를 당기면 둘의 마개가 열려 용암과 물이 아래 대야로 쏟아진다.
// 대야에서 둘이 만나면 유체 물리(fluids.js)가 그대로 일을 한다 —
// 물에 닿은 용암은 굳고(흐르는 용암은 조약돌, 수원은 흑요석), 쉭 소리와 함께
// 수증기가 오른다. 레버를 다시 내리면 마개를 닫고 대야를 비워 되돌린다.
'use strict';

const LAB_Z = CITY_RING + 18;   // 도시 가운데에서 남쪽으로 이만큼 (순환도로 바로 밖)
const LAB_X = 44;               // 남쪽으로 나가는 큰길(x=0)은 위를 비우므로 옆으로 비켜 둔다
const LAB_BASIN_Y = 14;         // 대야 바닥 높이 (땅 위)
const LAB_BODY_Y = 24;          // 용광로·컵 바닥 높이
const LAB_SIZE = 9;             // 두 그릇의 한 변 (같은 크기)
const LAB_GAP = 7;              // 두 그릇 중심 사이 절반 거리
const LAB_HALF = (LAB_SIZE - 1) / 2;
const LAB_SMOKE_EVERY = 0.30;   // 굴뚝 연기·수증기를 살피는 간격 (초)

// ── 짓기 ─────────────────────────────────────────────────────────────
function cityLab(plan, st) {
  const gy = plan.y;
  const set = function (x, y, z, id, meta) {
    plan.set(plan.x + LAB_X + x, gy + y, plan.z + z, id, meta || 0, true);
  };
  const fill = function (x0, y0, z0, x1, y1, z1, id, meta) {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, y, z, id, meta);
  };
  const stone = bid('stone_bricks', 'stone');
  const dark = bid('deepslate_bricks', 'polished_blackstone', 'black_concrete', 'stone');
  const hot = bid('magma_block', 'netherrack', 'orange_terracotta');
  const iron = bid('iron_block', 'stone');
  const white = bid('quartz_block', 'white_concrete', 'stone');
  const glassO = bid('orange_stained_glass', 'glass');
  const glassB = bid('light_blue_stained_glass', 'glass');
  const lamp = bid('sea_lantern', 'glowstone');

  const LZ = LAB_Z, H = LAB_HALF, Y0 = LAB_BODY_Y, Y1 = LAB_BODY_Y + LAB_SIZE - 1;

  // 수조 — 두 줄기가 함께 떨어져 만나는 곳. 유리 벽을 그릇 바닥 바로 아래까지
  // 올려서 물이 차올라도 밖으로 넘치지 않는다 (컵은 끝없이 붓는다). 벽이 유리라
  // 용암이 물에 닿아 굳는 모습이 밖에서 보인다.
  const BX0 = -(LAB_GAP + H + 1), BX1 = LAB_GAP + H + 1, BZ0 = LZ - 6, BZ1 = LZ + 6;
  fill(BX0, LAB_BASIN_Y, BZ0, BX1, LAB_BASIN_Y, BZ1, stone);
  for (let y = LAB_BASIN_Y + 1; y < Y0; y++) {
    const w = (y === LAB_BASIN_Y + 1 || y === Y0 - 1) ? stone : glassB;   // 아래위 테두리는 돌
    for (let x = BX0; x <= BX1; x++) { set(x, y, BZ0, w); set(x, y, BZ1, w); }
    for (let z = BZ0; z <= BZ1; z++) { set(BX0, y, z, w); set(BX1, y, z, w); }
    set(BX0, y, BZ0, stone); set(BX1, y, BZ0, stone); set(BX0, y, BZ1, stone); set(BX1, y, BZ1, stone);
  }

  // 그릇 하나 — cx 를 가운데로 하는 9×9×9 상자. 안은 비우고 유체로 채운다.
  const vessel = function (cx, wall, fluid, openTop) {
    fill(cx - H, Y0, LZ - H, cx + H, Y1, LZ + H, wall);                  // 겉
    fill(cx - H + 1, Y0 + 1, LZ - H + 1, cx + H - 1, Y1 - (openTop ? 0 : 1), LZ + H - 1, 0);  // 속을 비운다
    fill(cx - H + 1, Y0 + 1, LZ - H + 1, cx + H - 1, Y1 - 1, LZ + H - 1, fluid, 0);            // 유체(수원)로 채운다
    set(cx, Y0, LZ, 0);                                                   // 바닥 가운데 구멍
  };
  // 용광로 — 어두운 벽돌, 네 귀퉁이는 쇠, 앞면에 주황 유리창으로 속의 용암이 비친다
  const FX = -LAB_GAP, CX = LAB_GAP;
  vessel(FX, dark, B.lava, false);
  for (let y = Y0; y <= Y1; y++) {
    set(FX - H, y, LZ - H, iron); set(FX + H, y, LZ - H, iron);
    set(FX - H, y, LZ + H, iron); set(FX + H, y, LZ + H, iron);
  }
  fill(FX - 1, Y0 + 3, LZ - H, FX + 1, Y0 + 5, LZ - H, glassO);          // 앞창 (도시 쪽 = -Z)
  fill(FX - H, Y0 + 2, LZ - H, FX + H, Y0 + 2, LZ - H, hot);             // 앞면 불띠
  fill(FX - 1, Y1 + 1, LZ - 1, FX + 1, Y1 + 4, LZ + 1, dark);            // 굴뚝
  fill(FX, Y1 + 1, LZ, FX, Y1 + 4, LZ, 0);                               // 굴뚝 속
  set(FX, Y1, LZ, 0);                                                    // 지붕에 굴뚝 구멍
  set(FX, Y1 + 1, LZ, 0);

  // 컵 — 흰 벽, 위가 트여 있고, 가운데 띠는 하늘색 유리라 물이 비친다. 오른쪽에 손잡이.
  vessel(CX, white, B.water, true);
  for (let z = LZ - H; z <= LZ + H; z++) {
    for (let y = Y0 + 3; y <= Y0 + 5; y++) { set(CX - H, y, z, glassB); set(CX + H, y, z, glassB); }
  }
  for (let x = CX - H; x <= CX + H; x++) {
    for (let y = Y0 + 3; y <= Y0 + 5; y++) { set(x, y, LZ - H, glassB); set(x, y, LZ + H, glassB); }
  }
  // 유리 띠 안쪽엔 물이 그대로 닿아 있다. 손잡이:
  for (let y = Y0 + 2; y <= Y0 + 6; y++) set(CX + H + 2, y, LZ, white);
  set(CX + H + 1, Y0 + 2, LZ, white); set(CX + H + 1, Y0 + 6, LZ, white);

  // 마개 — 두 그릇 바닥 가운데 구멍을 막는다. 레버로 연다.
  set(FX, Y0, LZ, iron);
  set(CX, Y0, LZ, white);

  // 조작대 — 대야 앞(도시 쪽) 땅 위. 레버 하나, 등불 기둥 하나.
  const PZ = LZ - 14;
  fill(-1, 1, PZ - 1, 1, 1, PZ + 1, stone);
  set(0, 2, PZ, stone);
  set(0, 3, PZ, B.lever, 0);
  set(2, 1, PZ + 1, dark); set(2, 2, PZ + 1, dark); set(2, 3, PZ + 1, dark); set(2, 4, PZ + 1, lamp);
  set(-2, 1, PZ + 1, dark); set(-2, 2, PZ + 1, dark); set(-2, 3, PZ + 1, dark); set(-2, 4, PZ + 1, lamp);

  const ox = plan.x + LAB_X;
  plan.lab = {
    x: ox, z: plan.z + LZ, y: gy,                                  // 대야 가운데 (세계 좌표)
    lever: [ox, gy + 3, plan.z + PZ],
    plugs: [[ox + FX, gy + Y0, plan.z + LZ, iron], [ox + CX, gy + Y0, plan.z + LZ, white]],
    chimney: [ox + FX + 0.5, gy + Y1 + 5, plan.z + LZ + 0.5],
    basin: { x0: ox + BX0, x1: ox + BX1, y: gy + LAB_BASIN_Y, z0: plan.z + BZ0, z1: plan.z + BZ1 },
    top: gy + Y0 - 1                                                 // 이 높이까지가 '쏟아진 것'
  };
}

// ── 조작 ─────────────────────────────────────────────────────────────
Game.prototype.labAt = function (x, y, z) {
  const list = this.world.cities ? this.world.cities() : [];
  for (let i = 0; i < list.length; i++) {
    const l = list[i] && list[i].lab;
    if (l && l.lever[0] === x && l.lever[1] === y && l.lever[2] === z) return l;
  }
  return null;
};

// 레버가 움직인 뒤 불린다 (메타는 이미 바뀌어 있다)
Game.prototype.labToggle = function (x, y, z) {
  const lab = this.labAt(x, y, z);
  if (!lab) return false;
  const w = this.world;
  const open = !!(w.getMeta(x, y, z) & META_OPEN);
  // 그릇이 있는 청크가 아직 안 만들어졌으면 먼저 만든다 — 안 그러면 마개를
  // 뽑는 setBlock 이 조용히 무시되어 그쪽 그릇만 영영 안 열린다
  for (let i = 0; i < lab.plugs.length; i++) {
    const p = lab.plugs[i];
    const c = w.ensureChunk(Math.floor(p[0] / CHUNK_X), Math.floor(p[2] / CHUNK_Z));
    if (c && !c.generated && w.generateChunk) w.generateChunk(c);
  }
  if (open) {
    // 마개를 뽑는다 — 바로 위 수원이 구멍으로 쏟아진다
    for (let i = 0; i < lab.plugs.length; i++) {
      const p = lab.plugs[i];
      w.setBlock(p[0], p[1], p[2], 0);
      w.scheduleFluid(p[0], p[1] + 1, p[2], 1);
    }
    this.ui.toast('마개가 열렸습니다 — 용암과 물이 쏟아집니다');
    this.playSound('place');
  } else {
    // 마개를 도로 막고, 쏟아진 것을 모두 걷어낸다 (다시 해 볼 수 있게)
    for (let i = 0; i < lab.plugs.length; i++) {
      const p = lab.plugs[i];
      w.setBlock(p[0], p[1], p[2], p[3]);
    }
    this.labClear(lab);
    lab.cleaning = 3.0;               // 뒤늦게 퍼지는 것까지 몇 초 더 걷어낸다
    this.ui.toast('마개를 닫고 수조를 비웠습니다');
    this.playSound('place');
  }
  return true;
};

// 수조 안의 쏟아진 것을 걷어낸다 (테두리·바닥은 남긴다)
Game.prototype.labClear = function (lab) {
  const w = this.world, b = lab.basin;
  const clear = [B.water, B.lava, B.cobblestone, B.obsidian];
  let n = 0;
  for (let y = b.y + 1; y <= lab.top + 1; y++) {
    for (let z = b.z0 + 1; z < b.z1; z++) {
      for (let x = b.x0 + 1; x < b.x1; x++) {
        const id = w.getBlock(x, y, z);
        if (id !== 0 && clear.indexOf(id) >= 0) { w.setBlock(x, y, z, 0, 0, true); n++; }
      }
    }
  }
  return n;
};

// ── 매 틱 — 굴뚝 연기와 수증기 ────────────────────────────────────────
Game.prototype.updateLab = function (dt) {
  if (!this.fx) return;
  this._labT = (this._labT || 0) + dt;
  if (this._labT < LAB_SMOKE_EVERY) return;
  this._labT = 0;
  const list = this.world.cities ? this.world.cities() : [];
  const p = this.player, w = this.world;
  for (let i = 0; i < list.length; i++) {
    const lab = list[i] && list[i].lab;
    if (!lab) continue;
    if (Math.hypot(lab.x - p.x, lab.z - p.z) > 90) continue;
    const lv = lab.lever;
    const open = !!(w.getMeta(lv[0], lv[1], lv[2]) & META_OPEN);
    if (!open) {
      if (lab.cleaning > 0) { lab.cleaning -= LAB_SMOKE_EVERY; this.labClear(lab); }
      continue;
    }
    // 굴뚝 — 불이 지펴진 동안 검은 연기
    this.fx.steam(lab.chimney[0], lab.chimney[1], lab.chimney[2], 2, true);
    // 대야 안에서 용암 곁에 물이 있는 자리마다 수증기
    const b = lab.basin;
    let n = 0;
    for (let y = b.y + 1; y <= b.y + 2 && n < 14; y++) {
      for (let z = b.z0 + 1; z < b.z1 && n < 14; z++) {
        for (let x = b.x0 + 1; x < b.x1 && n < 14; x++) {
          if (w.getBlock(x, y, z) !== B.lava) continue;
          if (w.getBlock(x + 1, y, z) === B.water || w.getBlock(x - 1, y, z) === B.water ||
              w.getBlock(x, y, z + 1) === B.water || w.getBlock(x, y, z - 1) === B.water ||
              w.getBlock(x, y + 1, z) === B.water) {
            this.fx.steam(x + 0.5, y + 1.0, z + 0.5, 1, false);
            n++;
          }
        }
      }
    }
  }
};
