// voice.js — 목소리를 글로 바꾸지 않고, 소리 그대로 보내기 위한 녹음기.
//
// 왜 필요한가.
//   지금까지는 브라우저가 말을 글로 바꾸고(음성 인식) 그 글만 보냈다. 그래서
//   발음이 어긋나면 엉뚱한 낱말이 들어가고, 동료는 그 엉뚱한 낱말에 답했다.
//   무엇보다 "발음이 어땠는지"는 글로 바뀌는 순간 사라져 버린다.
//   소리를 그대로 보내면 모델이 발음을 직접 듣고 짚어 줄 수 있다.
//
// 어떻게.
//   마이크에서 원시 파형(PCM)을 받아 16kHz 홑소리로 줄이고, WAV 머리말을
//   붙여 base64 로 만든다. 라이브러리는 쓰지 않는다.
//   말을 멈추면(소리가 한동안 작으면) 저절로 끊는다.
'use strict';

const VOICE_RATE = 16000;      // 보내는 소리의 표본율 (말소리엔 이걸로 충분하다)
const VOICE_MAX = 15;          // 한 번에 최대 몇 초까지 담을까
const VOICE_MIN = 0.35;        // 이보다 짧으면 말이 아니라고 본다
const VOICE_HUSH = 0.9;        // 이만큼 조용하면 말이 끝난 것으로 본다 (초)
const VOICE_LOUD = 0.012;      // 이보다 크면 말하는 중이라고 본다 (RMS)

// 마이크를 연다. 한 번 열어 두고 계속 쓴다 — 매번 열면 느리고 권한도 다시 묻는다.
Game.prototype.voiceOpen = function (done, fail) {
  const self = this;
  if (this._vcStream) { done(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    fail('이 브라우저는 마이크를 열 수 없습니다'); return;
  }
  navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
  }).then(function (stream) {
    self._vcStream = stream;
    done();
  }).catch(function (e) {
    fail('마이크를 쓸 수 없습니다 — ' + (e && e.name ? e.name : e));
  });
};

// 한 마디를 담는다. 말이 끝나면 done(base64 wav) 를 부른다.
// 아무 말도 없으면 done(null).
Game.prototype.voiceRecord = function (done) {
  const self = this;
  if (this._vcBusy) return;
  this._vcBusy = true;
  this.voiceOpen(function () {
    try { self.voiceCapture(done); }
    catch (e) { self._vcBusy = false; done(null, String(e && e.message || e)); }
  }, function (why) {
    self._vcBusy = false;
    done(null, why);
  });
};

Game.prototype.voiceCapture = function (done) {
  const self = this;
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = this._vcCtx || (this._vcCtx = new AC());
  if (ctx.state === 'suspended') ctx.resume();
  const src = ctx.createMediaStreamSource(this._vcStream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  let total = 0, spoke = false, hush = 0;
  const rate = ctx.sampleRate;

  const finish = function (ok) {
    try { node.disconnect(); src.disconnect(); } catch (e) { /* 무시 */ }
    node.onaudioprocess = null;
    self._vcBusy = false;
    self._vcLevel = 0;
    if (!ok || total < rate * VOICE_MIN) { done(null); return; }
    const flat = new Float32Array(total);
    let at = 0;
    for (let i = 0; i < chunks.length; i++) { flat.set(chunks[i], at); at += chunks[i].length; }
    done(voiceWav(voiceResample(flat, rate, VOICE_RATE), VOICE_RATE));
  };

  node.onaudioprocess = function (ev) {
    const inBuf = ev.inputBuffer.getChannelData(0);
    const copy = new Float32Array(inBuf.length);
    copy.set(inBuf);
    chunks.push(copy);
    total += copy.length;
    // 소리 크기 — 말이 시작됐는지, 끝났는지 본다
    let sum = 0;
    for (let i = 0; i < copy.length; i++) sum += copy[i] * copy[i];
    const rms = Math.sqrt(sum / copy.length);
    self._vcLevel = rms;
    const dt = copy.length / rate;
    if (rms > VOICE_LOUD) { spoke = true; hush = 0; }
    else if (spoke) { hush += dt; }
    if (spoke && hush > VOICE_HUSH) { finish(true); return; }
    if (total > rate * VOICE_MAX) { finish(spoke); return; }
    // 말을 시작하지도 않은 채 오래 지나면 그만둔다
    if (!spoke && total > rate * 6) { finish(false); return; }
  };
  src.connect(node);
  node.connect(ctx.destination);
  this._vcStop = function () { finish(spoke); };
};

Game.prototype.voiceCancel = function () {
  if (this._vcStop) { const f = this._vcStop; this._vcStop = null; try { f(); } catch (e) { /* 무시 */ } }
  this._vcBusy = false;
};

// ── 소리 다루기 ───────────────────────────────────────────────────────
// 표본율을 낮춘다. 말소리는 16kHz 면 넉넉하고, 보내는 양이 3분의 1로 준다.
function voiceResample(data, from, to) {
  if (from === to) return data;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(data.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const at = i * ratio;
    const i0 = Math.floor(at), i1 = Math.min(data.length - 1, i0 + 1);
    const t = at - i0;
    out[i] = data[i0] * (1 - t) + data[i1] * t;
  }
  return out;
}

// WAV 머리말을 붙여 base64 로 만든다 (16비트 PCM, 홑소리).
function voiceWav(data, rate) {
  const n = data.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const put = function (at, s) { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  put(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); put(8, 'WAVE');
  put(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);            // PCM
  v.setUint16(22, 1, true);            // 홑소리
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  put(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    let s = data[i];
    if (s > 1) s = 1; else if (s < -1) s = -1;
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  // base64 — 한 번에 다 넘기면 인자가 너무 많아 터지므로 조금씩 자른다
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
