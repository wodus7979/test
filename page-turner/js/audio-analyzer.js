// 마이크(또는 데모 연주) 소리 분석
//  - 음량(RMS): 지금 소리가 나고 있는지
//  - onset: 새 음을 친 순간 (스펙트럼 flux 의 급증)
//  - 크로마: 새로 친 음들이 12음(도, 도#, … 시) 중 어디에 에너지를 가지는지
(function (root) {
  'use strict';

  class AudioAnalyzer {
    constructor(ctx, options) {
      this.ctx = ctx;
      this.sensitivity = 5; // 1(둔감) ~ 10(민감)
      Object.assign(this, options || {});

      this.input = ctx.createGain();
      // onset 검출용: 짧은 창(시간 해상도)
      this.fast = ctx.createAnalyser();
      this.fast.fftSize = 2048;
      this.fast.smoothingTimeConstant = 0;
      // 크로마용: 긴 창(주파수 해상도)
      this.slow = ctx.createAnalyser();
      this.slow.fftSize = 8192;
      this.slow.smoothingTimeConstant = 0;
      this.input.connect(this.fast);
      this.input.connect(this.slow);

      this.timeBuf = new Float32Array(this.fast.fftSize);
      this.fastDb = new Float32Array(this.fast.frequencyBinCount);
      this.prevLog = new Float32Array(this.fast.frequencyBinCount); // 1프레임 전
      this.prevLog2 = new Float32Array(this.fast.frequencyBinCount); // 2프레임 전
      this.slowDb = new Float32Array(this.slow.frequencyBinCount);
      this.spectra = []; // 최근 크로마용 스펙트럼 (onset 직전 상태를 기억)

      const nyq = ctx.sampleRate / 2;
      this.fluxLo = Math.floor((30 / nyq) * this.fast.frequencyBinCount);
      this.fluxHi = Math.floor((6000 / nyq) * this.fast.frequencyBinCount);
      this._buildChromaMap(nyq);

      this.fluxHist = [];
      this.f1 = 0; // 직전 flux
      this.f2 = 0; // 전전 flux
      this.lastOnset = -1;
      this.pending = null; // 크로마를 모으는 중인 onset
      this.noiseFloor = 0.002;
      this.lastChroma = new Array(12).fill(0);
      this.level = 0;
    }

    // 주파수 빈 → 음이름(0=C … 11=B) 대응표. 80Hz~4.2kHz, 반음 중심에서 멀수록 가중치를 낮춤
    _buildChromaMap(nyq) {
      const n = this.slow.frequencyBinCount;
      this.binPc = new Int8Array(n).fill(-1);
      this.binW = new Float32Array(n);
      for (let k = 1; k < n; k++) {
        const f = (k / n) * nyq;
        if (f < 80 || f > 4200) continue;
        const midi = 69 + 12 * Math.log2(f / 440);
        const nearest = Math.round(midi);
        const dev = Math.abs(midi - nearest); // 0 ~ 0.5 반음
        this.binPc[k] = ((nearest % 12) + 12) % 12;
        this.binW[k] = Math.max(0, 1 - dev * 1.6);
      }
    }

    _chromaFrom(mag) {
      const c = new Array(12).fill(0);
      for (let k = 2; k < mag.length - 1; k++) {
        const pc = this.binPc[k];
        if (pc < 0) continue;
        const m = mag[k];
        // 스펙트럼 봉우리만 사용 (옆 빈으로 번진 에너지는 제외)
        if (m <= 0 || m < mag[k - 1] || m < mag[k + 1]) continue;
        c[pc] += Math.sqrt(m) * this.binW[k];
      }
      return c;
    }

    _slowMagnitudes() {
      this.slow.getFloatFrequencyData(this.slowDb);
      const mag = new Float32Array(this.slowDb.length);
      for (let k = 0; k < mag.length; k++) mag[k] = Math.pow(10, this.slowDb[k] / 20);
      return mag;
    }

    // 매 프레임 호출. 반환: { rms, level, sound, onset: {time, chroma} | null, chroma }
    process(now) {
      // 음량
      this.fast.getFloatTimeDomainData(this.timeBuf);
      let sum = 0;
      for (let i = 0; i < this.timeBuf.length; i++) sum += this.timeBuf[i] * this.timeBuf[i];
      const rms = Math.sqrt(sum / this.timeBuf.length);
      // 잡음 바닥: 조용할 때 천천히 따라감
      if (rms < this.noiseFloor * 2) this.noiseFloor = this.noiseFloor * 0.995 + rms * 0.005;
      else this.noiseFloor *= 1.0005;
      this.noiseFloor = Math.min(Math.max(this.noiseFloor, 0.0003), 0.05);
      // 민감도가 높을수록 작은 소리도 연주로 인정
      const gate = Math.max(this.noiseFloor * 3, 0.004 * Math.pow(0.7, this.sensitivity - 5));
      const sound = rms > gate;
      this.level = rms;

      // 스펙트럼 flux: 2프레임 전과 비교해 새로 커진 에너지의 합 (음의 시작이 두 프레임에 걸쳐도 잡히도록)
      this.fast.getFloatFrequencyData(this.fastDb);
      let flux = 0;
      for (let k = this.fluxLo; k < this.fluxHi; k++) {
        const lm = Math.log1p(100 * Math.pow(10, this.fastDb[k] / 20));
        const d = lm - this.prevLog2[k];
        if (d > 0) flux += d;
        this.prevLog2[k] = this.prevLog[k];
        this.prevLog[k] = lm;
      }
      flux /= this.fluxHi - this.fluxLo;

      const mag = this._slowMagnitudes();
      this.spectra.push({ time: now, mag });
      while (this.spectra.length > 6) this.spectra.shift();
      this.lastChroma = this._chromaFrom(mag);

      // 적응형 임계값: 최근 flux 의 중앙값(배경 울림)보다 충분히 클 때만 새 음으로 봅니다.
      this.fluxHist.push(flux);
      if (this.fluxHist.length > 40) this.fluxHist.shift();
      const sorted = this.fluxHist.slice().sort((a, b) => a - b);
      const median = sorted[sorted.length >> 1] || 0;
      const delta = 0.005 * Math.pow(0.8, this.sensitivity - 5);
      const threshold = median * 3 + delta;

      let onset = null;
      // 직전 프레임이 봉우리였는지 확인 (한 프레임 늦게 판정)
      const isPeak = this.f1 > threshold && this.f1 >= this.f2 && this.f1 >= flux;
      if (isPeak && sound && now - this.lastOnset > 0.08) {
        this.lastOnset = now;
        // 새 음 직전의 스펙트럼을 기억해 두었다가, 잠시 뒤 스펙트럼과의 차이(새로 생긴 에너지)로 크로마를 구합니다.
        const before = this.spectra.length > 3 ? this.spectra[this.spectra.length - 4].mag : null;
        if (this.pending) onset = this._finishPending(mag); // 앞 onset 을 먼저 마무리
        this.pending = { time: now - 0.02, before, due: now + 0.08 };
      }
      this.f2 = this.f1;
      this.f1 = flux;

      if (this.pending && now >= this.pending.due) onset = this._finishPending(mag);

      return { rms, level: rms, sound, onset, chroma: this.lastChroma, flux, threshold };
    }

    _finishPending(mag) {
      const p = this.pending;
      this.pending = null;
      let diff = mag;
      if (p.before) {
        diff = new Float32Array(mag.length);
        for (let k = 0; k < mag.length; k++) diff[k] = Math.max(0, mag[k] - p.before[k]);
      }
      const cNew = this._chromaFrom(diff);
      const cAll = this._chromaFrom(mag);
      const maxNew = Math.max(...cNew) || 1;
      const maxAll = Math.max(...cAll) || 1;
      // 새로 생긴 음 위주로, 전체 울림도 조금 섞음
      const chroma = cNew.map((x, i) => x / maxNew + (0.3 * cAll[i]) / maxAll);
      return { time: p.time, chroma };
    }
  }

  root.PT = Object.assign(root.PT || {}, { AudioAnalyzer });
})(typeof window !== 'undefined' ? window : globalThis);
