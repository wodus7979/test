// postfx.js - 화면 후처리(셰이더). 장면을 텍스처에 한 번 그린 뒤
// 블룸 · 갓레이 · 톤 매핑 · 색 보정 · 비네팅 · 물속 일렁임을 입혀 화면에 낸다.
// 외부 라이브러리 없이 WebGL 1로만 동작하며, 지원이 안 되면 조용히 꺼진다.
'use strict';

// 0 꺼짐 · 1 기본 · 2 높음 · 3 최고
const SHADER_LEVELS = ['꺼짐', '기본', '높음', '최고'];
const SHADER_DEFAULT = 2;

const POST_VS = [
  'precision highp float;',
  'attribute vec2 aPos;',
  'varying vec2 vUV;',
  'void main() { vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }'
].join('\n');

// 밝은 부분만 뽑아낸다 (블룸·갓레이의 재료)
const BRIGHT_FS = [
  'precision highp float;',
  'uniform sampler2D uScene;',
  'uniform float uThreshold;',
  'uniform float uKnee;',
  'varying vec2 vUV;',
  'void main() {',
  '  vec3 c = texture2D(uScene, vUV).rgb;',
  '  float l = max(max(c.r, c.g), c.b);',
  '  float f = clamp((l - uThreshold) / max(0.001, uKnee), 0.0, 1.0);',
  '  gl_FragColor = vec4(c * f * f, 1.0);',
  '}'
].join('\n');

// 가로/세로로 나눠 도는 가우시안 흐리기 (9탭)
const BLUR_FS = [
  'precision highp float;',
  'uniform sampler2D uTex;',
  'uniform vec2 uDir;',      // 픽셀 단위 방향
  'varying vec2 vUV;',
  'void main() {',
  '  vec3 c = texture2D(uTex, vUV).rgb * 0.2270270;',
  '  c += texture2D(uTex, vUV + uDir * 1.3846153).rgb * 0.3162162;',
  '  c += texture2D(uTex, vUV - uDir * 1.3846153).rgb * 0.3162162;',
  '  c += texture2D(uTex, vUV + uDir * 3.2307692).rgb * 0.0702702;',
  '  c += texture2D(uTex, vUV - uDir * 3.2307692).rgb * 0.0702702;',
  '  gl_FragColor = vec4(c, 1.0);',
  '}'
].join('\n');

// 최종 합성
const COMPOSITE_FS = [
  'precision highp float;',
  'uniform sampler2D uScene;',
  'uniform sampler2D uBloom;',
  'uniform float uBloomAmt;',
  'uniform float uRays;',
  'uniform vec2 uSunScreen;',
  'uniform float uExposure;',
  'uniform vec3 uGrade;',
  'uniform float uSat;',
  'uniform float uVignette;',
  'uniform float uUnder;',
  'uniform float uAberr;',
  'uniform float uTime;',
  // ── 애니 외곽선 ──
  'uniform sampler2D uDepth;',
  'uniform float uInk;',        // 0 없음 · 세기
  'uniform vec2 uPix;',
  'uniform vec3 uInkColor;',
  'uniform vec2 uClip;',        // near, far
  'varying vec2 vUV;',
  // 필름 톤 매핑 (ACES 근사)
  'vec3 aces(vec3 x) {',
  '  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);',
  '}',
  'void main() {',
  '  vec2 uv = vUV;',
  '  if (uUnder > 0.001) {',
  '    uv.x += sin(uv.y * 24.0 + uTime * 1.9) * 0.0040 * uUnder;',
  '    uv.y += cos(uv.x * 19.0 + uTime * 1.5) * 0.0040 * uUnder;',
  '    uv = clamp(uv, 0.0, 1.0);',
  '  }',
  '  vec3 col;',
  '  if (uAberr > 0.0) {',
  '    vec2 d = uv - 0.5;',
  '    vec2 off = d * dot(d, d) * uAberr;',
  '    col = vec3(texture2D(uScene, clamp(uv + off, 0.0, 1.0)).r,',
  '               texture2D(uScene, uv).g,',
  '               texture2D(uScene, clamp(uv - off, 0.0, 1.0)).b);',
  '  } else {',
  '    col = texture2D(uScene, uv).rgb;',
  '  }',
  '  if (uBloomAmt > 0.0) col += texture2D(uBloom, uv).rgb * uBloomAmt;',
  '  if (uRays > 0.0) {',
  // 해 방향으로 밝은 부분을 끌어당겨 빛줄기를 만든다
  '    vec2 sstep = (uSunScreen - uv) * (1.0 / 24.0);',
  '    vec2 p = uv;',
  '    float w = 1.0;',
  '    vec3 acc = vec3(0.0);',
  '    for (int i = 0; i < 24; i++) {',
  '      p += sstep;',
  '      acc += texture2D(uBloom, clamp(p, 0.0, 1.0)).rgb * w;',
  '      w *= 0.93;',
  '    }',
  '    col += acc * (uRays / 24.0);',
  '  }',
  '  col *= uExposure * uGrade;',
  '  col = aces(col) * 1.2441;',   // 흰색이 흰색으로 남도록 정규화
  '  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));',
  '  col = mix(vec3(l), col, uSat);',
  // 실루엣 — 깊이가 뚝 끊기는 자리에 선을 긋는다.
  // 복셀 지형은 한 칸짜리 계단이 끝없이 이어져서, 깊이 차를 그대로 쓰면
  // 온 산이 그물이 된다. 그래서 깊이를 실제 거리로 펴고,
  // 멀수록 문턱을 높여 가까운 것에만 선이 남게 한다.
  '  if (uInk > 0.0) {',
  '    float d0 = texture2D(uDepth, vUV).r;',
  '    if (d0 < 0.99999) {',
  '      float n = uClip.x, f = uClip.y;',
  '      float z0 = (2.0 * n * f) / (f + n - (d0 * 2.0 - 1.0) * (f - n));',
  '      float gap = 0.0;',
  '      for (int i = 0; i < 8; i++) {',
  '        float a = float(i) * 0.7853981;',
  '        vec2 o = vec2(cos(a), sin(a)) * 1.5 * uPix;',
  '        float d1 = texture2D(uDepth, clamp(vUV + o, 0.0, 1.0)).r;',
  '        float z1 = (2.0 * n * f) / (f + n - (d1 * 2.0 - 1.0) * (f - n));',
  '        gap = max(gap, abs(z1 - z0));',
  '      }',
  '      float thr = 0.55 + z0 * 0.060;',
  '      float e = smoothstep(thr, thr * 2.2, gap);',
  '      e *= 1.0 - smoothstep(90.0, 200.0, z0);',   // 아주 먼 것은 긋지 않는다
  '      col = mix(col, uInkColor, e * uInk);',
  '    }',
  '  }',
  '  vec2 vd = vUV - 0.5;',
  '  col *= clamp(1.0 - uVignette * dot(vd, vd) * 2.3, 0.0, 1.0);',
  '  gl_FragColor = vec4(col, 1.0);',
  '}'
].join('\n');

// ── 프레임버퍼 ────────────────────────────────────────────────────────
function makeFBO(gl, w, h, withDepth) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

  let rb = null, depthTex = null;
  if (withDepth) {
    // 외곽선을 그으려면 깊이를 읽을 수 있어야 한다.
    // WEBGL_depth_texture 가 있으면 텍스처로, 없으면 예전처럼 렌더버퍼로.
    const ext = gl.getExtension('WEBGL_depth_texture');
    if (ext) {
      depthTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, depthTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, w, h, 0,
        gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
    } else {
      rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    }
  }
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok) {
    gl.deleteTexture(tex); gl.deleteFramebuffer(fb);
    if (rb) gl.deleteRenderbuffer(rb);
    if (depthTex) gl.deleteTexture(depthTex);
    return null;
  }
  return { tex: tex, fb: fb, rb: rb, depth: depthTex, w: w, h: h };
}

function freeFBO(gl, f) {
  if (!f) return;
  gl.deleteTexture(f.tex);
  gl.deleteFramebuffer(f.fb);
  if (f.rb) gl.deleteRenderbuffer(f.rb);
  if (f.depth) gl.deleteTexture(f.depth);
}

// ── 후처리 ────────────────────────────────────────────────────────────
function PostFX(gl) {
  this.gl = gl;
  this.ok = false;
  this.level = SHADER_DEFAULT;
  this.active = false;
  this.w = 0; this.h = 0;
  try {
    this.brightProg = createProgram(gl, POST_VS, BRIGHT_FS, ['aPos']);
    this.blurProg = createProgram(gl, POST_VS, BLUR_FS, ['aPos']);
    this.compProg = createProgram(gl, POST_VS, COMPOSITE_FS, ['aPos']);
    this.quad = makeBuffer(gl, gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]));
    this.ok = true;
  } catch (e) {
    console.warn('후처리 셰이더를 쓸 수 없습니다:', e.message);
    this.ok = false;
  }
  this.scene = null; this.half = null; this.blurA = null; this.blurB = null;
}

PostFX.prototype.setLevel = function (n) {
  this.level = Math.max(0, Math.min(SHADER_LEVELS.length - 1, n | 0));
  if (this.level === 0) this.release();
};

PostFX.prototype.release = function () {
  const gl = this.gl;
  freeFBO(gl, this.scene); freeFBO(gl, this.half);
  freeFBO(gl, this.blurA); freeFBO(gl, this.blurB);
  this.scene = this.half = this.blurA = this.blurB = null;
  this.w = this.h = 0;
};

// 화면 크기가 바뀌면 버퍼를 다시 만든다
PostFX.prototype.ensure = function (w, h) {
  if (!this.ok || this.level === 0) return false;
  if (this.scene && this.w === w && this.h === h) return true;
  this.release();
  const gl = this.gl;
  this.scene = makeFBO(gl, w, h, true);
  if (!this.scene) { this.ok = false; return false; }
  if (this.level >= 2) {
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    this.half = makeFBO(gl, hw, hh, false);
    this.blurA = makeFBO(gl, hw, hh, false);
    this.blurB = makeFBO(gl, hw, hh, false);
    if (!this.half || !this.blurA || !this.blurB) {
      freeFBO(gl, this.half); freeFBO(gl, this.blurA); freeFBO(gl, this.blurB);
      this.half = this.blurA = this.blurB = null;
    }
  }
  this.w = w; this.h = h;
  return true;
};

// 장면을 텍스처에 그리기 시작. 후처리를 못 쓰면 false.
PostFX.prototype.begin = function (w, h) {
  if (!this.ensure(w, h)) { this.active = false; return false; }
  const gl = this.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fb);
  gl.viewport(0, 0, w, h);
  this.active = true;
  return true;
};

PostFX.prototype.drawQuad = function () {
  const gl = this.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
  gl.enableVertexAttribArray(0);
  gl.disableVertexAttribArray(1);
  gl.disableVertexAttribArray(2);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
};

// 후처리를 입혀 화면에 낸다.
PostFX.prototype.end = function (opts) {
  if (!this.active) return;
  const gl = this.gl;
  const lvl = this.level;
  const useBloom = lvl >= 2 && this.half && this.blurA && this.blurB;
  const useRays = lvl >= 3 && useBloom && opts.sunOnScreen;

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);

  if (useBloom) {
    // 1) 밝은 곳 추출 (절반 해상도)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.half.fb);
    gl.viewport(0, 0, this.half.w, this.half.h);
    gl.useProgram(this.brightProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1i(this.brightProg.u.uScene, 0);
    gl.uniform1f(this.brightProg.u.uThreshold, opts.bloomThreshold);
    gl.uniform1f(this.brightProg.u.uKnee, 0.45);
    this.drawQuad();

    // 2) 가로 -> 세로로 흐린다 (레벨 3은 두 번 돌려 더 부드럽게)
    const passes = lvl >= 3 ? 2 : 1;
    let src = this.half;
    for (let i = 0; i < passes; i++) {
      const radius = 1 + i * 2;
      this.blurPass(src, this.blurA, radius / this.half.w, 0);
      this.blurPass(this.blurA, this.blurB, 0, radius / this.half.h);
      src = this.blurB;
    }
  }

  // 3) 합성해서 화면으로
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, this.w, this.h);
  const p = this.compProg;
  gl.useProgram(p);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
  gl.uniform1i(p.u.uScene, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, useBloom ? this.blurB.tex : this.scene.tex);
  gl.uniform1i(p.u.uBloom, 1);

  gl.uniform1f(p.u.uBloomAmt, useBloom ? opts.bloom : 0);
  gl.uniform1f(p.u.uRays, useRays ? opts.rays : 0);
  gl.uniform2f(p.u.uSunScreen, opts.sunX, opts.sunY);
  gl.uniform1f(p.u.uExposure, opts.exposure);
  gl.uniform3fv(p.u.uGrade, opts.grade);
  gl.uniform1f(p.u.uSat, opts.saturation);
  gl.uniform1f(p.u.uVignette, opts.vignette);
  gl.uniform1f(p.u.uUnder, opts.under);
  gl.uniform1f(p.u.uAberr, lvl >= 3 ? (opts.aberration || 0) : 0);
  gl.uniform1f(p.u.uTime, opts.time);
  // 애니 외곽선 — 깊이를 읽을 수 있을 때만 그을 수 있다
  const ink = (opts.ink || 0) && this.scene.depth ? opts.ink : 0;
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, this.scene.depth || this.scene.tex);
  gl.uniform1i(p.u.uDepth, 2);
  gl.uniform1f(p.u.uInk, ink);
  gl.uniform2f(p.u.uPix, 1 / this.w, 1 / this.h);
  gl.uniform3fv(p.u.uInkColor, opts.inkColor || [0.13, 0.14, 0.20]);
  gl.uniform2f(p.u.uClip, opts.near || 0.06, opts.far || 1200);
  this.drawQuad();

  gl.activeTexture(gl.TEXTURE0);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  this.active = false;
};

PostFX.prototype.blurPass = function (src, dst, dx, dy) {
  const gl = this.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
  gl.viewport(0, 0, dst.w, dst.h);
  gl.useProgram(this.blurProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, src.tex);
  gl.uniform1i(this.blurProg.u.uTex, 0);
  gl.uniform2f(this.blurProg.u.uDir, dx, dy);
  this.drawQuad();
};
