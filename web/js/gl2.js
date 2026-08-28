// gl2.js - WebGL2 로 옮기기 위한 밑바탕.
//   · GLSL 1.00 로 쓴 셰이더를 3.00 ES 로 그때그때 옮겨 준다 (원본은 하나만 둔다)
//   · 법선을 실수 한 칸에 접어 넣는 옥타헤드럴 압축
//   · 부동소수 렌더 타깃 · 여러 장 그리기(MRT) · 그림자 지도 만들기
// WebGL2 가 없는 기기에서는 이 파일이 하는 일이 전부 꺼지고 예전 길로 간다.
'use strict';

// 화질 단계 이름 (설정과 L 키가 함께 쓴다)
const RENDER_LEVELS = ['예전 방식', '물리 기반 조명', '＋해 그림자', '＋구석 그늘'];

// createProgram 이 이 값을 보고 셰이더를 옮길지 정한다. 렌더러가 켠다.
let GLSL_ES3 = false;
function setGLSL3(on) { GLSL_ES3 = !!on; }

// GLSL 1.00 → 3.00 ES.
//   attribute → in · varying → in/out · texture2D → texture · gl_FragColor → 내보내기 변수
// outs 를 주면 그만큼 색 출력을 만든다 (MRT). 첫 칸이 gl_FragColor 를 대신한다.
function glslES3(src, frag, outs) {
  if (src.indexOf('#version') === 0) return src;
  let s = src;
  s = s.replace(/\battribute\b/g, 'in');
  s = s.replace(/\bvarying\b/g, frag ? 'in' : 'out');
  s = s.replace(/\btexture2DLod\b/g, 'textureLod');
  s = s.replace(/\btexture2D\b/g, 'texture');
  s = s.replace(/\btextureCube\b/g, 'texture');
  if (frag) {
    const list = (outs && outs.length) ? outs : ['oFrag'];
    s = s.replace(/\bgl_FragColor\b/g, list[0]);
    let decl = '';
    for (let i = 0; i < list.length; i++) {
      decl += 'layout(location = ' + i + ') out vec4 ' + list[i] + ';\n';
    }
    // precision 선언 바로 뒤에 넣는다 (없으면 맨 앞)
    if (/precision\s+\w+\s+float\s*;/.test(s)) {
      s = s.replace(/(precision\s+\w+\s+float\s*;)/, function (m) { return m + '\n' + decl; });
    } else {
      s = decl + s;
    }
  }
  return '#version 300 es\n' + s;
}

// ── 법선 접어 넣기 ────────────────────────────────────────────────────
// 팔면체 지도로 법선을 (u, v) 두 값으로 편 뒤 12비트씩 잘라 실수 하나에 담는다.
// 24비트라 float32 가 정확히 담고, 축에 붙은 여섯 방향은 오차 없이 되돌아온다.
// 정점 하나가 4바이트만 늘어난다 (법선 셋을 그냥 넣으면 12바이트).
const NRM_Q = 4094;

function packNormal(nx, ny, nz) {
  const l = Math.abs(nx) + Math.abs(ny) + Math.abs(nz);
  if (l < 1e-9) return 0;
  const px = nx / l, py = ny / l, pz = nz / l;
  let u, v;
  if (py > 0) { u = px; v = pz; } else {
    u = (1 - Math.abs(pz)) * (px >= 0 ? 1 : -1);
    v = (1 - Math.abs(px)) * (pz >= 0 ? 1 : -1);
  }
  const iu = Math.round((u * 0.5 + 0.5) * NRM_Q);
  const iv = Math.round((v * 0.5 + 0.5) * NRM_Q);
  return iu * 4096 + iv;
}

// 셰이더 쪽 되돌리기 — 여러 셰이더가 함께 쓴다
const UNPACK_NORMAL_GLSL = [
  'vec3 unpackNrm(float c) {',
  '  if (c < 0.0) return vec3(0.0, 1.0, 0.0);',
  '  float iv = floor(mod(c, 4096.0));',
  '  float iu = floor(c / 4096.0);',
  '  vec2 e = vec2(iu, iv) / ' + NRM_Q.toFixed(1) + ' * 2.0 - 1.0;',
  '  vec3 n = vec3(e.x, 1.0 - abs(e.x) - abs(e.y), e.y);',
  '  if (n.y < 0.0) {',
  '    n.xz = vec2((1.0 - abs(n.z)) * (n.x >= 0.0 ? 1.0 : -1.0),',
  '                (1.0 - abs(n.x)) * (n.z >= 0.0 ? 1.0 : -1.0));',
  '  }',
  '  return normalize(n);',
  '}'
].join('\n');

// 법선이 없는 것(아이콘을 밀어낸 아이템 판 같은)은 이 값을 싣는다.
// 셰이더는 이걸 보고 예전처럼 면 밝기만 써서 그린다.
const NRM_FLAT = -1;

// 블록 여섯 면은 값이 정해져 있으니 미리 접어 둔다
const FACE_NRM = new Float32Array(6);
(function () {
  const n = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let f = 0; f < 6; f++) FACE_NRM[f] = packNormal(n[f][0], n[f][1], n[f][2]);
})();

// ── 렌더 타깃 ─────────────────────────────────────────────────────────
// cols: [{internal, format, type}] 색 붙임 목록. depthTex 면 깊이를 텍스처로 붙인다.
function makeTarget(gl, w, h, cols, depthTex, linear) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const tex = [];
  const bufs = [];
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, c.internal, w, h, 0, c.format, c.type, null);
    const f = (linear === false) ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
    tex.push(t);
    bufs.push(gl.COLOR_ATTACHMENT0 + i);
  }
  if (cols.length > 1) gl.drawBuffers(bufs);
  let depth = null;
  if (depthTex) {
    depth = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depth);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
  }
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok) {
    for (let i = 0; i < tex.length; i++) gl.deleteTexture(tex[i]);
    if (depth) gl.deleteTexture(depth);
    gl.deleteFramebuffer(fb);
    return null;
  }
  return { fb: fb, tex: tex, depth: depth, w: w, h: h, bufs: bufs };
}

function freeTarget(gl, t) {
  if (!t) return;
  for (let i = 0; i < t.tex.length; i++) gl.deleteTexture(t.tex[i]);
  if (t.depth) gl.deleteTexture(t.depth);
  gl.deleteFramebuffer(t.fb);
}

// 그림자 지도 — 깊이만 담는다. 견줌 표본(sampler2DShadow) 으로 두면
// 하드웨어가 2x2 를 알아서 섞어 줘서 3x3 만 돌아도 6x6 처럼 부드럽다.
function makeShadowTarget(gl, size) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0,
    gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok) { gl.deleteTexture(t); gl.deleteFramebuffer(fb); return null; }
  return { fb: fb, depth: t, size: size };
}
