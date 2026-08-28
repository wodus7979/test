// pbrmat.js - 블록 아틀라스에서 노멀맵과 ORM(가림·거칠기·금속) 아틀라스를 만든다.
// 그림 파일을 하나도 안 쓰는 게임이라 재질도 그때그때 계산해서 뽑는다.
//   · 노멀 : 칸마다 밝기를 높이로 보고 소벨로 기울기를 잰다 (칸 밖은 안 넘본다)
//   · ORM  : R 결 가림 · G 거칠기 · B 금속. 거칠기·금속은 무늬 이름으로 정한다
'use strict';

// [이름 규칙, 거칠기, 금속, 결 깊이]
const PBR_RULES = [
  // 요트가 먼저다 — 아래 금속 규칙의 'hull' 에 흰 젤코트 선체가 걸려
  // 배 전체가 브러시드 스틸이 되어 버렸다 (금속은 확산광이 없어 잿빛이 된다)
  [/^yt_(hull|boot)/, 0.13, 0.00, 0.30],      // 반들반들한 젤코트
  [/^yt_(gold|rail|mast)/, 0.24, 0.90, 0.45], // 금장식·스테인리스
  [/^yt_sail/, 0.86, 0.00, 0.55],             // 캔버스 돛
  [/^yt_deck/, 0.52, 0.00, 1.00],             // 티크 갑판
  [/^yt_cush/, 0.92, 0.00, 0.70],             // 쿠션
  [/glass|ice|window|pane|water|crystal|diamond/, 0.10, 0.00, 0.25],
  [/iron|steel|metal|anvil|chain|rail|gold|copper|silver|alum|chrome|engine|turbine|blade|prop|hull|jet/, 0.34, 0.88, 0.55],
  [/lamp|lantern|light|glow|neon|torch|fire|lava|magma|screen|led/, 0.45, 0.10, 0.40],
  [/polish|tile|marble|brick|concrete|asphalt|road|floor|panel|plaster|line|center|paint/, 0.58, 0.00, 0.85],
  [/stone|rock|ore|gravel|cobble|granite|basalt|obsidian|slab|deepslate/, 0.82, 0.00, 1.25],
  [/wood|plank|log|door|fence|crate|barrel|bamboo|table|chair|desk/, 0.70, 0.00, 1.00],
  [/leaf|leaves|grass|plant|flower|wool|cloth|carpet|bed|cushion|seat|wheat|vine|moss/, 0.93, 0.00, 0.70],
  [/sand|dirt|soil|snow|clay|mud|path|gravel/, 0.90, 0.00, 1.10]
];
const PBR_DEFAULT = [0.76, 0.00, 0.90];

function pbrRuleFor(name) {
  for (let i = 0; i < PBR_RULES.length; i++) {
    if (PBR_RULES[i][0].test(name)) return PBR_RULES[i];
  }
  return [null, PBR_DEFAULT[0], PBR_DEFAULT[1], PBR_DEFAULT[2]];
}

// 아틀라스 두 장을 만들어 돌려준다.
// tiles = { 이름: {canvasX, canvasY} } — textures.js 의 TEXTURES 를 그대로 넘긴다.
function buildPBRAtlases(blockCanvas, tiles) {
  const W = blockCanvas.width, H = blockCanvas.height;
  const src = blockCanvas.getContext('2d').getImageData(0, 0, W, H).data;

  const nCan = document.createElement('canvas');
  nCan.width = W; nCan.height = H;
  const nCtx = nCan.getContext('2d');
  const nImg = nCtx.createImageData(W, H);
  const oCan = document.createElement('canvas');
  oCan.width = W; oCan.height = H;
  const oCtx = oCan.getContext('2d');
  const oImg = oCtx.createImageData(W, H);

  // 아무 칸도 안 쓰는 자리는 밋밋한 기본값으로 채워 둔다
  for (let i = 0; i < W * H; i++) {
    nImg.data[i * 4] = 128; nImg.data[i * 4 + 1] = 128;
    nImg.data[i * 4 + 2] = 255; nImg.data[i * 4 + 3] = 255;
    oImg.data[i * 4] = 255; oImg.data[i * 4 + 1] = 194;
    oImg.data[i * 4 + 2] = 0; oImg.data[i * 4 + 3] = 255;
  }

  const lum = new Float32Array(TILE * TILE);
  const names = Object.keys(tiles);
  for (let t = 0; t < names.length; t++) {
    const info = tiles[names[t]];
    if (!info || info.canvasX === undefined) continue;
    const rule = pbrRuleFor(names[t]);
    const rough = rule[1], metal = rule[2], depth = rule[3];
    const bx = info.canvasX, by = info.canvasY;

    // 1) 칸 안의 밝기를 높이로 읽는다
    let lo = 1, hi = 0;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const s = ((by + y) * W + (bx + x)) * 4;
        const a = src[s + 3] / 255;
        const l = (src[s] * 0.299 + src[s + 1] * 0.587 + src[s + 2] * 0.114) / 255 * a;
        lum[y * TILE + x] = l;
        if (l < lo) lo = l;
        if (l > hi) hi = l;
      }
    }
    // 밝기 폭이 좁은 칸(민무늬 페인트)은 결을 세게 세우면 지저분해진다
    const span = hi - lo;
    const gain = depth * (span > 0.02 ? Math.min(1, 0.28 / span) : 0) * 2.4;

    // 2) 소벨로 기울기를 재서 접선 공간 법선을 만든다
    const at = function (x, y) {
      const cx = x < 0 ? 0 : (x >= TILE ? TILE - 1 : x);   // 칸 밖으로 안 나간다
      const cy = y < 0 ? 0 : (y >= TILE ? TILE - 1 : y);
      return lum[cy * TILE + cx];
    };
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
                 - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
        const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
                 - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
        let nx = -gx * gain, ny = -gy * gain, nz = 1;
        const il = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        nx *= il; ny *= il; nz *= il;
        const d = ((by + y) * W + (bx + x)) * 4;
        nImg.data[d] = Math.round(nx * 127.5 + 127.5);
        nImg.data[d + 1] = Math.round(ny * 127.5 + 127.5);
        nImg.data[d + 2] = Math.round(nz * 127.5 + 127.5);
        nImg.data[d + 3] = 255;

        // 3) 결 가림 — 제 칸에서 어두운 골은 빛이 덜 든다
        const rel = span > 0.02 ? (lum[y * TILE + x] - lo) / span : 1;
        const cav = 0.72 + 0.28 * rel;
        // 거친 데는 조금 더 거칠게, 반들한 데는 조금 더 반들하게 흔들어 준다
        const r = Math.max(0.03, Math.min(1, rough + (rel - 0.5) * 0.14));
        oImg.data[d] = Math.round(cav * 255);
        oImg.data[d + 1] = Math.round(r * 255);
        oImg.data[d + 2] = Math.round(metal * 255);
        oImg.data[d + 3] = 255;
      }
    }
  }

  nCtx.putImageData(nImg, 0, 0);
  oCtx.putImageData(oImg, 0, 0);
  return { normal: nCan, orm: oCan };
}
