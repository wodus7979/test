// glutil.js - 행렬 수학과 WebGL 셰이더/버퍼 유틸리티.
'use strict';

// ── mat4 (열 우선) ────────────────────────────────────────────────────
const mat4 = {
  create: function () {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  },
  identity: function (o) {
    o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
    o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
    return o;
  },
  perspective: function (o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
    o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
    return o;
  },
  ortho: function (o, l, r, b, t, n, f) {
    const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
    o[0] = -2 * lr; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = -2 * bt; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = 2 * nf; o[11] = 0;
    o[12] = (l + r) * lr; o[13] = (t + b) * bt; o[14] = (f + n) * nf; o[15] = 1;
    return o;
  },
  multiply: function (o, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return o;
  },
  translate: function (o, m, v) {
    const x = v[0], y = v[1], z = v[2];
    if (o !== m) for (let i = 0; i < 12; i++) o[i] = m[i];
    o[12] = m[0] * x + m[4] * y + m[8] * z + m[12];
    o[13] = m[1] * x + m[5] * y + m[9] * z + m[13];
    o[14] = m[2] * x + m[6] * y + m[10] * z + m[14];
    o[15] = m[3] * x + m[7] * y + m[11] * z + m[15];
    return o;
  },
  scale: function (o, m, v) {
    for (let i = 0; i < 4; i++) {
      o[i] = m[i] * v[0]; o[4 + i] = m[4 + i] * v[1];
      o[8 + i] = m[8 + i] * v[2]; o[12 + i] = m[12 + i];
    }
    return o;
  },
  rotateX: function (o, m, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    if (o !== m) { for (let i = 0; i < 4; i++) { o[i] = m[i]; o[12 + i] = m[12 + i]; } }
    o[4] = a10 * c + a20 * s; o[5] = a11 * c + a21 * s;
    o[6] = a12 * c + a22 * s; o[7] = a13 * c + a23 * s;
    o[8] = a20 * c - a10 * s; o[9] = a21 * c - a11 * s;
    o[10] = a22 * c - a12 * s; o[11] = a23 * c - a13 * s;
    return o;
  },
  rotateY: function (o, m, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    if (o !== m) { for (let i = 4; i < 8; i++) o[i] = m[i]; for (let i = 12; i < 16; i++) o[i] = m[i]; }
    o[0] = a00 * c - a20 * s; o[1] = a01 * c - a21 * s;
    o[2] = a02 * c - a22 * s; o[3] = a03 * c - a23 * s;
    o[8] = a00 * s + a20 * c; o[9] = a01 * s + a21 * c;
    o[10] = a02 * s + a22 * c; o[11] = a03 * s + a23 * c;
    return o;
  },
  rotateZ: function (o, m, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    if (o !== m) { for (let i = 8; i < 16; i++) o[i] = m[i]; }
    o[0] = a00 * c + a10 * s; o[1] = a01 * c + a11 * s;
    o[2] = a02 * c + a12 * s; o[3] = a03 * c + a13 * s;
    o[4] = a10 * c - a00 * s; o[5] = a11 * c - a01 * s;
    o[6] = a12 * c - a02 * s; o[7] = a13 * c - a03 * s;
    return o;
  }
};

// ── 셰이더 ────────────────────────────────────────────────────────────
function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('셰이더 컴파일 실패: ' + log + '\n' + src);
  }
  return sh;
}

function createProgram(gl, vsSrc, fsSrc, attribs) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  if (attribs) attribs.forEach(function (n, i) { gl.bindAttribLocation(prog, i, n); });
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('셰이더 링크 실패: ' + gl.getProgramInfoLog(prog));
  }
  gl.deleteShader(vs); gl.deleteShader(fs);

  // 유니폼 위치 캐시
  prog.u = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    const name = info.name.replace('[0]', '');
    prog.u[name] = gl.getUniformLocation(prog, name);
  }
  return prog;
}

// ── 셰이더 소스 ───────────────────────────────────────────────────────
// 지형/엔티티 공용. aLight = (하늘빛, 블록빛, 앰비언트오클루전)
const TERRAIN_VS = [
  'precision highp float;',
  'attribute vec3 aPos;',
  'attribute vec2 aUV;',
  'attribute vec3 aLight;',
  'uniform mat4 uProj;',
  'uniform mat4 uView;',
  'uniform mat4 uModel;',
  'uniform float uTime;',
  'uniform float uWave;',
  'varying vec2 vUV;',
  'varying vec3 vLight;',
  'varying float vDist;',
  'void main() {',
  '  vec4 world = uModel * vec4(aPos, 1.0);',
  '  if (uWave > 0.5) {',
  '    world.y += sin(world.x * 0.7 + uTime * 2.0) * 0.045',
  '             + sin(world.z * 0.9 + uTime * 1.7) * 0.045 - 0.09;',
  '  }',
  '  vec4 eye = uView * world;',
  '  vDist = length(eye.xyz);',
  '  vUV = aUV;',
  '  vLight = aLight;',
  '  gl_Position = uProj * eye;',
  '}'
].join('\n');

const TERRAIN_FS = [
  'precision highp float;',
  'uniform sampler2D uTex;',
  'uniform float uDaylight;',
  'uniform vec3 uFogColor;',
  'uniform float uFogStart;',
  'uniform float uFogEnd;',
  'uniform float uAlphaCut;',
  'uniform vec4 uTint;',
  'varying vec2 vUV;',
  'varying vec3 vLight;',
  'varying float vDist;',
  'void main() {',
  '  vec4 tex = texture2D(uTex, vUV);',
  '  if (tex.a < uAlphaCut) discard;',
  '  float sky = vLight.x * uDaylight;',
  '  float blk = vLight.y;',
  '  float lum = max(sky, blk);',
  '  lum = max(lum, 0.055);',
  '  lum *= vLight.z;',            // AO
  '  vec3 col = tex.rgb * uTint.rgb * lum;',
  '  float fog = clamp((vDist - uFogStart) / max(0.001, uFogEnd - uFogStart), 0.0, 1.0);',
  '  col = mix(col, uFogColor, fog);',
  '  gl_FragColor = vec4(col, tex.a * uTint.a);',
  '}'
].join('\n');

// 하늘: 화면 전체 그라디언트 + 해/달
const SKY_VS = [
  'precision highp float;',
  'attribute vec2 aPos;',
  'varying vec2 vPos;',
  'void main() { vPos = aPos; gl_Position = vec4(aPos, 0.999, 1.0); }'
].join('\n');

const SKY_FS = [
  'precision highp float;',
  'uniform vec3 uTop;',
  'uniform vec3 uBottom;',
  'varying vec2 vPos;',
  'void main() {',
  '  float t = clamp(vPos.y * 0.5 + 0.5, 0.0, 1.0);',
  '  gl_FragColor = vec4(mix(uBottom, uTop, pow(t, 0.8)), 1.0);',
  '}'
].join('\n');

// 블록 선택 외곽선
const LINE_VS = [
  'precision highp float;',
  'attribute vec3 aPos;',
  'uniform mat4 uProj; uniform mat4 uView; uniform mat4 uModel;',
  'void main() { gl_Position = uProj * uView * uModel * vec4(aPos, 1.0); }'
].join('\n');

const LINE_FS = [
  'precision highp float;',
  'uniform vec4 uColor;',
  'void main() { gl_FragColor = uColor; }'
].join('\n');

// ── 버퍼 헬퍼 ─────────────────────────────────────────────────────────
function makeBuffer(gl, target, data, usage) {
  const b = gl.createBuffer();
  gl.bindBuffer(target, b);
  gl.bufferData(target, data, usage || gl.STATIC_DRAW);
  return b;
}

function makeTextureFromCanvas(gl, canvas) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
