// renderer.js - 한 장면을 두 방식으로 그린다.
// 왼쪽 = 예전 방식(면 명암 + 색), 오른쪽 = PBR + 그림자 + SSAO + 블룸.
'use strict';

const SHADOW_SIZE = 2048;

function Proto(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: true,
    // 화면을 그대로 읽어 재 볼 수 있게 남겨 둔다 (검사용)
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance'
  });
  if (!gl) throw new Error('이 브라우저는 WebGL2 를 지원하지 않습니다');
  this.gl = gl;
  this.canvas = canvas;
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('부동소수 렌더 타깃(EXT_color_buffer_float) 이 없습니다');
  }
  this.prog = {
    old: glProgram(gl, SCENE_VS, OLD_FS, '예전'),
    pbr: glProgram(gl, SCENE_VS, PBR_FS, 'PBR'),
    toon: glProgram(gl, SCENE_VS, TOON_FS, '애니'),
    pre: glProgram(gl, SCENE_VS, PRE_FS, '깊이·노멀'),
    shadow: glProgram(gl, SHADOW_VS, SHADOW_FS, '그림자'),
    ssao: glProgram(gl, POST_VS, SSAO_FS, 'SSAO'),
    blur: glProgram(gl, POST_VS, BLUR_FS, '흐리기'),
    bright: glProgram(gl, POST_VS, BRIGHT_FS, '밝은부분'),
    bloom: glProgram(gl, POST_VS, BLOOM_FS, '블룸'),
    comp: glProgram(gl, POST_VS, COMP_FS, '합치기'),
    raw: glProgram(gl, POST_VS, RAW_FS, '그대로'),
    sky: glProgram(gl, POST_VS, SKY_FS, '하늘')
  };
  this.quad = glFullscreen(gl);
  this.shadow = glShadowTarget(gl, SHADOW_SIZE);
  this.targets = null;
  this.size = [0, 0];

  // 행렬 미리 잡아 둔다
  this.mProj = M4.ident(); this.mView = M4.ident(); this.mVP = M4.ident();
  this.mInvVP = M4.ident(); this.mInvProj = M4.ident();
  this.mLightP = M4.ident(); this.mLightV = M4.ident(); this.mLightVP = M4.ident();
  this.tmp = M4.ident();
}

Proto.prototype.uploadScene = function (mesh, mats) {
  const gl = this.gl;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const mk = function (data, loc, n, type, norm) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, type, !!norm, 0, 0);
  };
  mk(mesh.pos, 0, 3, gl.FLOAT, false);
  mk(mesh.nor, 1, 3, gl.BYTE, false);
  mk(mesh.uv, 2, 2, gl.FLOAT, false);
  mk(mesh.mid, 3, 1, gl.UNSIGNED_BYTE, false);
  mk(mesh.ao, 4, 1, gl.FLOAT, false);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  this.vao = vao;
  this.count = mesh.idx.length;
  this.mesh = mesh;

  this.texAlb = glTexArray(gl, mats.size, mats.count, mats.alb, true);
  this.texNrm = glTexArray(gl, mats.size, mats.count, mats.nrm, false);
  this.texOrm = glTexArray(gl, mats.size, mats.count, mats.orm, false);
  this.emit = mats.emit;
};

Proto.prototype.resize = function (w, h) {
  const gl = this.gl;
  if (this.size[0] === w && this.size[1] === h) return;
  this.size = [w, h];
  const F = { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT };
  const N = { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
  const R = { internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE };
  this.targets = {
    // 깊이·노멀 먼저 (SSAO 가 이걸 본다)
    pre: glTarget(gl, w, h, [N], true),
    hdr: glTarget(gl, w, h, [F], true),
    ao: glTarget(gl, w, h, [R], false),
    ao2: glTarget(gl, w, h, [R], false),
    b0: glTarget(gl, w >> 1, h >> 1, [F], false),
    b1: glTarget(gl, w >> 1, h >> 1, [F], false)
  };
};

Proto.prototype.setCamera = function (eye, at, fov, asp, near, far) {
  M4.persp(this.mProj, fov, asp, near, far);
  M4.look(this.mView, eye, at, [0, 1, 0]);
  M4.mul(this.mVP, this.mProj, this.mView);
  M4.invert(this.mInvVP, this.mVP);
  M4.invert(this.mInvProj, this.mProj);
  this.eye = eye;
};

// 장면을 다 감싸는 그림자 상자
Proto.prototype.setSun = function (dir, center, radius) {
  const eye = [center[0] + dir[0] * radius * 1.6,
    center[1] + dir[1] * radius * 1.6,
    center[2] + dir[2] * radius * 1.6];
  M4.look(this.mLightV, eye, center, [0, 1, 0]);
  M4.ortho(this.mLightP, -radius, radius, -radius, radius, 1, radius * 3.6);
  M4.mul(this.mLightVP, this.mLightP, this.mLightV);
  this.sun = dir;
};

// 화면 밖으로 그릴 때는 가위질을 끄고, 화면으로 낼 때만 켠다
Proto.prototype.scissorFor = function (target) {
  const gl = this.gl;
  if (target || !this.cut) { gl.disable(gl.SCISSOR_TEST); return; }
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(this.cut[0], this.cut[1], this.cut[2], this.cut[3]);
};

Proto.prototype.drawGeom = function (prog, setup) {
  const gl = this.gl;
  gl.useProgram(prog);
  setup(prog);
  gl.bindVertexArray(this.vao);
  gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
  gl.bindVertexArray(null);
};

Proto.prototype.post = function (prog, target, setup) {
  const gl = this.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
  gl.viewport(0, 0, target ? target.w : this.size[0], target ? target.h : this.size[1]);
  // 가위질은 마지막에 화면으로 낼 때만 쓴다.
  // 그림자 지도·SSAO·블룸까지 잘라 버리면 절반만 계산돼 조명이 망가진다.
  this.scissorFor(target);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(prog);
  setup(prog);
  gl.bindVertexArray(this.quad);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
};

// ── 한 판 그리기 ──
// mode: 'old' | 'pbr'
Proto.prototype.render = function (mode, opt) {
  const gl = this.gl, W = this.size[0], H = this.size[1];
  const sunCol = opt.sunCol, skyUp = opt.skyUp, skyDn = opt.skyDn;
  const lit = (mode !== 'old');
  // 애니 그림체도 그림자를 쓰고, 외곽선을 그리려면 깊이·법선이 필요하다
  const needShadow = lit && opt.shadow;
  const needPre = (mode === 'pbr' && opt.ssao) || (mode === 'toon' && opt.outline);

  if (needShadow) {
    // 1) 그림자 지도
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadow.fbo);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    this.scissorFor(this.shadow);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);          // 그림자 여드름을 줄인다
    const self = this;
    this.drawGeom(this.prog.shadow, function (p) {
      gl.uniformMatrix4fv(p.u.uLightVP, false, self.mLightVP);
    });
    gl.cullFace(gl.BACK);
  }

  if (needPre) {
    // 2) 깊이·노멀
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.pre.fbo);
    gl.viewport(0, 0, W, H);
    this.scissorFor(this.targets.pre);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.5, 0.5, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const self = this;
    this.drawGeom(this.prog.pre, function (p) {
      gl.uniformMatrix4fv(p.u.uVP, false, self.mVP);
      gl.uniformMatrix4fv(p.u.uView, false, self.mView);
    });
    // 3) SSAO 와 흐리기 (PBR 에서만 — 애니는 깊이·법선만 쓴다)
    const t = this.targets, s = this;
    if (mode === 'pbr' && opt.ssao) {
    this.post(this.prog.ssao, t.ao, function (p) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.pre.depth);
      gl.uniform1i(p.u.uDepth, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t.pre.tex[0]);
      gl.uniform1i(p.u.uNormal, 1);
      gl.uniformMatrix4fv(p.u.uInvProj, false, s.mInvProj);
      gl.uniformMatrix4fv(p.u.uProj, false, s.mProj);
      gl.uniform2f(p.u.uSize, W, H);
      gl.uniform1f(p.u.uRadius, opt.aoRadius);
      gl.uniform1f(p.u.uStrength, opt.aoStrength);
    });
    this.post(this.prog.blur, t.ao2, function (p) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.ao.tex[0]);
      gl.uniform1i(p.u.uTex, 0);
      gl.uniform2f(p.u.uDir, 1.5 / W, 0);
    });
    this.post(this.prog.blur, t.ao, function (p) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.ao2.tex[0]);
      gl.uniform1i(p.u.uTex, 0);
      gl.uniform2f(p.u.uDir, 0, 1.5 / H);
    });
    }
  }

  // 4) 본 그림
  const t = this.targets, s = this;
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.hdr.fbo);
  gl.viewport(0, 0, W, H);
  this.scissorFor(t.hdr);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 하늘 먼저 (깊이는 건드리지 않는다)
  gl.depthMask(false);
  this.post(this.prog.sky, t.hdr, function (p) {
    gl.uniformMatrix4fv(p.u.uInvVP, false, s.mInvVP);
    gl.uniform3fv(p.u.uCam, s.eye);
    gl.uniform3fv(p.u.uSun, s.sun);
    gl.uniform3fv(p.u.uSunCol, sunCol);
    gl.uniform3fv(p.u.uSkyUp, skyUp);
    gl.uniform3fv(p.u.uSkyDn, skyDn);
    gl.uniform1f(p.u.uPbr, mode === 'pbr' ? 1 : 0);
    gl.uniform1f(p.u.uToon, mode === 'toon' ? 1 : 0);
    gl.uniform1f(p.u.uTime, opt.time || 0);
  });
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  if (mode === 'old') {
    this.drawGeom(this.prog.old, function (p) {
      gl.uniformMatrix4fv(p.u.uVP, false, s.mVP);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, s.texAlb);
      gl.uniform1i(p.u.uAlb, 0);
      gl.uniform3fv(p.u.uCam, s.eye);
      gl.uniform3fv(p.u.uSky, skyDn);
      gl.uniform1f(p.u.uFogA, opt.fogA);
      gl.uniform1f(p.u.uFogB, opt.fogB);
      gl.uniform1f(p.u.uDay, opt.day);
    });
  } else if (mode === 'toon') {
    this.drawGeom(this.prog.toon, function (p) {
      gl.uniformMatrix4fv(p.u.uVP, false, s.mVP);
      gl.uniformMatrix4fv(p.u.uLightVP, false, s.mLightVP);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, s.texAlb);
      gl.uniform1i(p.u.uAlb, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D_ARRAY, s.texNrm);
      gl.uniform1i(p.u.uNrm, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D_ARRAY, s.texOrm);
      gl.uniform1i(p.u.uOrm, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, s.shadow.depth);
      gl.uniform1i(p.u.uShadow, 3);
      gl.uniform3fv(p.u.uCam, s.eye);
      gl.uniform3fv(p.u.uSun, s.sun);
      gl.uniform3fv(p.u.uLightTint, opt.lightTint);
      gl.uniform3fv(p.u.uShadeTint, opt.shadeTint);
      gl.uniform3fv(p.u.uRimCol, opt.rimCol);
      gl.uniform3fv(p.u.uFogCol, opt.fogCol);
      gl.uniform1f(p.u.uFogA, opt.fogA);
      gl.uniform1f(p.u.uFogB, opt.fogB);
      gl.uniform1fv(p.u.uEmit, s.emit);
      gl.uniform1f(p.u.uShadowOn, opt.shadow ? 1 : 0);
      gl.uniform1f(p.u.uNormalOn, opt.normal ? 1 : 0);
      gl.uniform1f(p.u.uBands, opt.bands);
      gl.uniform1f(p.u.uSat, opt.sat);
    });
  } else {
    this.drawGeom(this.prog.pbr, function (p) {
      gl.uniformMatrix4fv(p.u.uVP, false, s.mVP);
      gl.uniformMatrix4fv(p.u.uLightVP, false, s.mLightVP);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, s.texAlb);
      gl.uniform1i(p.u.uAlb, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D_ARRAY, s.texNrm);
      gl.uniform1i(p.u.uNrm, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D_ARRAY, s.texOrm);
      gl.uniform1i(p.u.uOrm, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, s.shadow.depth);
      gl.uniform1i(p.u.uShadow, 3);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, opt.ssao ? t.ao.tex[0] : s.whiteTex());
      gl.uniform1i(p.u.uAO, 4);
      gl.uniform3fv(p.u.uCam, s.eye);
      gl.uniform3fv(p.u.uSun, s.sun);
      gl.uniform3fv(p.u.uSunCol, sunCol);
      gl.uniform3fv(p.u.uSkyUp, skyUp);
      gl.uniform3fv(p.u.uSkyDn, skyDn);
      gl.uniform3fv(p.u.uAmbUp, opt.ambUp);
      gl.uniform3fv(p.u.uAmbDn, opt.ambDn);
      gl.uniform2f(p.u.uPix, 1 / W, 1 / H);
      gl.uniform1fv(p.u.uEmit, s.emit);
      gl.uniform1f(p.u.uShadowOn, opt.shadow ? 1 : 0);
      gl.uniform1f(p.u.uSsaoOn, opt.ssao ? 1 : 0);
      gl.uniform1f(p.u.uNormalOn, opt.normal ? 1 : 0);
      gl.uniform1f(p.u.uFogA, opt.fogA);
      gl.uniform1f(p.u.uFogB, opt.fogB);
      gl.uniform3fv(p.u.uFogCol, opt.fogCol);
    });
  }
  gl.disable(gl.CULL_FACE);

  // 5) 마무리
  if (mode === 'old') {
    this.post(this.prog.raw, null, function (p) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.hdr.tex[0]);
      gl.uniform1i(p.u.uHdr, 0);
    });
    return;
  }
  // 블룸
  if (opt.bloom) {
    this.post(this.prog.bright, t.b0, function (p) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.hdr.tex[0]);
      gl.uniform1i(p.u.uTex, 0);
      gl.uniform1f(p.u.uThresh, opt.bloomThresh);
    });
    this.post(this.prog.bloom, t.b1, function (p) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.b0.tex[0]);
      gl.uniform1i(p.u.uTex, 0);
      gl.uniform2f(p.u.uDir, 1.6 / t.b0.w, 0);
    });
    this.post(this.prog.bloom, t.b0, function (p) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.b1.tex[0]);
      gl.uniform1i(p.u.uTex, 0);
      gl.uniform2f(p.u.uDir, 0, 1.6 / t.b0.h);
    });
  }
  const ink = (mode === 'toon' && opt.outline);
  this.post(this.prog.comp, null, function (p) {
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.hdr.tex[0]);
    gl.uniform1i(p.u.uHdr, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, opt.bloom ? t.b0.tex[0] : s.blackTex());
    gl.uniform1i(p.u.uBloom, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, ink ? t.pre.depth : s.whiteTex());
    gl.uniform1i(p.u.uDepth, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, ink ? t.pre.tex[0] : s.whiteTex());
    gl.uniform1i(p.u.uNormal, 3);
    gl.uniform1f(p.u.uBloomAmt, opt.bloom ? opt.bloomAmt : 0);
    gl.uniform1f(p.u.uExposure, mode === 'toon' ? 1.0 : opt.exposure);
    gl.uniform1f(p.u.uTone, (mode === 'pbr' && opt.tone) ? 1 : 0);
    gl.uniform1f(p.u.uOutline, ink ? 1 : 0);
    gl.uniform2f(p.u.uPix, 1 / W, 1 / H);
    gl.uniform3fv(p.u.uInkCol, opt.inkCol);
    gl.uniform1f(p.u.uVignette, mode === 'toon' ? 0.14 : 0.35);
  });
};

Proto.prototype.whiteTex = function () {
  if (!this._white) {
    const gl = this.gl;
    this._white = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._white);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  return this._white;
};
Proto.prototype.blackTex = function () {
  if (!this._black) {
    const gl = this.gl;
    this._black = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._black);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  return this._black;
};
