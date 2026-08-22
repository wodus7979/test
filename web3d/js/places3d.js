// places3d.js - 공항과 도시가 설 자리를 고른다.
// 블록판(web/js/airport.js · city.js)과 완전히 같은 탐색 규칙을 써서
// 같은 시드면 같은 좌표에 공항과 도시가 선다.
'use strict';

const AIRPORT_DEFS = [
  { code: 'ICN', name: '인천국제공항', dist: 800, angle: 0.55 },
  { code: 'GMP', name: '김포국제공항', dist: 4600, angle: 2.45 },
  { code: 'CJU', name: '제주국제공항', dist: 8600, angle: 4.55 }
];

const AP_X = 150, AP_Z = 62, AP_MARGIN = 14;
const RW_LEN = 260, RW_HALF = 7, RW_A_Z = -48, RW_B_Z = 48;
const TAXI_Z = 32, TAXI_HALF = 4, APRON_X = 108, APRON_Z = 28;
const TERM_X = 66, TERM_Z = 13, TERM_H = 15;
const TOWER_X = 88, TOWER_Z = -34, TOWER_H = 30;
const STAND_XS = [-60, -36, -12, 12, 36, 60];

const AP_FLAT_RECTS = [
  [RW_LEN / 2 + 16, RW_HALF + 8, 0, RW_A_Z],
  [RW_LEN / 2 + 16, RW_HALF + 8, 0, RW_B_Z],
  [APRON_X + 10, TAXI_Z + TAXI_HALF + 4, 0, 0],
  [14, 14, TOWER_X, TOWER_Z]
];

const CITY_R = 86, CITY_MARGIN = 30, CITY_DIST = 340, CITY_GRID = 26;
const ROAD_HALF = 3, RAIL_UP = 12;

const CITY_DEFS = {
  ICN: { name: '인천 송도', style: 'modern' },
  GMP: { name: '김포 도심', style: 'skyline' },
  CJU: { name: '제주시', style: 'jeju' }
};

// 블록판은 정수 높이로 자리를 골랐다. 똑같이 맞추려고 반올림해서 본다.
World3D.prototype.heightI = function (x, z) { return Math.round(this.rawHeight(x, z)); };

World3D.prototype.findAirports = function () {
  if (this._airports) return this._airports;
  const out = [];
  for (let i = 0; i < AIRPORT_DEFS.length; i++) {
    const def = AIRPORT_DEFS[i];
    const tx = Math.round(Math.cos(def.angle) * def.dist);
    const tz = Math.round(Math.sin(def.angle) * def.dist);
    let best = null;
    for (let ring = 0; ring <= 22 && !best; ring++) {
      const step = ring * 130;
      const tries = ring === 0 ? 1 : ring * 6;
      for (let k = 0; k < tries; k++) {
        const a = (k / tries) * Math.PI * 2 + ring * 1.3;
        const cx = tx + Math.round(Math.cos(a) * step);
        const cz = tz + Math.round(Math.sin(a) * step);
        let lo = 1e9, hi = -1e9, sum = 0, n = 0, bad = 0, snowy = 0;
        for (let dz = -AP_Z; dz <= AP_Z; dz += 12) {
          for (let dx = -AP_X; dx <= AP_X; dx += 12) {
            const h = this.heightI(cx + dx, cz + dz);
            const b = this.biomeAt(cx + dx, cz + dz, h);
            if (h <= SEA_LEVEL + 1 || b === BIOME.OCEAN || b === BIOME.MOUNTAINS) bad++;
            if (b === BIOME.SNOWY) snowy++;
            lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++;
          }
        }
        if (!n || bad > n * 0.08 || hi - lo > 18) continue;
        if (snowy > n * (0.25 + ring * 0.14)) continue;
        best = { x: cx, z: cz, y: Math.max(Math.round(sum / n), SEA_LEVEL + 3) };
        break;
      }
    }
    if (!best) continue;
    const ap = {
      code: def.code, name: def.name, index: out.length,
      x: best.x, y: best.y, z: best.z,
      runways: [
        { z: best.z + RW_A_Z, y: best.y, x0: best.x - RW_LEN / 2, x1: best.x + RW_LEN / 2, half: RW_HALF, label: ['15', '33'] },
        { z: best.z + RW_B_Z, y: best.y, x0: best.x - RW_LEN / 2, x1: best.x + RW_LEN / 2, half: RW_HALF, label: ['16', '34'] }
      ],
      tower: { x: best.x + TOWER_X, y: best.y + TOWER_H + 7, z: best.z + TOWER_Z },
      stands: []
    };
    for (let s = 0; s < STAND_XS.length; s++) {
      for (const side of [-1, 1]) {
        ap.stands.push({
          x: best.x + STAND_XS[s], z: best.z + side * (TERM_Z + 21),
          yaw: side > 0 ? 0 : Math.PI
        });
      }
    }
    this.addFlat(best.x, best.z, best.y, rectsFlat(AP_FLAT_RECTS, AP_MARGIN));
    out.push(ap);
  }
  this._airports = out;
  return out;
};

World3D.prototype.findCities = function () {
  if (this._cities) return this._cities;
  const aps = this.findAirports();
  const out = [];
  for (let i = 0; i < aps.length; i++) {
    const ap = aps[i];
    const def = CITY_DEFS[ap.code] || { name: ap.code + ' 시가지', style: 'modern' };
    let best = null;
    for (let ring = 0; ring <= 14 && !best; ring++) {
      const dist = CITY_DIST + ring * 55;
      for (let k = 0; k < 15 && !best; k++) {
        const lateral = (k === 0 ? 0 : ((k & 1) ? -1 : 1) * Math.ceil(k / 2) * 55);
        for (const sx of [1, -1]) {
          const cx = ap.x + sx * dist, cz = ap.z + lateral;
          let lo = 1e9, hi = -1e9, sum = 0, n = 0, bad = 0, snowy = 0;
          for (let dz = -CITY_R; dz <= CITY_R; dz += 11) {
            for (let dx = -CITY_R; dx <= CITY_R; dx += 11) {
              if (Math.hypot(dx, dz) > CITY_R) continue;
              const h = this.heightI(cx + dx, cz + dz);
              const bi = this.biomeAt(cx + dx, cz + dz, h);
              if (h <= SEA_LEVEL + 1 || bi === BIOME.OCEAN || bi === BIOME.MOUNTAINS) bad++;
              if (bi === BIOME.SNOWY) snowy++;
              lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++;
            }
          }
          const badLimit = n * (0.02 + ring * 0.015);
          if (!n || bad > badLimit || hi - lo > 14 + ring * 2) continue;
          if (snowy > n * (0.15 + ring * 0.12)) continue;
          best = { x: cx, z: cz, y: Math.max(Math.round(sum / n), SEA_LEVEL + 3), side: sx };
          break;
        }
      }
    }
    if (!best) continue;

    const railY = Math.max(ap.y, best.y) + RAIL_UP;
    const side = best.side;
    const apStX = ap.x + side * 86, apStZ = ap.z;
    const cityStX = best.x - side * CITY_GRID * 2, cityStZ = best.z;
    const bendX = Math.round((apStX + cityStX) / 2);
    const pts = (cityStZ === apStZ)
      ? [[apStX, apStZ], [cityStX, cityStZ]]
      : [[apStX, apStZ], [bendX, apStZ], [bendX, cityStZ], [cityStX, cityStZ]];

    const city = {
      code: ap.code, name: def.name, style: def.style, airport: ap,
      x: best.x, y: best.y, z: best.z, side: side,
      rail: { y: railY, pts: pts },
      stations: [
        { x: apStX, y: railY, z: apStZ, name: ap.name + ' 역' },
        { x: cityStX, y: railY, z: cityStZ, name: def.name + ' 역' }
      ]
    };
    this.addFlat(best.x, best.z, best.y, discFlat(CITY_R, CITY_MARGIN));
    ap.city = city;
    out.push(city);
  }
  this._cities = out;
  return out;
};

World3D.prototype.nearestAirport = function (x, z) {
  const list = this.findAirports();
  let best = null, bd = Infinity;
  for (let i = 0; i < list.length; i++) {
    const d = Math.hypot(list[i].x - x, list[i].z - z);
    if (d < bd) { bd = d; best = list[i]; }
  }
  return best ? { ap: best, dist: bd } : null;
};

// 도시·공항 부지 안인가 (나무를 심지 않으려고 쓴다)
World3D.prototype.isPaved = function (x, z) {
  const aps = this._airports || [];
  for (let i = 0; i < aps.length; i++) {
    if (Math.abs(x - aps[i].x) < AP_X + 20 && Math.abs(z - aps[i].z) < AP_Z + 20) return true;
  }
  const cs = this._cities || [];
  for (let i = 0; i < cs.length; i++) {
    if (Math.hypot(x - cs[i].x, z - cs[i].z) < CITY_R + 10) return true;
    const r = cs[i].rail.pts;
    for (let k = 0; k + 1 < r.length; k++) {
      const x0 = r[k][0], z0 = r[k][1], x1 = r[k + 1][0], z1 = r[k + 1][1];
      if (x0 === x1) { if (Math.abs(x - x0) < 9 && z > Math.min(z0, z1) - 9 && z < Math.max(z0, z1) + 9) return true; }
      else { if (Math.abs(z - z0) < 9 && x > Math.min(x0, x1) - 9 && x < Math.max(x0, x1) + 9) return true; }
    }
  }
  return false;
};
