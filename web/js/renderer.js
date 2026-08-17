// renderer.js - WebGL 렌더러: 하늘, 청크, 엔티티, 아이템, 선택 외곽선.
'use strict';

function Renderer(canvas) {
  const opts = { alpha: false, antialias: false, depth: true, stencil: false, powerPreference: 'high-performance' };
  const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  if (!gl) throw new Error('이 브라우저(웹뷰)에서 WebGL을 사용할 수 없습니다.');
  this.gl = gl;
  this.canvas = canvas;

  this.uintExt = gl.getExtension('OES_element_index_uint');

  this.terrainProg = createProgram(gl, TERRAIN_VS, TERRAIN_FS, ['aPos', 'aUV', 'aLight']);
  this.skyProg = createProgram(gl, SKY_VS, SKY_FS, ['aPos']);
  this.lineProg = createProgram(gl, LINE_VS, LINE_FS, ['aPos']);

  // 하늘용 전체 화면 삼각형
  this.skyBuf = makeBuffer(gl, gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]));

  // 블록 외곽선: 단위 큐브 와이어프레임. 실제 크기는 모델 행렬로 조절한다.
  const lines = [];
  const corners = [
    [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1],
    [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]
  ];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  edges.forEach(function (ed) {
    lines.push.apply(lines, corners[ed[0]]);
    lines.push.apply(lines, corners[ed[1]]);
  });
  this.outlineBuf = makeBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(lines));
  this.outlineCount = lines.length / 3;

  // 동적 엔티티 버퍼
  this.entityBuf = gl.createBuffer();
  this.entityIdxBuf = gl.createBuffer();
  this.itemBuf = gl.createBuffer();
  this.itemIdxBuf = gl.createBuffer();

  this.proj = mat4.create();
  this.view = mat4.create();
  this.model = mat4.create();
  this.viewProj = mat4.create();
  this.frustum = [];
  for (let i = 0; i < 6; i++) this.frustum.push(new Float32Array(4));

  this.chunkGL = new Map(); // chunk key -> {solid:{vbo,ibo,count}, water:{...}}
  this.stats = { chunks: 0, tris: 0 };

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.frontFace(gl.CCW);
}

Renderer.prototype.setAtlases = function (blockCanvas, itemCanvas) {
  this.atlasTex = makeTextureFromCanvas(this.gl, blockCanvas);
  this.itemTex = makeTextureFromCanvas(this.gl, itemCanvas);
};

Renderer.prototype.resize = function () {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(this.canvas.clientWidth * dpr);
  const h = Math.floor(this.canvas.clientHeight * dpr);
  if (this.canvas.width !== w || this.canvas.height !== h) {
    this.canvas.width = w; this.canvas.height = h;
  }
  this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  this.aspect = w / Math.max(1, h);
};

// ── 절두체 ────────────────────────────────────────────────────────────
Renderer.prototype.extractFrustum = function () {
  const m = this.viewProj, f = this.frustum;
  // 좌, 우, 하, 상, 근, 원
  const rows = [
    [3, 0, 1], [3, 0, -1], [3, 1, 1], [3, 1, -1], [3, 2, 1], [3, 2, -1]
  ];
  for (let i = 0; i < 6; i++) {
    const c = rows[i][1], s = rows[i][2];
    for (let j = 0; j < 4; j++) {
      f[i][j] = m[j * 4 + 3] + s * m[j * 4 + c];
    }
    const len = Math.hypot(f[i][0], f[i][1], f[i][2]) || 1;
    f[i][0] /= len; f[i][1] /= len; f[i][2] /= len; f[i][3] /= len;
  }
};

Renderer.prototype.boxInFrustum = function (x0, y0, z0, x1, y1, z1) {
  for (let i = 0; i < 6; i++) {
    const p = this.frustum[i];
    const px = p[0] > 0 ? x1 : x0;
    const py = p[1] > 0 ? y1 : y0;
    const pz = p[2] > 0 ? z1 : z0;
    if (p[0] * px + p[1] * py + p[2] * pz + p[3] < 0) return false;
  }
  return true;
};

// ── 청크 GPU 업로드 ───────────────────────────────────────────────────
Renderer.prototype.uploadChunk = function (chunk) {
  const gl = this.gl;
  const key = chunk.cx + ',' + chunk.cz;
  let entry = this.chunkGL.get(key);
  if (!entry) {
    entry = { solid: null, water: null };
    this.chunkGL.set(key, entry);
  }
  const self = this;

  function upload(slot, data) {
    if (!data.idx || data.idx.length === 0) {
      if (entry[slot]) {
        gl.deleteBuffer(entry[slot].vbo);
        gl.deleteBuffer(entry[slot].ibo);
        entry[slot] = null;
      }
      return;
    }
    let e = entry[slot];
    if (!e) {
      e = { vbo: gl.createBuffer(), ibo: gl.createBuffer(), count: 0 };
      entry[slot] = e;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, e.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, e.ibo);
    let idx = data.idx;
    if (!self.uintExt) {
      // 32bit 인덱스를 못 쓰면 16bit로 변환 (초과분은 잘림)
      const max = Math.min(idx.length, 65535);
      const small = new Uint16Array(max);
      for (let i = 0; i < max; i++) small[i] = idx[i];
      idx = small;
      e.type = gl.UNSIGNED_SHORT;
    } else {
      e.type = gl.UNSIGNED_INT;
    }
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    e.count = idx.length;
  }

  upload('solid', chunk.meshData.solid);
  upload('water', chunk.meshData.water);
  chunk.meshData = null; // CPU 사본 해제
};

Renderer.prototype.dropChunk = function (cx, cz) {
  const gl = this.gl;
  const key = cx + ',' + cz;
  const entry = this.chunkGL.get(key);
  if (!entry) return;
  ['solid', 'water'].forEach(function (s) {
    if (entry[s]) { gl.deleteBuffer(entry[s].vbo); gl.deleteBuffer(entry[s].ibo); }
  });
  this.chunkGL.delete(key);
};

// ── 프레임 ────────────────────────────────────────────────────────────
Renderer.prototype.beginFrame = function (player, opts) {
  const gl = this.gl;
  this.resize();

  const eye = player.eyePos();
  mat4.perspective(this.proj, opts.fov * Math.PI / 180, this.aspect, 0.06, 1200);
  mat4.identity(this.view);
  mat4.rotateX(this.view, this.view, -player.pitch);
  mat4.rotateY(this.view, this.view, -player.yaw);
  mat4.translate(this.view, this.view, [-eye[0], -eye[1], -eye[2]]);
  mat4.multiply(this.viewProj, this.proj, this.view);
  this.extractFrustum();

  gl.clearColor(opts.fogColor[0], opts.fogColor[1], opts.fogColor[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 하늘
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(this.skyProg);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.uniform3fv(this.skyProg.u.uTop, opts.skyTop);
  gl.uniform3fv(this.skyProg.u.uBottom, opts.skyBottom);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST);

  this.stats.chunks = 0; this.stats.tris = 0;
};

Renderer.prototype.setupTerrainProgram = function (opts) {
  const gl = this.gl;
  const p = this.terrainProg;
  gl.useProgram(p);
  gl.uniformMatrix4fv(p.u.uProj, false, this.proj);
  gl.uniformMatrix4fv(p.u.uView, false, this.view);
  gl.uniform1i(p.u.uTex, 0);
  gl.uniform1f(p.u.uDaylight, opts.daylight);
  gl.uniform3fv(p.u.uFogColor, opts.fogColor);
  gl.uniform1f(p.u.uFogStart, opts.fogStart);
  gl.uniform1f(p.u.uFogEnd, opts.fogEnd);
  gl.uniform1f(p.u.uTime, opts.time);
  gl.uniform4f(p.u.uTint, 1, 1, 1, 1);
  gl.uniform1f(p.u.uWave, 0);
  gl.uniform1f(p.u.uAlphaCut, 0.5);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
  return p;
};

Renderer.prototype.bindTerrainAttribs = function (vbo) {
  const gl = this.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const stride = 8 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 20);
};

Renderer.prototype.drawChunks = function (world, player, opts, pass) {
  const gl = this.gl;
  const p = this.setupTerrainProgram(opts);
  mat4.identity(this.model);
  gl.uniformMatrix4fv(p.u.uModel, false, this.model);

  if (pass === 'water') {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniform1f(p.u.uWave, 1);
    gl.uniform1f(p.u.uAlphaCut, 0.02);
    gl.disable(gl.CULL_FACE);
  }

  const list = [];
  const self = this;
  this.chunkGL.forEach(function (entry, key) {
    const parts = key.split(',');
    const cx = parseInt(parts[0], 10), cz = parseInt(parts[1], 10);
    const e = entry[pass === 'water' ? 'water' : 'solid'];
    if (!e || !e.count) return;
    const x0 = cx * CHUNK_X, z0 = cz * CHUNK_Z;
    if (!self.boxInFrustum(x0, 0, z0, x0 + CHUNK_X, CHUNK_Y, z0 + CHUNK_Z)) return;
    const dx = x0 + CHUNK_X / 2 - player.x, dz = z0 + CHUNK_Z / 2 - player.z;
    list.push({ e: e, d: dx * dx + dz * dz });
  });

  // 불투명은 앞→뒤(오버드로 감소), 반투명은 뒤→앞
  list.sort(function (a, b) { return pass === 'water' ? b.d - a.d : a.d - b.d; });

  for (let i = 0; i < list.length; i++) {
    const e = list[i].e;
    this.bindTerrainAttribs(e.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, e.ibo);
    gl.drawElements(gl.TRIANGLES, e.count, e.type, 0);
    this.stats.chunks++;
    this.stats.tris += e.count / 3;
  }

  if (pass === 'water') {
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.uniform1f(p.u.uWave, 0);
    gl.enable(gl.CULL_FACE);
  }
};

// ── 엔티티 ────────────────────────────────────────────────────────────
const _ev = [];
const _ei = [];

function emitBox(varr, iarr, cx, cy, cz, w, h, d, texName, frontTex, transform, light) {
  const hw = w / 2, hd = d / 2;
  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    const name = (f === 4 && frontTex) ? frontTex : texName;
    const t = texUV(name);
    const shade = FACE_SHADE[f];
    const base = varr.length / 8;
    for (let ci = 0; ci < 4; ci++) {
      const tu = (ci === 1 || ci === 2) ? 1 : 0;
      const tv = (ci === 2 || ci === 3) ? 1 : 0;
      // 단위 큐브 좌표 -> 상자 크기
      const ux = face.origin[0] + face.u[0] * tu + face.v[0] * tv;
      const uy = face.origin[1] + face.u[1] * tu + face.v[1] * tv;
      const uz = face.origin[2] + face.u[2] * tu + face.v[2] * tv;
      let px = (ux - 0.5) * w;
      let py = uy * h;
      let pz = (uz - 0.5) * d;
      const out = transform(px, py, pz);
      const uvp = face.uv(tu, tv);
      varr.push(
        cx + out[0], cy + out[1], cz + out[2],
        t.u0 + (t.u1 - t.u0) * uvp[0],
        t.v0 + (t.v1 - t.v0) * uvp[1],
        light[0], light[1], shade
      );
    }
    iarr.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

Renderer.prototype.drawEntities = function (mgr, world, player, opts) {
  const gl = this.gl;
  _ev.length = 0; _ei.length = 0;

  for (let i = 0; i < mgr.mobs.length; i++) {
    const m = mgr.mobs[i];
    const dx = m.x - player.x, dz = m.z - player.z;
    if (dx * dx + dz * dz > 80 * 80) continue;
    const hw = m.def.width / 2 + 0.3;
    if (!this.boxInFrustum(m.x - hw, m.y, m.z - hw, m.x + hw, m.y + m.def.height + 0.2, m.z + hw)) continue;

    const sky = world.getSky(Math.floor(m.x), Math.floor(m.y + 0.5), Math.floor(m.z)) / 15;
    const blk = world.getBlockLight(Math.floor(m.x), Math.floor(m.y + 0.5), Math.floor(m.z)) / 15;
    const light = [sky, blk];

    const cosY = Math.cos(m.yaw), sinY = Math.sin(m.yaw);
    const swing = Math.sin(m.limbSwing) * (m.moving || m.def.hostile ? 0.7 : 0);

    for (let pi = 0; pi < m.def.parts.length; pi++) {
      const part = m.def.parts[pi];
      let angle = 0;
      let pivotY = part.y;
      if (part.leg !== undefined) { angle = swing * (part.leg ? -1 : 1); pivotY = part.y + part.h; }
      if (part.arm !== undefined) { angle = m.def.hostile ? -1.5 : swing * 0.6; pivotY = part.y + part.h; }
      const ca = Math.cos(angle), sa = Math.sin(angle);

      const transform = function (px, py, pz) {
        // 부위 로컬 좌표 -> 사지 회전(X축) -> 몹 위치 오프셋 -> 몸 전체 Y회전
        let ly = py + part.y;
        let lz = pz;
        if (angle !== 0) {
          const ry = ly - pivotY, rz = lz;
          ly = pivotY + ry * ca - rz * sa;
          lz = ry * sa + rz * ca;
        }
        const lx = px + part.x;
        lz = lz + part.z;
        return [lx * cosY + lz * sinY, ly, -lx * sinY + lz * cosY];
      };

      emitBox(_ev, _ei, m.x, m.y, m.z, part.w, part.h, part.d,
        part.tex, part.front, transform, light);
    }
  }

  if (_ei.length === 0) return;

  const p = this.setupTerrainProgram(opts);
  mat4.identity(this.model);
  gl.uniformMatrix4fv(p.u.uModel, false, this.model);
  gl.uniform1f(p.u.uAlphaCut, 0.5);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.entityBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(_ev), gl.DYNAMIC_DRAW);
  this.bindTerrainAttribs(this.entityBuf);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.entityIdxBuf);
  const idx = this.uintExt ? new Uint32Array(_ei) : new Uint16Array(_ei);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW);
  gl.drawElements(gl.TRIANGLES, idx.length, this.uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
};

// 떨어진 아이템: 카메라를 향하는 얇은 판
Renderer.prototype.drawItems = function (mgr, world, player, opts) {
  const gl = this.gl;
  _ev.length = 0; _ei.length = 0;

  // 언제나 카메라를 바라보게 한다 (옆에서 보면 사라지는 문제 방지)
  const rc = Math.cos(player.yaw), rs = Math.sin(player.yaw);

  for (let i = 0; i < mgr.items.length; i++) {
    const it = mgr.items[i];
    const dx = it.x - player.x, dz = it.z - player.z;
    if (dx * dx + dz * dz > 64 * 64) continue;
    const t = itemUV(it.name);
    if (!t) continue;
    const bob = Math.sin(it.age * 3) * 0.06 + 0.14;
    const size = 0.42;
    const sky = world.getSky(Math.floor(it.x), Math.floor(it.y + 0.2), Math.floor(it.z)) / 15;
    const blk = world.getBlockLight(Math.floor(it.x), Math.floor(it.y + 0.2), Math.floor(it.z)) / 15;

    // 카메라를 향한 세로 판
    const corners = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
    const base = _ev.length / 8;
    for (let c = 0; c < 4; c++) {
      const lx = corners[c][0] * size * 0.5;
      const ly = corners[c][1] * size;
      const wx = lx * rc, wz = -lx * rs;
      _ev.push(
        it.x + wx, it.y + bob + ly, it.z + wz,
        c === 0 || c === 3 ? t.u0 : t.u1,
        c === 0 || c === 1 ? t.v1 : t.v0,
        sky, blk, 1
      );
    }
    _ei.push(base, base + 1, base + 2, base, base + 2, base + 3);
    // 뒷면
    const b2 = _ev.length / 8;
    for (let c = 3; c >= 0; c--) {
      const lx = corners[c][0] * size * 0.5;
      const ly = corners[c][1] * size;
      const wx = lx * rc, wz = -lx * rs;
      _ev.push(
        it.x + wx, it.y + bob + ly, it.z + wz,
        c === 0 || c === 3 ? t.u0 : t.u1,
        c === 0 || c === 1 ? t.v1 : t.v0,
        sky, blk, 1
      );
    }
    _ei.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3);
  }

  if (_ei.length === 0) return;

  const p = this.setupTerrainProgram(opts);
  mat4.identity(this.model);
  gl.uniformMatrix4fv(p.u.uModel, false, this.model);
  gl.uniform1f(p.u.uAlphaCut, 0.5);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, this.itemTex);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.itemBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(_ev), gl.DYNAMIC_DRAW);
  this.bindTerrainAttribs(this.itemBuf);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.itemIdxBuf);
  const idx = this.uintExt ? new Uint32Array(_ei) : new Uint16Array(_ei);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW);
  gl.drawElements(gl.TRIANGLES, idx.length, this.uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
};

// ── 선택 외곽선 ───────────────────────────────────────────────────────
// box: [x0,y0,z0,x1,y1,z1] (블록 로컬 0~1 좌표). 생략하면 전체 큐브.
Renderer.prototype.drawOutline = function (x, y, z, box) {
  const gl = this.gl;
  const p = this.lineProg;
  const e = 0.003;
  const b = box || [0, 0, 0, 1, 1, 1];
  gl.useProgram(p);
  mat4.identity(this.model);
  mat4.translate(this.model, this.model, [x + b[0] - e, y + b[1] - e, z + b[2] - e]);
  mat4.scale(this.model, this.model, [
    b[3] - b[0] + e * 2, b[4] - b[1] + e * 2, b[5] - b[2] + e * 2
  ]);
  gl.uniformMatrix4fv(p.u.uProj, false, this.proj);
  gl.uniformMatrix4fv(p.u.uView, false, this.view);
  gl.uniformMatrix4fv(p.u.uModel, false, this.model);
  gl.uniform4f(p.u.uColor, 0, 0, 0, 0.5);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.outlineBuf);
  gl.enableVertexAttribArray(0);
  gl.disableVertexAttribArray(1);
  gl.disableVertexAttribArray(2);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.LINES, 0, this.outlineCount);
  gl.disable(gl.BLEND);
};
