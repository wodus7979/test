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
  invert: function (o, m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1.0 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
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
  'uniform mat4 uInvVP;',      // 화면 좌표 -> 월드 방향
  'uniform vec3 uCamPos;',
  'uniform vec3 uSunDir;',
  'uniform vec3 uSunColor;',
  'uniform float uNight;',     // 0 낮 ~ 1 밤
  'uniform float uSunset;',    // 해가 지평선에 가까울수록 1
  'uniform float uUnder;',     // 물속이면 1 (해·별을 감춘다)
  'uniform float uHigh;',      // 0 지상 ~ 1 성층권 (구름 위)
  'uniform float uSpace;',     // 0 대기권 ~ 1 우주 (하늘이 새까매진다)
  'uniform float uAurora;',    // 오로라 세기
  'uniform float uTime;',
  'varying vec2 vPos;',
  'float hash13(vec3 p) {',
  '  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));',
  '  p *= 17.0;',
  '  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));',
  '}',
  // 부드러운 3차원 잡음 — 천체 표면 무늬에 쓴다
  'float vnoise(vec3 p) {',
  '  vec3 i = floor(p), f = fract(p);',
  '  f = f * f * (3.0 - 2.0 * f);',
  '  float a = mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), f.x);',
  '  float b = mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x);',
  '  float c = mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x);',
  '  float d = mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x);',
  '  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);',
  '}',
  // 우주에서 보이는 천체 하나. rgb 는 색, a 는 화면을 덮는 정도.
  // ang = 각반지름, freq = 무늬 결의 촘촘함, night = 그림자 지는 정도.
  'vec4 orb(vec3 dir, vec3 bd, float ang, vec3 c1, vec3 c2, float freq, float night) {',
  '  float d = dot(dir, bd);',
  '  float cr = cos(ang);',
  '  if (d < cr) return vec4(0.0);',
  '  vec3 up = abs(bd.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);',
  '  vec3 tx = normalize(cross(up, bd));',
  '  vec3 ty = cross(bd, tx);',
  '  float sr = max(sin(ang), 0.0001);',
  '  float u = dot(dir, tx) / sr, v = dot(dir, ty) / sr;',
  '  float rr = clamp(u * u + v * v, 0.0, 1.0);',
  '  vec3 n = normalize(tx * u + ty * v + bd * sqrt(max(0.0, 1.0 - rr)));',
  '  float m = vnoise(n * freq) * 0.62 + vnoise(n * freq * 2.3) * 0.38;',
  '  vec3 col = mix(c1, c2, smoothstep(0.40, 0.60, m));',
  // 해가 비치는 쪽만 밝다 (초승달처럼 그늘이 진다)
  '  float lam = clamp(dot(n, uSunDir) * 1.25 + 0.30, 0.0, 1.0);',
  '  col *= mix(1.0, 0.10 + 0.90 * lam, night);',
  '  float a = 1.0 - smoothstep(0.960, 1.0, rr);',
  '  return vec4(col, a);',
  '}',
  'void main() {',
  '  vec4 far = uInvVP * vec4(vPos, 1.0, 1.0);',
  '  vec3 dir = normalize(far.xyz / far.w - uCamPos);',
  '  float t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);',
  '  vec3 col = mix(uBottom, uTop, pow(t, 0.8));',
  // 높이 올라갈수록 하늘이 검푸르게 깊어진다 (성층권)
  '  if (uHigh > 0.001) {',
  '    vec3 deep = vec3(0.015, 0.025, 0.075) + uTop * 0.10;',
  '    col = mix(col, deep, uHigh * clamp(dir.y * 1.6 + 0.35, 0.0, 1.0));',
  '  }',
  // 우주 — 하늘이 새까매지고 지평선에만 파란 대기 띠가 남는다
  '  if (uSpace > 0.001) {',
  '    float rim = pow(1.0 - clamp(abs(dir.y) * 3.2, 0.0, 1.0), 2.2);',
  '    vec3 air = vec3(0.10, 0.34, 0.72) * rim * (1.0 - uNight * 0.6);',
  '    col = mix(col, vec3(0.004, 0.006, 0.014) + air, uSpace);',
  '  }',
  '  if (uUnder < 0.5) {',
  // 지평선 노을
  '    float horiz = pow(1.0 - clamp(abs(dir.y) * 2.4, 0.0, 1.0), 3.0);',
  '    float toSun = max(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);',
  '    col += uSunColor * horiz * pow(toSun, 3.0) * uSunset * 0.85;',
  // 별
  '    float starLit = max(max(uNight, uHigh), uSpace * 1.6);',
  '    if (starLit > 0.01) {',
  '      vec3 sp = floor(dir * 230.0);',
  '      float h = hash13(sp);',
  '      float lo = mix(0.9975, 0.9955, uSpace);',
  '      float star = smoothstep(lo, 0.9995, h) * clamp(dir.y * 2.0 + uSpace * 1.6, 0.0, 1.0);',
  '      col += vec3(0.85, 0.9, 1.0) * star * starLit * (1.4 + uSpace * 0.8);',
  '    }',
  // 우주에 다다르면 지구·달·화성이 뜬다
  '    if (uSpace > 0.02) {',
  '      vec4 e = orb(dir, normalize(vec3(-0.62, 0.20, 0.76)), 0.40,',
  '                   vec3(0.06, 0.26, 0.60), vec3(0.18, 0.44, 0.20), 3.2, 1.0);',
  '      vec4 cl = orb(dir, normalize(vec3(-0.62, 0.20, 0.76)), 0.40,',
  '                   vec3(0.0), vec3(1.0, 1.0, 1.0), 6.5, 1.0);',
  '      e.rgb = mix(e.rgb, cl.rgb, cl.a * 0.55);',
  '      vec4 mo = orb(dir, normalize(vec3(0.74, 0.42, -0.53)), 0.085,',
  '                    vec3(0.72, 0.72, 0.76), vec3(0.40, 0.40, 0.45), 5.0, 1.0);',
  '      vec4 ma = orb(dir, normalize(vec3(0.30, 0.56, 0.77)), 0.042,',
  '                    vec3(0.76, 0.36, 0.18), vec3(0.50, 0.22, 0.12), 6.0, 1.0);',
  '      col = mix(col, e.rgb, e.a * uSpace);',
  '      col = mix(col, mo.rgb, mo.a * uSpace);',
  '      col = mix(col, ma.rgb, ma.a * uSpace);',
  '    }',
  // 오로라 — 하늘 위쪽에서 물결치는 초록·보라 커튼
  '    if (uAurora > 0.01 && dir.y > 0.04) {',
  '      float u = atan(dir.z, dir.x);',
  '      float a = 0.0;',
  '      for (int k = 0; k < 3; k++) {',
  '        float fk = float(k);',
  '        float w = sin(u * (2.0 + fk) + uTime * (0.13 + fk * 0.05)) * 0.13',
  '                + sin(u * (6.0 + fk * 2.0) - uTime * 0.09) * 0.05;',
  '        float band = exp(-pow((dir.y - (0.40 + fk * 0.16) - w) * 7.0, 2.0));',
  '        float shim = 0.55 + 0.45 * sin(u * (18.0 + fk * 9.0) + uTime * 0.8 + fk);',
  '        a += band * shim * (1.0 - fk * 0.22);',
  '      }',
  '      vec3 acol = mix(vec3(0.20, 0.95, 0.55), vec3(0.55, 0.30, 0.95),',
  '                      0.5 + 0.5 * sin(u * 1.7 + uTime * 0.2));',
  '      col += acol * a * uAurora * 0.48;',
  '    }',
  // 해
  '    float sd = dot(dir, uSunDir);',
  // 우주에서는 대기가 없어 번짐이 걷히고 원반이 또렷해진다
  '    float disc = smoothstep(mix(0.9990, 0.99955, uSpace), mix(0.99955, 0.99975, uSpace), sd);',
  '    float glow = (pow(max(sd, 0.0), 260.0) * 0.55 + pow(max(sd, 0.0), 9.0) * 0.09)',
  '               * (1.0 - uSpace * 0.75);',
  '    col += uSunColor * (disc * (1.6 + uSpace * 1.4) + glow);',
  // 달
  '    float md = dot(dir, -uSunDir);',
  '    float mdisc = smoothstep(0.9980, 0.9990, md);',
  '    col += vec3(0.88, 0.90, 1.0) * (mdisc * 1.25 + pow(max(md, 0.0), 300.0) * 0.35) * uNight;',
  '  }',
  '  gl_FragColor = vec4(col, 1.0);',
  '}'
].join('\n');

// ── 구름 ──────────────────────────────────────────────────────────────
// 원작처럼 하늘 높이 떠 있는 납작한 덩어리. 멀어질수록 하늘색으로 사라진다.
const CLOUD_VS = [
  'precision highp float;',
  'attribute vec3 aPos;',
  'attribute float aShade;',
  'uniform mat4 uProj; uniform mat4 uView; uniform mat4 uModel;',
  'uniform vec3 uCam;',
  'uniform float uNear; uniform float uFar;',
  'varying float vShade;',
  'varying float vFade;',
  'void main() {',
  '  vec4 w = uModel * vec4(aPos, 1.0);',
  '  vShade = aShade;',
  '  float d = length(w.xz - uCam.xz);',
  '  vFade = 1.0 - clamp((d - uNear) / max(1.0, uFar - uNear), 0.0, 1.0);',
  '  gl_Position = uProj * uView * w;',
  '}'
].join('\n');

const CLOUD_FS = [
  'precision highp float;',
  'uniform vec3 uColor;',
  'uniform float uAlpha;',
  'varying float vShade;',
  'varying float vFade;',
  'void main() {',
  '  float a = uAlpha * vFade;',
  '  if (a < 0.012) discard;',
  '  gl_FragColor = vec4(uColor * vShade, a);',
  '}'
].join('\n');

// ── 비·눈 ─────────────────────────────────────────────────────────────
// 입자 위치는 전부 셰이더에서 계산한다 (정점 버퍼는 한 번만 만들고 고정).
// aSeed = (x오프셋, z오프셋, 위상)
const WEATHER_VS = [
  'precision highp float;',
  'attribute vec2 aCorner;',
  'attribute vec3 aSeed;',
  'uniform mat4 uProj; uniform mat4 uView;',
  'uniform vec3 uOrigin; uniform vec3 uRight; uniform vec3 uUp;',
  'uniform float uTime; uniform float uFall; uniform float uSize;',
  'uniform float uStretch; uniform float uSway; uniform float uSpan;',
  'uniform float uRadius;',
  'varying float vFade;',
  'varying vec2 vC;',
  'void main() {',
  '  float y = uOrigin.y + uSpan * 0.6 - mod(uTime * uFall + aSeed.z * uSpan * 3.0, uSpan);',
  '  vec3 base = vec3(uOrigin.x + aSeed.x, y, uOrigin.z + aSeed.y);',
  '  if (uSway > 0.0) {',
  '    base.x += sin(uTime * 1.4 + aSeed.z * 29.0) * uSway;',
  '    base.z += cos(uTime * 1.1 + aSeed.z * 23.0) * uSway;',
  '  }',
  '  vec3 p = base + uRight * (aCorner.x * uSize) + uUp * (aCorner.y * uSize * uStretch);',
  '  float d = length(vec2(aSeed.x, aSeed.y));',
  '  vFade = 1.0 - smoothstep(uRadius * 0.55, uRadius, d);',
  '  vC = aCorner;',
  '  gl_Position = uProj * uView * vec4(p, 1.0);',
  '}'
].join('\n');

const WEATHER_FS = [
  'precision highp float;',
  'uniform vec3 uColor;',
  'uniform float uAlpha;',
  'uniform float uRound;',
  'varying float vFade;',
  'varying vec2 vC;',
  'void main() {',
  '  if (uRound > 0.5 && dot(vC, vC) > 0.25) discard;',   // 눈송이는 동그랗게
  '  float a = uAlpha * vFade;',
  '  if (a < 0.02) discard;',
  '  gl_FragColor = vec4(uColor, a);',
  '}'
].join('\n');

// ── 불꽃·연기 알갱이 ──────────────────────────────────────────────────
// 언제나 카메라를 마주 보는 작은 네모. 자리·크기·색은 매 프레임 올린다.
const PARTICLE_VS = [
  'precision highp float;',
  'attribute vec2 aCorner;',      // -0.5 ~ 0.5
  'attribute vec3 aPos;',         // 알갱이 가운데 (세계 좌표)
  'attribute vec3 aColor;',
  'attribute vec2 aParam;',       // (지름, 진하기)
  'uniform mat4 uProj; uniform mat4 uView;',
  'uniform vec3 uRight; uniform vec3 uUp;',
  'varying vec3 vColor;',
  'varying float vAlpha;',
  'varying vec2 vC;',
  'void main() {',
  '  vec3 p = aPos + uRight * (aCorner.x * aParam.x) + uUp * (aCorner.y * aParam.x);',
  '  vColor = aColor;',
  '  vAlpha = aParam.y;',
  '  vC = aCorner;',
  '  gl_Position = uProj * uView * vec4(p, 1.0);',
  '}'
].join('\n');

const PARTICLE_FS = [
  'precision highp float;',
  'uniform float uSoft;',         // 가장자리가 흐려지기 시작하는 곳
  'varying vec3 vColor;',
  'varying float vAlpha;',
  'varying vec2 vC;',
  'void main() {',
  '  float d = length(vC) * 2.0;',           // 0 가운데 · 1 가장자리
  '  if (d > 1.0) discard;',                 // 동그랗게 자른다
  '  float a = vAlpha * (1.0 - smoothstep(uSoft, 1.0, d));',
  '  if (a < 0.008) discard;',
  '  gl_FragColor = vec4(vColor, a);',
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

function isPowerOfTwo(v) { return v > 0 && (v & (v - 1)) === 0; }

function makeTextureFromCanvas(gl, canvas) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  // WebGL 1은 2의 거듭제곱 크기에서만 밉맵을 만들 수 있다
  const pot = isPowerOfTwo(canvas.width) && isPowerOfTwo(canvas.height);
  if (pot) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
