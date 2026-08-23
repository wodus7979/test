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
  this.cloudProg = createProgram(gl, CLOUD_VS, CLOUD_FS, ['aPos', 'aShade']);
  this.weatherProg = createProgram(gl, WEATHER_VS, WEATHER_FS, ['aCorner', 'aSeed']);

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

  // 화면 후처리(셰이더). 지원되지 않으면 조용히 꺼진다.
  this.post = new PostFX(gl);
  this.invViewProj = mat4.create();

  this.cloud = null;         // {vbo, ibo, count, span}
  this.rainBuf = null;       // 비·눈 입자 (한 번 만들고 계속 쓴다)

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.frontFace(gl.CCW);
}

// ── 구름 ──────────────────────────────────────────────────────────────
Renderer.prototype.setClouds = function (mesh) {
  const gl = this.gl;
  if (this.cloud) { gl.deleteBuffer(this.cloud.vbo); gl.deleteBuffer(this.cloud.ibo); }
  const vbo = makeBuffer(gl, gl.ARRAY_BUFFER, mesh.verts);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  let idxArr = mesh.idx, type = gl.UNSIGNED_INT;
  if (!this.uintExt) {
    // 16비트 인덱스뿐이면 앞부분만 쓴다 (구름이 조금 줄어들 뿐)
    const max = Math.min(mesh.idx.length, 65535);
    idxArr = new Uint16Array(mesh.idx.subarray(0, max));
    type = gl.UNSIGNED_SHORT;
  }
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArr, gl.STATIC_DRAW);
  this.cloud = { vbo: vbo, ibo: ibo, count: idxArr.length, type: type, span: mesh.span };
};

// 구름 판을 플레이어 주변 3×3으로 이어 붙여 끝없이 보이게 한다.
Renderer.prototype.drawClouds = function (player, opts) {
  const c = this.cloud;
  if (!c || !c.count || opts.cloudAlpha <= 0.01) return;
  const gl = this.gl;
  const p = this.cloudProg;
  const span = c.span;
  const drift = opts.cloudDrift;

  gl.useProgram(p);
  gl.uniformMatrix4fv(p.u.uProj, false, this.proj);
  gl.uniformMatrix4fv(p.u.uView, false, this.view);
  gl.uniform3fv(p.u.uCam, player.eyePos());
  gl.uniform3fv(p.u.uColor, opts.cloudColor);
  gl.uniform1f(p.u.uAlpha, opts.cloudAlpha);
  gl.uniform1f(p.u.uNear, CLOUD_NEAR);
  gl.uniform1f(p.u.uFar, CLOUD_FAR);

  gl.bindBuffer(gl.ARRAY_BUFFER, c.vbo);
  gl.enableVertexAttribArray(0);
  gl.enableVertexAttribArray(1);
  gl.disableVertexAttribArray(2);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.ibo);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);           // 구름 속에 들어가도 보이게

  const cx = Math.round((player.x - drift) / span);
  const cz = Math.round(player.z / span);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ox = (cx + dx) * span + drift, oz = (cz + dz) * span;
      if (!this.boxInFrustum(ox, CLOUD_Y, oz, ox + span, CLOUD_Y + CLOUD_H, oz + span)) continue;
      mat4.identity(this.model);
      mat4.translate(this.model, this.model, [ox, 0, oz]);
      gl.uniformMatrix4fv(p.u.uModel, false, this.model);
      gl.drawElements(gl.TRIANGLES, c.count, c.type, 0);
      this.stats.tris += c.count / 3;
    }
  }

  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.enable(gl.CULL_FACE);
};

// ── 비·눈 ─────────────────────────────────────────────────────────────
// 입자는 셰이더가 시간으로 위치를 계산하므로 버퍼는 한 번만 만들면 된다.
Renderer.prototype.buildWeatherBuffer = function (count, radius) {
  const gl = this.gl;
  if (this.rainBuf && this.rainBuf.count === count) return this.rainBuf;
  if (this.rainBuf) { gl.deleteBuffer(this.rainBuf.vbo); gl.deleteBuffer(this.rainBuf.ibo); }

  const rnd = makeRandom(0x51ab3c7);
  const v = new Float32Array(count * 4 * 5);
  const useInt = !!this.uintExt;
  const idx = useInt ? new Uint32Array(count * 6) : new Uint16Array(Math.min(count, 10920) * 6);
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  let vi = 0, ii = 0;
  const quads = useInt ? count : Math.min(count, 10920);
  for (let i = 0; i < count; i++) {
    // 원판 안에 고르게 뿌린다
    const ang = rnd() * Math.PI * 2;
    const r = radius * Math.sqrt(rnd());
    const ox = Math.cos(ang) * r, oz = Math.sin(ang) * r;
    const phase = rnd();
    for (let k = 0; k < 4; k++) {
      v[vi++] = corners[k][0]; v[vi++] = corners[k][1];
      v[vi++] = ox; v[vi++] = oz; v[vi++] = phase;
    }
    if (i < quads) {
      const b = i * 4;
      idx[ii++] = b; idx[ii++] = b + 1; idx[ii++] = b + 2;
      idx[ii++] = b; idx[ii++] = b + 2; idx[ii++] = b + 3;
    }
  }
  const vbo = makeBuffer(gl, gl.ARRAY_BUFFER, v);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  this.rainBuf = {
    vbo: vbo, ibo: ibo, count: count, idxCount: ii,
    type: useInt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT
  };
  return this.rainBuf;
};

Renderer.prototype.drawWeather = function (player, opts) {
  const w = opts.weather;
  if (!w || w.alpha <= 0.01) return;
  const gl = this.gl;
  const buf = this.buildWeatherBuffer(w.count, WEATHER_RADIUS);
  const p = this.weatherProg;

  // 카메라 오른쪽 벡터 (뷰 행렬의 첫 번째 행)
  const vm = this.view;
  const right = [vm[0], vm[4], vm[8]];
  const up = w.snow ? [vm[1], vm[5], vm[9]] : [0, 1, 0];

  gl.useProgram(p);
  gl.uniformMatrix4fv(p.u.uProj, false, this.proj);
  gl.uniformMatrix4fv(p.u.uView, false, this.view);
  // 입자가 플레이어를 따라 미끄러지지 않게 블록 단위로 붙인다
  gl.uniform3f(p.u.uOrigin, Math.floor(player.x), player.y, Math.floor(player.z));
  gl.uniform3fv(p.u.uRight, right);
  gl.uniform3fv(p.u.uUp, up);
  gl.uniform1f(p.u.uTime, opts.time);
  gl.uniform1f(p.u.uFall, w.snow ? 2.2 : 22.0);
  gl.uniform1f(p.u.uSize, w.snow ? 0.095 : 0.045);
  gl.uniform1f(p.u.uStretch, w.snow ? 1.0 : 16.0);
  gl.uniform1f(p.u.uSway, w.snow ? 0.9 : 0.0);
  gl.uniform1f(p.u.uSpan, WEATHER_SPAN);
  gl.uniform1f(p.u.uRadius, WEATHER_RADIUS);
  gl.uniform3fv(p.u.uColor, w.color);
  gl.uniform1f(p.u.uAlpha, w.alpha);
  gl.uniform1f(p.u.uRound, w.snow ? 1 : 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, buf.vbo);
  gl.enableVertexAttribArray(0);
  gl.enableVertexAttribArray(1);
  gl.disableVertexAttribArray(2);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.ibo);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  gl.drawElements(gl.TRIANGLES, buf.idxCount, buf.type, 0);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.enable(gl.CULL_FACE);
  this.stats.tris += buf.idxCount / 3;
};

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

  // opts.cam 이 있으면 그 자리에서 본다 (비행기 3인칭 카메라)
  const eye = opts.cam ? opts.cam.eye : player.eyePos();
  const camYaw = opts.cam ? opts.cam.yaw : player.yaw;
  const camPitch = opts.cam ? opts.cam.pitch : player.pitch;
  mat4.perspective(this.proj, opts.fov * Math.PI / 180, this.aspect, 0.06, 1200);
  mat4.identity(this.view);
  if (opts.shakeX) mat4.rotateZ(this.view, this.view, opts.shakeX);
  if (opts.cam && opts.cam.roll) mat4.rotateZ(this.view, this.view, opts.cam.roll);
  mat4.rotateX(this.view, this.view, -camPitch + (opts.shakeY || 0));
  mat4.rotateY(this.view, this.view, -camYaw);
  mat4.translate(this.view, this.view, [-eye[0], -eye[1], -eye[2]]);
  mat4.multiply(this.viewProj, this.proj, this.view);
  this.extractFrustum();
  mat4.invert(this.invViewProj, this.viewProj);

  // 후처리를 쓰면 화면 대신 텍스처에 그린다
  this.postOn = this.post.begin(this.canvas.width, this.canvas.height);

  gl.clearColor(opts.fogColor[0], opts.fogColor[1], opts.fogColor[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 하늘 (해·달·별·노을)
  gl.disable(gl.DEPTH_TEST);
  const sp = this.skyProg;
  gl.useProgram(sp);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
  gl.enableVertexAttribArray(0);
  gl.disableVertexAttribArray(1);
  gl.disableVertexAttribArray(2);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.uniform3fv(sp.u.uTop, opts.skyTop);
  gl.uniform3fv(sp.u.uBottom, opts.skyBottom);
  gl.uniformMatrix4fv(sp.u.uInvVP, false, this.invViewProj);
  gl.uniform3fv(sp.u.uCamPos, eye);
  gl.uniform3fv(sp.u.uSunDir, opts.sunDir);
  gl.uniform3fv(sp.u.uSunColor, opts.sunColor);
  gl.uniform1f(sp.u.uNight, opts.night);
  gl.uniform1f(sp.u.uSunset, opts.sunset);
  gl.uniform1f(sp.u.uUnder, opts.under > 0.5 ? 1 : 0);
  gl.uniform1f(sp.u.uHigh, opts.high || 0);
  gl.uniform1f(sp.u.uAurora, opts.aurora || 0);
  gl.uniform1f(sp.u.uTime, opts.time);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST);

  this.stats.chunks = 0; this.stats.tris = 0;
};

// 후처리를 입혀 화면에 낸다. 프레임의 맨 마지막에 부른다.
Renderer.prototype.endFrame = function (opts) {
  if (this.postOn) this.post.end(opts);
  this.postOn = false;
};

// 해가 화면 어디에 있는지 (갓레이용). 뒤에 있으면 sunOnScreen = false
Renderer.prototype.sunScreenPos = function (sunDir, out) {
  const m = this.viewProj;
  const x = sunDir[0], y = sunDir[1], z = sunDir[2];
  const cw = m[3] * x + m[7] * y + m[11] * z;
  if (cw <= 0.0001) { out.on = false; return out; }
  const cx = m[0] * x + m[4] * y + m[8] * z;
  const cy = m[1] * x + m[5] * y + m[9] * z;
  out.x = (cx / cw) * 0.5 + 0.5;
  out.y = (cy / cw) * 0.5 + 0.5;
  // 화면에서 조금 벗어나도 빛줄기는 살아 있다
  out.on = out.x > -0.55 && out.x < 1.55 && out.y > -0.55 && out.y < 1.55;
  return out;
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
// 몹·비행기·전동차·자동차는 모양이 매 프레임 바뀌므로 그때그때 다시 만든다.
// 프레임마다 배열을 새로 만들면 쓰레기가 쌓이니, 늘어나는 타입 배열 하나를
// 계속 다시 쓴다.
function GeomBuf(verts) {
  this.v = new Float32Array(verts * 8);
  this.i = new Uint32Array(verts * 6 / 4);
  this.i16 = null;      // uint32 확장이 없는 기기에서만 쓴다
  this.vn = 0;          // 채워 넣은 float 개수
  this.inn = 0;         // 채워 넣은 index 개수
}

GeomBuf.prototype.reset = function () { this.vn = 0; this.inn = 0; };

// 상자 하나(정점 24, 인덱스 36)를 더 담을 자리를 만든다
GeomBuf.prototype.reserveBox = function () {
  if (this.vn + 24 * 8 > this.v.length) {
    const nv = new Float32Array(this.v.length * 2);
    nv.set(this.v.subarray(0, this.vn));
    this.v = nv;
  }
  if (this.inn + 36 > this.i.length) {
    const ni = new Uint32Array(this.i.length * 2);
    ni.set(this.i.subarray(0, this.inn));
    this.i = ni;
  }
};

// 사각형 n 개를 더 담을 자리를 만든다 (상자가 아닌 자유 모양용)
GeomBuf.prototype.reserveQuads = function (n) {
  const needV = this.vn + n * 4 * 8;
  if (needV > this.v.length) {
    let cap = this.v.length;
    while (cap < needV) cap *= 2;
    const nv = new Float32Array(cap);
    nv.set(this.v.subarray(0, this.vn));
    this.v = nv;
  }
  const needI = this.inn + n * 6;
  if (needI > this.i.length) {
    let cap = this.i.length;
    while (cap < needI) cap *= 2;
    const ni = new Uint32Array(cap);
    ni.set(this.i.subarray(0, this.inn));
    this.i = ni;
  }
};

// 그릴 인덱스 배열 — uint32 를 못 쓰는 기기에서는 16비트로 옮겨 담는다
GeomBuf.prototype.indices = function (uint32) {
  if (uint32) return this.i.subarray(0, this.inn);
  if (!this.i16 || this.i16.length < this.inn) this.i16 = new Uint16Array(this.i.length);
  this.i16.set(this.i.subarray(0, this.inn));
  return this.i16.subarray(0, this.inn);
};

const _geom = new GeomBuf(8192);
const _out3 = [0, 0, 0];
const _out3b = [0, 0, 0];

// 면이 향한 쪽에 따른 밝기. 블록은 여섯 방향뿐이라 표를 썼지만,
// 매끈한 모형은 방향이 제각각이라 그때그때 셈한다.
function shadeOfNormal(nx, ny, nz) {
  const s = 0.63 + 0.33 * ny + 0.07 * nx + 0.04 * nz;
  return s < 0.42 ? 0.42 : (s > 1 ? 1 : s);
}

// 미리 만들어 둔 모형(Mesh3D)을 한 번에 얹는다.
// rot 은 회전만 하는 함수다 — 자리 옮김은 모형 좌표에 이미 들어 있다.
Renderer.prototype.emitMesh = function (mesh, cx, cy, cz, rot, scale, light, opts) {
  const buf = _geom;
  const P = mesh.pos, U = mesh.uv, N = mesh.nrm, T = mesh.tex, TW = mesh.two;
  const nq = T.length;
  const glow = opts && opts.glow;
  // 자리 옮김이 섞인 변환(바퀴처럼)에서는 법선용 변환을 따로 받는다
  const nrot = (opts && opts.nxf) ? opts.nxf : rot;
  buf.reserveQuads(nq * 2);
  const V = buf.i, F = buf.v;
  const o = _out3, no = _out3b;
  const l0 = light[0], l1 = light[1];
  for (let q = 0; q < nq; q++) {
    const name = T[q];
    if (opts && opts.skip && opts.skip[name]) continue;
    const t = texUV(name);
    const du = t.u1 - t.u0, dv = t.v1 - t.v0;
    nrot(N[q * 3], N[q * 3 + 1], N[q * 3 + 2], no);
    const lit = (glow && glow[name]) ? 1 : shadeOfNormal(no[0], no[1], no[2]);
    const gl0 = (glow && glow[name]) ? 1 : l0;
    const gl1 = (glow && glow[name]) ? 1 : l1;
    let vn = buf.vn;
    const base = vn / 8;
    for (let c = 0; c < 4; c++) {
      const pi = (q * 4 + c) * 3, ui = (q * 4 + c) * 2;
      rot(P[pi] * scale, P[pi + 1] * scale, P[pi + 2] * scale, o);
      F[vn] = cx + o[0]; F[vn + 1] = cy + o[1]; F[vn + 2] = cz + o[2];
      F[vn + 3] = t.u0 + du * U[ui];
      F[vn + 4] = t.v0 + dv * U[ui + 1];
      F[vn + 5] = gl0; F[vn + 6] = gl1; F[vn + 7] = lit;
      vn += 8;
    }
    buf.vn = vn;
    let inn = buf.inn;
    V[inn] = base; V[inn + 1] = base + 1; V[inn + 2] = base + 2;
    V[inn + 3] = base; V[inn + 4] = base + 2; V[inn + 5] = base + 3;
    buf.inn = inn + 6;

    // 얇은 판은 안쪽에서도 보여야 한다 (객실 안, 조종석 안)
    if (TW[q]) {
      const backLit = shadeOfNormal(-no[0], -no[1], -no[2]);
      vn = buf.vn;
      const b2 = vn / 8;
      for (let c = 0; c < 4; c++) {
        const src = (buf.vn - 32) + c * 8;
        F[vn] = F[src]; F[vn + 1] = F[src + 1]; F[vn + 2] = F[src + 2];
        F[vn + 3] = F[src + 3]; F[vn + 4] = F[src + 4];
        F[vn + 5] = gl0; F[vn + 6] = gl1;
        F[vn + 7] = (glow && glow[name]) ? 1 : backLit;
        vn += 8;
      }
      buf.vn = vn;
      inn = buf.inn;
      V[inn] = b2; V[inn + 1] = b2 + 2; V[inn + 2] = b2 + 1;
      V[inn + 3] = b2; V[inn + 4] = b2 + 3; V[inn + 5] = b2 + 2;
      buf.inn = inn + 6;
    }
  }
};

// 면 6 × 모서리 4 마다 [단위큐브 x, y, z, 텍스처 u, v] — 매번 다시 셈하지 않는다
const BOX_CORNER = (function () {
  const a = new Float32Array(6 * 4 * 5);
  let k = 0;
  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    for (let ci = 0; ci < 4; ci++) {
      const tu = (ci === 1 || ci === 2) ? 1 : 0;
      const tv = (ci === 2 || ci === 3) ? 1 : 0;
      const uvp = face.uv(tu, tv);
      a[k++] = face.origin[0] + face.u[0] * tu + face.v[0] * tv;
      a[k++] = face.origin[1] + face.u[1] * tu + face.v[1] * tv;
      a[k++] = face.origin[2] + face.u[2] * tu + face.v[2] * tv;
      a[k++] = uvp[0];
      a[k++] = uvp[1];
    }
  }
  return a;
})();

// transform 은 결과를 out[0..2] 에 적는다 (배열을 새로 만들지 않으려고)
function emitBox(buf, cx, cy, cz, w, h, d, texName, frontTex, transform, light) {
  buf.reserveBox();                 // 자리부터 잡는다 (아래에서 배열을 붙잡고 쓰므로)
  const V = buf.v, I = buf.i;
  const l0 = light[0], l1 = light[1];
  const out = _out3;
  const tMain = texUV(texName);
  const tFront = frontTex ? texUV(frontTex) : tMain;
  for (let f = 0; f < 6; f++) {
    const t = (f === 4) ? tFront : tMain;
    const u0 = t.u0, du = t.u1 - t.u0, v0 = t.v0, dv = t.v1 - t.v0;
    const shade = FACE_SHADE[f];
    let vn = buf.vn;
    const base = vn / 8;
    let c = f * 20;
    for (let ci = 0; ci < 4; ci++) {
      transform((BOX_CORNER[c] - 0.5) * w, BOX_CORNER[c + 1] * h, (BOX_CORNER[c + 2] - 0.5) * d, out);
      V[vn] = cx + out[0];
      V[vn + 1] = cy + out[1];
      V[vn + 2] = cz + out[2];
      V[vn + 3] = u0 + du * BOX_CORNER[c + 3];
      V[vn + 4] = v0 + dv * BOX_CORNER[c + 4];
      V[vn + 5] = l0;
      V[vn + 6] = l1;
      V[vn + 7] = shade;
      vn += 8; c += 5;
    }
    buf.vn = vn;
    let inn = buf.inn;
    I[inn] = base; I[inn + 1] = base + 1; I[inn + 2] = base + 2;
    I[inn + 3] = base; I[inn + 4] = base + 2; I[inn + 5] = base + 3;
    buf.inn = inn + 6;
  }
}

// 면마다 텍스처가 다른 단위 정육면체 (떨어지는 모래, 터지기 직전 TNT).
// emitBox 는 앞면 하나만 바꿀 수 있어서 따로 둔다.
function emitUnitCube(buf, x, y, z, id, sky, blk, flash) {
  buf.reserveBox();
  const V = buf.v, I = buf.i;
  let vn = buf.vn, inn = buf.inn;
  for (let f = 0; f < 6; f++) {
    const t = texUV(blockTexName(id, f));
    const u0 = t.u0, du = t.u1 - t.u0, v0 = t.v0, dv = t.v1 - t.v0;
    const shade = flash ? 1 : FACE_SHADE[f];
    const base = vn / 8;
    let c = f * 20;
    for (let ci = 0; ci < 4; ci++) {
      V[vn] = x - 0.5 + BOX_CORNER[c];
      V[vn + 1] = y + BOX_CORNER[c + 1];
      V[vn + 2] = z - 0.5 + BOX_CORNER[c + 2];
      V[vn + 3] = u0 + du * BOX_CORNER[c + 3];
      V[vn + 4] = v0 + dv * BOX_CORNER[c + 4];
      V[vn + 5] = sky;
      V[vn + 6] = blk;
      V[vn + 7] = shade;
      vn += 8; c += 5;
    }
    I[inn] = base; I[inn + 1] = base + 1; I[inn + 2] = base + 2;
    I[inn + 3] = base; I[inn + 4] = base + 2; I[inn + 5] = base + 3;
    inn += 6;
  }
  buf.vn = vn; buf.inn = inn;
}

// 쌓아 둔 엔티티 지오메트리를 한 번에 올려 그린다 (다섯 군데가 쓰던 같은 코드)
Renderer.prototype.flushEntityGeom = function (opts, countTris) {
  const buf = _geom;
  if (!buf.inn) return;
  const gl = this.gl;
  const prog = this.setupTerrainProgram(opts);
  mat4.identity(this.model);
  gl.uniformMatrix4fv(prog.u.uModel, false, this.model);
  gl.uniform1f(prog.u.uAlphaCut, 0.5);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.entityBuf);
  gl.bufferData(gl.ARRAY_BUFFER, buf.v.subarray(0, buf.vn), gl.DYNAMIC_DRAW);
  this.bindTerrainAttribs(this.entityBuf);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.entityIdxBuf);
  const idx = buf.indices(this.uintExt);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW);
  gl.drawElements(gl.TRIANGLES, idx.length, this.uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  if (countTris !== false) this.stats.tris += idx.length / 3;
};

Renderer.prototype.drawEntities = function (mgr, world, player, opts) {
  const gl = this.gl;
  _geom.reset();

  for (let i = 0; i < mgr.mobs.length; i++) {
    const m = mgr.mobs[i];
    const dx = m.x - player.x, dz = m.z - player.z;
    if (dx * dx + dz * dz > 140 * 140) continue;
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

      const transform = function (px, py, pz, out) {
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
        out[0] = lx * cosY + lz * sinY; out[1] = ly; out[2] = -lx * sinY + lz * cosY;
      };

      emitBox(_geom, m.x, m.y, m.z, part.w, part.h, part.d,
        part.tex, part.front, transform, light);
    }
  }

  this.flushEntityGeom(opts, false);
};

// ── 비행기 ────────────────────────────────────────────────────────────
Renderer.prototype.drawPlanes = function (mgr, world, player, opts) {
  const list = mgr.planes;
  if (!list || !list.length) return;
  const gl = this.gl;
  _geom.reset();

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const dx = p.x - player.x, dz = p.z - player.z;
    if (dx * dx + dz * dz > 1400 * 1400) continue;
    const PS = PLANE_SCALE;
    if (!this.boxInFrustum(p.x - 14 * PS, p.y - 6 * PS, p.z - 15 * PS,
      p.x + 14 * PS, p.y + 9 * PS, p.z + 15 * PS)) continue;

    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const sky = (p.y > CHUNK_Y - 4) ? 1 : world.getSky(bx, Math.min(CHUNK_Y - 1, by), bz) / 15;
    const blk = world.getBlockLight(bx, Math.min(CHUNK_Y - 1, by), bz) / 15;
    // 하늘 높이 뜨면 언제나 햇빛을 받는다
    const light = [Math.max(sky, p.onGround ? 0 : 0.85), blk];

    const cr = Math.cos(p.roll), sr = Math.sin(p.roll);
    const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);

    // 기체 자세 — 롤 → 피치 → 요 차례로 돌린다 (자리 옮김은 없다)
    const rot = function (lx, ly, lz, out) {
      const x1 = lx * cr - ly * sr, y1 = lx * sr + ly * cr;
      const y2 = y1 * cp + lz * sp, z2 = -y1 * sp + lz * cp;
      out[0] = x1 * cy + z2 * sy; out[1] = y2; out[2] = -x1 * sy + z2 * cy;
    };
    // 동체·날개·엔진·꼬리는 곡면 모형 한 덩어리
    this.emitMesh(planeMesh(), p.x, p.y, p.z, rot, PS, light, null);

    // 착륙장치만 상자로 남는다 (접히면서 동체 안으로 들어간다)
    if (p.gear >= 0.05) {
      for (let k = 0; k < PLANE_GEAR.length; k++) {
        const b = PLANE_GEAR[k];
        const tuck = (1 - p.gear) * 1.7;
        const bh = b.h;
        const transform = function (px, py, pz, out) {
          const lx = px + b.x * PS, ly = py - bh * PS / 2 + (b.y + tuck) * PS, lz = pz + b.z * PS;
          rot(lx, ly, lz, out);
        };
        emitBox(_geom, p.x, p.y, p.z, b.w * PS, bh * PS, b.d * PS, b.tex, b.front, transform, light);
      }
    }
  }

  this.flushEntityGeom(opts);
};

// ── 열차 ──────────────────────────────────────────────────────────────
// 전조등은 밤에도 스스로 빛난다
const TRAIN_MESH_OPTS = { glow: { tr_light: 1 } };

Renderer.prototype.drawTrains = function (mgr, world, player, opts) {
  const list = mgr.trains;
  if (!list || !list.length) return;
  const gl = this.gl;
  _geom.reset();

  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const dx = t.x - player.x, dz = t.z - player.z;
    if (dx * dx + dz * dz > 900 * 900) continue;
    if (!this.boxInFrustum(t.x - 34, t.y - 5, t.z - 34, t.x + 34, t.y + 6, t.z + 34)) continue;

    const bx = Math.floor(t.x), by = Math.floor(t.y), bz = Math.floor(t.z);
    const sky = world.getSky(bx, Math.min(CHUNK_Y - 1, by + 3), bz) / 15;
    const blk = world.getBlockLight(bx, Math.min(CHUNK_Y - 1, by), bz) / 15;
    const light = [Math.max(sky, 0.55), Math.max(blk, 0.35)];

    // 거리에 따라 부품을 줄인다 — 멀리 있는 열차는 겉모습만 그린다
    const near = Math.sqrt(dx * dx + dz * dz);
    const showInner = (t.rider === player) || near < 90;
    const showWheels = near < 300;

    // 량마다 제 자리·제 방향으로 그린다. 편성을 한 덩어리로 두면
    // 코너에서 앞뒤 량이 레일 밖으로 밀려난다.
    for (let ci = 0; ci < TRAIN_CARS; ci++) {
      const po = (t.pose && t.pose[ci]) ? t.pose[ci] : t;
      const cy = Math.cos(po.yaw), sy = Math.sin(po.yaw);
      const rot = function (lx, ly, lz, out) {
        out[0] = lx * cy + lz * sy; out[1] = ly; out[2] = -lx * sy + lz * cy;
      };
      // 둥근 지붕과 운전실 코
      this.emitMesh(trainCarMesh(ci), po.x, po.y, po.z, rot, 1, light, TRAIN_MESH_OPTS);

      const parts = TRAIN_CAR_PARTS[ci];
      for (let k = 0; k < parts.length; k++) {
        const b = parts[k];
        if (b.inner && !showInner) continue;
        if (b.wheel) {
          if (!showWheels) continue;
          // 바퀴 — 얇은 판 세 장을 60°씩 어긋나게 겹쳐 둥글게 보이게 하고,
          // 달린 거리만큼 굴린다.
          const spokes = near < 70 ? 3 : 1;
          for (let sp = 0; sp < spokes; sp++) {
            const ang = t.wheelAngle + sp * (Math.PI / 3);
            const ca = Math.cos(ang), sa = Math.sin(ang);
            const wt = function (px, py, pz, out) {
              // 바퀴 로컬 (py 는 0~h) -> 축(X) 둘레 회전. b.y 는 굴대 높이다.
              const ry = py - b.r, rz = pz;
              const y2 = ry * ca - rz * sa, z2 = ry * sa + rz * ca;
              const lx = px + b.x, ly = y2 + b.y, lz = z2 + b.z;
              rot(lx, ly, lz, out);
            };
            emitBox(_geom, po.x, po.y, po.z, b.w, b.r * 2, b.r, 'tr_wheel', null, wt, light);
          }
          continue;
        }
        const bh = b.h;
        const transform = function (px, py, pz, out) {
          rot(px + b.x, py - bh / 2 + b.y, pz + b.z, out);
        };
        emitBox(_geom, po.x, po.y, po.z, b.w, bh, b.d, b.tex, b.front, transform, light);
      }
    }
  }

  this.flushEntityGeom(opts);
};

// ── 자동차 ────────────────────────────────────────────────────────────
// 스스로 빛나는 부품 표면
const CAR_GLOW = { car_lightF: 1, car_lightR: 1, car_siren: 1 };
const CAR_MESH_OPTS = { glow: CAR_GLOW };

// 차 한 대를 통째로 얹는다 (차체는 곡면 모형, 바퀴는 굴러가는 원기둥).
Renderer.prototype.emitVehicle = function (key, x, y, z, yaw, wheelAngle, light, showWheels) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const rot = function (lx, ly, lz, out) {
    out[0] = lx * cy + lz * sy; out[1] = ly; out[2] = -lx * sy + lz * cy;
  };
  this.emitMesh(carMesh(key), x, y, z, rot, 1, light, CAR_MESH_OPTS);
  if (showWheels === false) return;

  const w = CAR_WHEELS[key] || CAR_WHEELS.sedan;
  const ca = Math.cos(wheelAngle), sa = Math.sin(wheelAngle);
  const wm = wheelMesh();
  for (let si = 0; si < 2; si++) {
    const sx = si ? 1 : -1;
    for (let zi = 0; zi < w.z.length; zi++) {
      const bx = sx * w.x, bz = w.z[zi];
      // 크기 → 굴림 → 차 안 자리 → 차 방향
      const wrot = function (lx, ly, lz, out) {
        const px = lx * w.w, py = ly * w.r, pz = lz * w.r;
        const y2 = py * ca - pz * sa, z2 = py * sa + pz * ca;
        rot(px + bx, y2 + w.r, z2 + bz, out);
      };
      // 법선은 자리 옮김 없이 굴림과 차 방향만 먹인다
      const nrot = function (lx, ly, lz, out) {
        const y2 = ly * ca - lz * sa, z2 = ly * sa + lz * ca;
        rot(lx, y2, z2, out);
      };
      this.emitMesh(wm, x, y, z, wrot, 1, light, { nxf: nrot });
    }
  }
};

Renderer.prototype.drawCars = function (mgr, world, player, opts) {
  const list = mgr.cars;
  if (!list || !list.length) return;
  _geom.reset();

  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const dx = c.x - player.x, dz = c.z - player.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 380 * 380) continue;
    const L = c.type.len;
    if (!this.boxInFrustum(c.x - L, c.y - 1, c.z - L, c.x + L, c.y + 4, c.z + L)) continue;

    const bx = Math.floor(c.x), by = Math.floor(c.y), bz = Math.floor(c.z);
    const sky = world.getSky(bx, Math.min(CHUNK_Y - 1, by + 1), bz) / 15;
    const blk = world.getBlockLight(bx, Math.min(CHUNK_Y - 1, by), bz) / 15;
    const light = [Math.max(sky, 0.3), Math.max(blk, 0.25)];

    // 멀리 있는 차는 바퀴를 그리지 않는다
    this.emitVehicle(c.type.key, c.x, c.y, c.z, c.yaw, c.wheelAngle, light, d2 < 110 * 110);
  }

  this.flushEntityGeom(opts);
};


// ── 신호등 ────────────────────────────────────────────────────────────
// 켜진 등만 스스로 빛나게 한다 (블록을 바꾸지 않고 색이 바뀐다)
const SIG_GLOW = [
  { glow: { sig_red: 1 } },
  { glow: { sig_amber: 1 } },
  { glow: { sig_green: 1 } }
];
// 네 모서리 기둥에 하나씩 — [기둥 x부호, z부호, 머리 방향, 어느 축 신호]
const SIG_HEADS = [
  [-1, -1, -Math.PI / 2, 'ew'],   // +X 로 오는 차가 본다
  [1, 1, Math.PI / 2, 'ew'],      // -X 로 오는 차
  [1, -1, Math.PI, 'ns'],         // +Z 로 오는 차
  [-1, 1, 0, 'ns']                // -Z 로 오는 차
];

Renderer.prototype.drawSignals = function (game, world, player, opts) {
  if (!world.cities) return;
  const list = world.cities();
  if (!list.length) return;
  const t = game.signalTime();
  const off = ROAD_HALF + 2;
  let any = false;
  _geom.reset();
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c.signals || !c.signals.length) continue;
    if (Math.abs(c.x - player.x) > CITY_R + 80 || Math.abs(c.z - player.z) > CITY_R + 80) continue;
    for (let k = 0; k < c.signals.length; k++) {
      const sig = c.signals[k];
      const dx = sig.x - player.x, dz = sig.z - player.z;
      if (dx * dx + dz * dz > 170 * 170) continue;
      if (!this.boxInFrustum(sig.x - 9, sig.y, sig.z - 9, sig.x + 9, sig.y + 7, sig.z + 9)) continue;
      const bx = Math.floor(sig.x), bz = Math.floor(sig.z);
      const sky = world.getSky(bx, Math.min(CHUNK_Y - 1, sig.y + 6), bz) / 15;
      const light = [Math.max(sky, 0.3), 0.3];
      const ph = signalPhase(sig, t);
      for (let h = 0; h < SIG_HEADS.length; h++) {
        const hd = SIG_HEADS[h];
        const cy = Math.cos(hd[2]), sy = Math.sin(hd[2]);
        const rot = function (lx, ly, lz, out) {
          out[0] = lx * cy + lz * sy; out[1] = ly; out[2] = -lx * sy + lz * cy;
        };
        const state = (hd[3] === 'ew') ? ph.ew : ph.ns;
        this.emitMesh(signalMesh(),
          sig.x + hd[0] * off + 0.5, sig.y + SIGNAL_HEAD_Y, sig.z + hd[1] * off + 0.5,
          rot, 1, light, SIG_GLOW[state]);
        any = true;
      }
    }
  }
  if (any) this.flushEntityGeom(opts);
};

// ── 포크레인 ──────────────────────────────────────────────────────────
// 궤도(하부) 위에 상부가 얹히고, 붐 → 암 → 버킷이 이어 붙는다.
Renderer.prototype.drawDiggers = function (game, world, player, opts) {
  const map = game.diggers;
  if (!map || !map.size) return;
  _geom.reset();
  const self = this;
  map.forEach(function (ex) {
    const dx = ex.x - player.x, dz = ex.z - player.z;
    if (dx * dx + dz * dz > 200 * 200) return;
    if (!self.boxInFrustum(ex.x - 14, ex.y - 2, ex.z - 14, ex.x + 14, ex.y + 14, ex.z + 14)) return;
    const bx = Math.floor(ex.x), by = Math.floor(ex.y), bz = Math.floor(ex.z);
    const sky = world.getSky(bx, Math.min(CHUNK_Y - 1, by + 1), bz) / 15;
    const blk = world.getBlockLight(bx, Math.min(CHUNK_Y - 1, by), bz) / 15;
    const light = [Math.max(sky, 0.32), Math.max(blk, 0.25)];

    // 하부 궤도 — 몸통 방향
    const cy0 = Math.cos(ex.yaw), sy0 = Math.sin(ex.yaw);
    const flat = function (ox, oy, oz) {
      return function (px, py, pz, out) {
        const lx = px + ox, ly = py + oy, lz = pz + oz;
        out[0] = lx * cy0 + lz * sy0; out[1] = ly; out[2] = -lx * sy0 + lz * cy0;
      };
    };
    for (const s of [-1, 1]) {
      emitBox(_geom, ex.x, ex.y, ex.z, 0.9, EX_TRACK_H, EX_TRACK_L,
        'ex_track', null, flat(s * (EX_TRACK_W / 2 - 0.45), 0, 0), light);
    }
    emitBox(_geom, ex.x, ex.y, ex.z, EX_TRACK_W - 0.6, 0.35, EX_TRACK_L - 1.2,
      'ex_track', null, flat(0, EX_TRACK_H - 0.2, 0), light);

    // 상부 — 회전한다
    const a = ex.yaw + ex.swing;
    const cy = Math.cos(a), sy = Math.sin(a);
    const up = function (of, ou, oside) {
      return function (px, py, pz, out) {
        // px 는 좌우, py 는 위아래, pz 는 앞뒤
        const lx = px + (oside || 0), ly = py + ou, lz = pz + of;
        out[0] = lx * cy + lz * sy; out[1] = ly; out[2] = -lx * sy + lz * cy;
      };
    };
    const base = EX_TRACK_H;
    emitBox(_geom, ex.x, ex.y, ex.z, 2.6, 0.4, 3.4, 'ex_body', null, up(-0.2, base, 0), light);
    emitBox(_geom, ex.x, ex.y, ex.z, 1.7, EX_CAB_H, 1.9, 'ex_body', 'ex_glass',
      up(0.5, base + 0.4, -0.55), light);
    emitBox(_geom, ex.x, ex.y, ex.z, 1.5, 1.2, 1.5, 'ex_body', null,
      up(-1.5, base + 0.4, 0.3), light);   // 뒤 균형추

    // 팔 — 각 마디를 통째 상자 하나로 그린다
    const jt = ex.joints();
    const arms = jt.arms;
    const texes = ['ex_boom', 'ex_boom', 'ex_bucket'];
    const thick = [0.55, 0.45, 0.9];
    for (let k = 0; k < arms.length; k++) {
      const seg = arms[k];
      const ca2 = Math.cos(seg.ang), sa2 = Math.sin(seg.ang);
      const tf = function (px, py, pz, out) {
        // pz 를 마디 길이 방향으로 쓴다
        const lf = seg.f + (pz + seg.len / 2) * ca2 - py * sa2;
        const lu = seg.u + (pz + seg.len / 2) * sa2 + py * ca2;
        const lx = px;
        out[0] = lx * cy + lf * sy; out[1] = lu; out[2] = -lx * sy + lf * cy;
      };
      emitBox(_geom, ex.x, ex.y, ex.z, thick[k], thick[k], seg.len, texes[k], null, tf, light);
    }
    // 버킷에 담긴 흙
    if (ex.loaded) {
      const t = ex.tipPos();
      emitBox(_geom, t[0], t[1] - 0.1, t[2], 0.9, 0.5, 0.9, 'ex_dirt', null,
        function (px, py, pz, out) { out[0] = px; out[1] = py - 0.25; out[2] = pz; }, light);
    }

    // 바로 옆에 세워 둔 덤프트럭 — 짐칸에 흙이 쌓인다
    self.emitSiteTruck(ex.truck, light);
  });
  this.flushEntityGeom(opts);
};

// 공사장 덤프트럭 하나를 _geom 에 얹는다 (drawDiggers 가 한꺼번에 flush 한다)
Renderer.prototype.emitSiteTruck = function (tr, light) {
  if (!tr) return;
  this.emitVehicle('dump', tr.x, tr.y, tr.z, tr.yaw, 0, light, true);
  // 짐칸에 실린 흙 — 부을 때마다 높아진다
  const fill = Math.min(EX_LOADS_TO_FILL, tr.fill || 0);
  if (fill > 0) {
    const h = 0.18 + (fill / EX_LOADS_TO_FILL) * 1.25;
    const cy = Math.cos(tr.yaw), sy = Math.sin(tr.yaw);
    const dt2 = function (px, py, pz, out) {
      const lx = px, ly = py + 1.2 + h / 2, lz = pz - 1.9;
      out[0] = lx * cy + lz * sy; out[1] = ly; out[2] = -lx * sy + lz * cy;
    };
    emitBox(_geom, tr.x, tr.y, tr.z, 2.2, h, 5.5, 'ex_dirt', null, dt2, light);
  }
};


// 쫓아오는 순찰차 — 실제 Car 가 아니라 게임이 들고 있는 간단한 표적이다
Renderer.prototype.drawChase = function (game, world, player, opts) {
  const ch = game.chase;
  if (!ch) return;
  _geom.reset();
  // 경광등이 번갈아 번쩍인다
  const flash = (Math.floor(ch.siren * 6) % 2) === 0;
  const light = flash ? [1, 1] : [1, 0.5];
  this.emitVehicle('police', ch.x, ch.y, ch.z, ch.yaw, ch.siren * 9, light, true);
  this.flushEntityGeom(opts);
};


// ── 낙하산 ────────────────────────────────────────────────────────────
// 1인칭이라 플레이어는 안 보이지만, 위를 보면 머리 위 캐노피가 보인다.
const CHUTE_BOXES = [
  { x: 0, y: 4.6, z: 0, w: 3.2, h: 0.5, d: 3.2, tex: 'chute_b' },
  { x: -2.2, y: 4.3, z: 0, w: 1.6, h: 0.5, d: 2.6, tex: 'chute_a' },
  { x: 2.2, y: 4.3, z: 0, w: 1.6, h: 0.5, d: 2.6, tex: 'chute_a' },
  { x: 0, y: 4.3, z: -2.2, w: 2.6, h: 0.5, d: 1.6, tex: 'chute_a' },
  { x: 0, y: 4.3, z: 2.2, w: 2.6, h: 0.5, d: 1.6, tex: 'chute_a' },
  { x: -1.6, y: 3.9, z: -1.6, w: 1.2, h: 0.4, d: 1.2, tex: 'chute_b' },
  { x: 1.6, y: 3.9, z: -1.6, w: 1.2, h: 0.4, d: 1.2, tex: 'chute_b' },
  { x: -1.6, y: 3.9, z: 1.6, w: 1.2, h: 0.4, d: 1.2, tex: 'chute_b' },
  { x: 1.6, y: 3.9, z: 1.6, w: 1.2, h: 0.4, d: 1.2, tex: 'chute_b' },
  // 줄
  { x: -1.3, y: 2.6, z: -1.3, w: 0.12, h: 2.6, d: 0.12, tex: 'chute_line' },
  { x: 1.3, y: 2.6, z: -1.3, w: 0.12, h: 2.6, d: 0.12, tex: 'chute_line' },
  { x: -1.3, y: 2.6, z: 1.3, w: 0.12, h: 2.6, d: 0.12, tex: 'chute_line' },
  { x: 1.3, y: 2.6, z: 1.3, w: 0.12, h: 2.6, d: 0.12, tex: 'chute_line' }
];

Renderer.prototype.drawParachute = function (player, world, opts) {
  if (!player.parachute) return;
  const gl = this.gl;
  _geom.reset();
  const bx = Math.floor(player.x), by = Math.min(CHUNK_Y - 1, Math.floor(player.y + 4));
  const bz = Math.floor(player.z);
  const light = [Math.max(0.8, world.getSky(bx, by, bz) / 15), world.getBlockLight(bx, by, bz) / 15];
  // 바람에 살짝 흔들린다
  const sway = Math.sin(opts.time * 1.6) * 0.10;
  const cs = Math.cos(sway), ss = Math.sin(sway);

  for (let i = 0; i < CHUTE_BOXES.length; i++) {
    const b = CHUTE_BOXES[i];
    const bh = b.h;
    const transform = function (px, py, pz, out) {
      const lx = px + b.x, ly = py - bh / 2 + b.y, lz = pz + b.z;
      out[0] = lx * cs - ly * ss * 0.2; out[1] = ly * cs; out[2] = lz + lx * ss * 0.15;
    };
    emitBox(_geom, player.x, player.y, player.z, b.w, bh, b.d, b.tex, null, transform, light);
  }

  this.flushEntityGeom(opts, false);
};

// 떨어진 아이템: 카메라를 향하는 얇은 판
// ── 떨어진 아이템 (3D) ────────────────────────────────────────────────
// 블록은 진짜 정육면체로, 도구·재료는 아이콘을 밀어낸 두께 있는 판으로
// 그린다. Y축으로 천천히 돌면서 위아래로 살짝 떠오른다 (원작과 동일).
const ITEM_SPIN = 1.1;        // 초당 회전(라디안)
const ITEM_FLAT_SIZE = 0.44;  // 납작 아이템 크기
const ITEM_CUBE_SIZE = 0.32;  // 블록 아이템 한 변
const ITEM_DRAW_LIMIT = 160;  // 한 프레임에 그릴 최대 개수
const ITEM_LOD_STACK = 12 * 12;   // 이 거리 안에서만 개수만큼 겹쳐 그린다
const ITEM_LOD_MESH = 22 * 22;    // 이 거리 밖은 납작한 판 두 장으로 (가벼움)
const ITEM_VERT_BUDGET = 42000;   // 한 프레임 아이템 정점 상한

// 여러 개가 쌓이면 마인크래프트처럼 겹쳐 보이게 한다
function itemStackCount(n) {
  if (n >= 48) return 4;
  if (n >= 32) return 3;
  if (n >= 16) return 2;
  return 1;
}
// 겹칠 때 쓰는 어긋남 (아이템 크기 기준 비율)
const ITEM_STACK_OFF = [
  [0, 0, 0], [0.18, 0.02, 0.12], [-0.16, 0.04, -0.1], [0.06, 0.06, -0.2]
];

const _iv = [], _ii = [];   // 정육면체(블록 아틀라스) 배치용
const _fv = [], _fi = [];   // 납작 아이템(아이콘 아틀라스) 배치용

Renderer.prototype.drawItems = function (mgr, world, player, opts) {
  const gl = this.gl;
  _fv.length = 0; _fi.length = 0;   // 납작 아이템 (아이템 아틀라스)
  _iv.length = 0; _ii.length = 0;   // 블록 아이템 (블록 아틀라스)

  // 멀리 있는 간이 판은 늘 카메라를 바라보게 한다 (옆에서 사라지지 않게)
  const prc = Math.cos(player.yaw), prs = Math.sin(player.yaw);

  let drawn = 0;
  for (let i = 0; i < mgr.items.length && drawn < ITEM_DRAW_LIMIT; i++) {
    const it = mgr.items[i];
    const dx = it.x - player.x, dz = it.z - player.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 110 * 110) continue;
    if (!this.boxInFrustum(it.x - 0.5, it.y - 0.2, it.z - 0.5,
                           it.x + 0.5, it.y + 0.8, it.z + 0.5)) continue;

    const def = itemDef(it.name);
    const bid = def && def.block;
    const isCube = bid && blockDef(bid).render === RENDER_CUBE;
    // 멀리 있는 납작 아이템은 옆면까지 세울 필요가 없다
    const far = !isCube && d2 > ITEM_LOD_MESH;
    const mesh = (isCube || far) ? null : itemMesh(it.name);
    if (!isCube && !far && !mesh) continue;
    drawn++;

    const bob = Math.sin(it.age * 3) * 0.06 + 0.1;
    const ang = it.age * ITEM_SPIN;
    const rc = Math.cos(ang), rs = Math.sin(ang);
    const bx = Math.floor(it.x), by = Math.floor(it.y + 0.2), bz = Math.floor(it.z);
    const sky = world.getSky(bx, by, bz) / 15;
    const blk = world.getBlockLight(bx, by, bz) / 15;
    // 가까이 있을 때만 개수만큼 겹쳐 보여 준다
    let copies = d2 < ITEM_LOD_STACK ? itemStackCount(it.count || 1) : 1;
    // 정점 예산 (16비트 인덱스뿐인 기기에서는 65535를 넘으면 안 된다)
    const cap = this.uintExt ? ITEM_VERT_BUDGET : 60000;
    const need = isCube ? 24 : (far ? 8 : mesh.v.length / 6);
    const used = _fv.length / 8 + _iv.length / 8;
    if (used + need * copies > cap) {
      copies = 1;
      if (used + need > cap) break;
    }

    for (let c = 0; c < copies; c++) {
      const off = ITEM_STACK_OFF[c];
      if (isCube) this.emitItemCube(_iv, _ii, it, bid, off, rc, rs, bob, sky, blk);
      else if (far) this.emitItemFlat(_fv, _fi, it, off, prc, prs, bob, sky, blk);
      else this.emitItemMesh(_fv, _fi, mesh, it, off, rc, rs, bob, sky, blk);
    }
  }

  if (!_fi.length && !_ii.length) return;

  const p = this.setupTerrainProgram(opts);
  mat4.identity(this.model);
  gl.uniformMatrix4fv(p.u.uModel, false, this.model);
  gl.uniform1f(p.u.uAlphaCut, 0.5);

  // 1) 블록 아이템 — 블록 아틀라스 그대로
  if (_ii.length) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.entityBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(_iv), gl.DYNAMIC_DRAW);
    this.bindTerrainAttribs(this.entityBuf);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.entityIdxBuf);
    const ia = this.uintExt ? new Uint32Array(_ii) : new Uint16Array(_ii);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ia, gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, ia.length, this.uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  }

  // 2) 납작 아이템 — 아이콘 아틀라스
  if (_fi.length) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.itemTex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.itemBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(_fv), gl.DYNAMIC_DRAW);
    this.bindTerrainAttribs(this.itemBuf);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.itemIdxBuf);
    const fa = this.uintExt ? new Uint32Array(_fi) : new Uint16Array(_fi);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, fa, gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, fa.length, this.uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
  }
};

// 블록 아이템 → 작은 정육면체 (6면 각각 제 텍스처를 쓴다)
Renderer.prototype.emitItemCube = function (v, ind, it, bid, off, rc, rs, bob, sky, blk) {
  const s = ITEM_CUBE_SIZE;
  const cx = it.x + off[0] * s, cz = it.z + off[2] * s;
  const cy = it.y + bob + off[1] * s + s * 0.5;

  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    const t = texUV(blockTexName(bid, f));
    const shade = FACE_SHADE[f];
    const base = v.length / 8;
    for (let ci = 0; ci < 4; ci++) {
      const tu = (ci === 1 || ci === 2) ? 1 : 0;
      const tv = (ci === 2 || ci === 3) ? 1 : 0;
      const lx = (face.origin[0] + face.u[0] * tu + face.v[0] * tv - 0.5) * s;
      const ly = (face.origin[1] + face.u[1] * tu + face.v[1] * tv - 0.5) * s;
      const lz = (face.origin[2] + face.u[2] * tu + face.v[2] * tv - 0.5) * s;
      const uvp = face.uv(tu, tv);
      v.push(
        cx + lx * rc + lz * rs, cy + ly, cz - lx * rs + lz * rc,
        t.u0 + (t.u1 - t.u0) * uvp[0],
        t.v0 + (t.v1 - t.v0) * uvp[1],
        sky, blk, shade);
    }
    ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
};

// 도구·재료 → 아이콘을 밀어낸 입체 판
Renderer.prototype.emitItemMesh = function (v, ind, mesh, it, off, rc, rs, bob, sky, blk) {
  const s = ITEM_FLAT_SIZE;
  const cx = it.x + off[0] * s, cz = it.z + off[2] * s;
  const cy = it.y + bob + off[1] * s + s * 0.5;

  const src = mesh.v, base = v.length / 8;
  for (let i = 0; i < src.length; i += 6) {
    const lx = src[i] * s, ly = src[i + 1] * s, lz = src[i + 2] * s;
    v.push(
      cx + lx * rc + lz * rs, cy + ly, cz - lx * rs + lz * rc,
      src[i + 3], src[i + 4], sky, blk, src[i + 5]);
  }
  const si = mesh.idx;
  for (let i = 0; i < si.length; i++) ind.push(base + si[i]);
};

// 먼 거리용 — 앞뒤 두 장짜리 간이 판 (옆에서 봐도 사라지지 않게 양면)
Renderer.prototype.emitItemFlat = function (v, ind, it, off, rc, rs, bob, sky, blk) {
  const t = itemUV(it.name);
  if (!t) return;
  const s = ITEM_FLAT_SIZE;
  const cx = it.x + off[0] * s, cz = it.z + off[2] * s;
  const cy = it.y + bob + off[1] * s;
  const corners = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]];

  for (let side = 0; side < 2; side++) {
    const base = v.length / 8;
    for (let n = 0; n < 4; n++) {
      const c = corners[side === 0 ? n : 3 - n];
      const lx = c[0] * s;
      v.push(
        cx + lx * rc, cy + c[1] * s, cz - lx * rs,
        c[0] < 0 ? t.u0 : t.u1, c[1] > 0 ? t.v0 : t.v1,
        sky, blk, side === 0 ? 1 : 0.88);
    }
    ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
};

// 떨어지는 블록과 점화된 TNT (블록 텍스처를 쓴 정육면체)
Renderer.prototype.drawBlockEntities = function (mgr, world, player, opts) {
  const gl = this.gl;
  const falling = mgr.falling || [];
  const tnts = mgr.tnt || [];
  if (!falling.length && !tnts.length) return;

  _geom.reset();

  const list = [];
  for (let i = 0; i < falling.length; i++) {
    list.push({ x: falling[i].x, y: falling[i].y, z: falling[i].z, id: falling[i].blockId, flash: 0 });
  }
  for (let i = 0; i < tnts.length; i++) {
    const t = tnts[i];
    // 도화선이 짧아질수록 빠르게 번쩍인다
    const rate = t.fuse < 1 ? 16 : (t.fuse < 2 ? 8 : 4);
    list.push({ x: t.x, y: t.y, z: t.z, id: B.tnt, flash: (Math.floor(t.age * rate) % 2) });
  }

  for (let n = 0; n < list.length; n++) {
    const e = list[n];
    const dx = e.x - player.x, dz = e.z - player.z;
    if (dx * dx + dz * dz > 150 * 150) continue;
    if (!this.boxInFrustum(e.x - 0.6, e.y - 0.1, e.z - 0.6, e.x + 0.6, e.y + 1.1, e.z + 0.6)) continue;

    const bx = Math.floor(e.x), by = Math.floor(e.y + 0.5), bz = Math.floor(e.z);
    const sky = world.getSky(bx, by, bz) / 15;
    const blk = e.flash ? 1 : world.getBlockLight(bx, by, bz) / 15;

    emitUnitCube(_geom, e.x, e.y, e.z, e.id, sky, blk, e.flash);
  }

  this.flushEntityGeom(opts, false);
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
