// 앱 화면 연결: 악보 불러오기, 듣기 시작/정지, 데모 연주, 자동 페이지 넘김
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    file: $('file'), sample: $('sample'), start: $('start'), demo: $('demo'),
    settingsBtn: $('settingsBtn'), settings: $('settings'),
    mode: $('mode'), tempo: $('tempo'), lookahead: $('lookahead'), sensitivity: $('sensitivity'),
    zoom: $('zoom'), demoSpeed: $('demoSpeed'), rubato: $('rubato'), demoSound: $('demoSound'),
    viewport: $('viewport'), empty: $('empty'), prev: $('prev'), next: $('next'), toast: $('toast'),
    status: $('status'), measure: $('measure'), page: $('page'), bpm: $('bpm'), level: $('level'), chroma: $('chroma'),
  };

  const STATUS_TEXT = {
    idle: '대기', waiting: '첫 음을 기다리는 중', following: '따라가는 중', paused: '연주 멈춤', running: '박자로 진행',
  };
  const PREF_KEY = 'page-turner-settings';

  const state = {
    score: null,
    view: null,
    follower: null,
    ctx: null,
    analyzer: null,
    micStream: null,
    micSource: null,
    player: null,
    running: null, // null | 'listen' | 'demo'
    startBeat: 0,
    lastAutoPage: 0,
    snap: null,
    wakeLock: null,
  };
  window.app = state; // 디버깅/테스트용

  // ---------- 설정 ----------
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      for (const k of ['mode', 'lookahead', 'sensitivity', 'zoom', 'demoSpeed']) if (p[k] != null) els[k].value = p[k];
      for (const k of ['rubato', 'demoSound']) if (p[k] != null) els[k].checked = p[k];
    } catch (e) {
      /* 저장된 설정 없음 */
    }
  }
  function savePrefs() {
    const p = {};
    for (const k of ['mode', 'lookahead', 'sensitivity', 'zoom', 'demoSpeed']) p[k] = els[k].value;
    for (const k of ['rubato', 'demoSound']) p[k] = els[k].checked;
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(p));
    } catch (e) {
      /* 저장 불가 환경 */
    }
  }

  let toastTimer = null;
  function toast(msg, ms = 2600) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
  }

  // ---------- 악보 불러오기 ----------
  async function readScoreFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf') || file.type.startsWith('image/')) {
      throw new Error('PDF·사진 악보는 바로 읽을 수 없어요. MuseScore(PDF 가져오기)나 Audiveris로 MusicXML로 바꾼 뒤 불러와 주세요.');
    }
    if (name.endsWith('.mxl')) {
      const zip = await JSZip.loadAsync(file);
      let path = null;
      const container = zip.file('META-INF/container.xml');
      if (container) {
        const m = (await container.async('string')).match(/full-path="([^"]+)"/);
        if (m) path = m[1];
      }
      if (!path) path = Object.keys(zip.files).find((f) => /\.(xml|musicxml)$/i.test(f) && !f.startsWith('META-INF'));
      if (!path || !zip.file(path)) throw new Error('.mxl 파일 안에서 악보를 찾지 못했어요.');
      return zip.file(path).async('string');
    }
    return file.text();
  }

  async function loadScore(xmlText, label) {
    stop();
    let score;
    try {
      score = PT.parseMusicXML(xmlText);
    } catch (e) {
      toast(e.message, 5000);
      return;
    }
    if (!score.events.length) {
      toast('악보에서 음표를 찾지 못했어요.', 4000);
      return;
    }
    els.empty.hidden = true;
    if (!state.view) {
      state.view = new PT.ScoreView(els.viewport);
      state.view.onPageChange = updatePageLabel;
      state.view.zoom = parseFloat(els.zoom.value);
    }
    try {
      state.view.page = 0;
      await state.view.load(xmlText);
    } catch (e) {
      console.error(e);
      toast('악보를 그리는 중 문제가 생겼어요: ' + e.message, 5000);
      return;
    }
    state.score = score;
    state.follower = new PT.ScoreFollower(score, { mode: els.mode.value });
    state.startBeat = 0;
    state.lastAutoPage = 0;
    els.tempo.value = Math.round(score.baseTempo);
    els.start.disabled = false;
    els.demo.disabled = false;
    state.snap = state.follower.snapshot();
    state.view.showPage(0, false);
    state.view.setPosition(state.snap.measureIndex, 0);
    updatePageLabel();
    renderStatus();
    toast(`「${score.title || label || '악보'}」 ${score.measures.length}마디 · ${state.view.pages.length}페이지`);
  }

  // ---------- 오디오 ----------
  async function ensureAudio() {
    if (!state.ctx) {
      state.ctx = new (window.AudioContext || window.webkitAudioContext)();
      state.analyzer = new PT.AudioAnalyzer(state.ctx, { sensitivity: +els.sensitivity.value });
    }
    if (state.ctx.state === 'suspended') await state.ctx.resume();
  }

  async function openMic() {
    if (state.micStream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('이 브라우저에서는 마이크를 쓸 수 없어요. (https 주소나 localhost에서 열어 주세요)');
    }
    // 음악 소리는 통화용 보정(에코 제거·잡음 억제·자동 음량)을 끄는 편이 훨씬 정확합니다.
    state.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    state.micSource = state.ctx.createMediaStreamSource(state.micStream);
    state.micSource.connect(state.analyzer.input);
  }

  function closeMic() {
    if (state.micSource) state.micSource.disconnect();
    if (state.micStream) state.micStream.getTracks().forEach((t) => t.stop());
    state.micSource = null;
    state.micStream = null;
  }

  function beginFollowing() {
    const f = state.follower;
    f.setOptions({ mode: els.mode.value });
    f.reset(state.startBeat);
    const bpm = parseFloat(els.tempo.value);
    if (bpm > 0) f.setTempo(bpm);
    f.start(state.ctx.currentTime);
    state.lastAutoPage = state.view.pageOfMeasure(f.snapshot().measureIndex);
    state.view.showPage(state.lastAutoPage);
    requestWakeLock();
  }

  async function startListening() {
    try {
      await ensureAudio();
      if (els.mode.value !== 'tempo') await openMic();
    } catch (e) {
      toast(e.name === 'NotAllowedError' ? '마이크 사용을 허락해 주세요.' : e.message, 5000);
      return;
    }
    state.running = 'listen';
    beginFollowing();
    renderButtons();
    toast(els.mode.value === 'tempo' ? '박자에 맞춰 진행합니다.' : '듣고 있어요. 연주를 시작하세요!');
  }

  async function startDemo() {
    await ensureAudio();
    closeMic(); // 데모 소리만 분석
    if (state.player) state.player.stop();
    state.player = new PT.DemoPlayer(state.ctx, state.score, {
      output: els.demoSound.checked ? state.ctx.destination : null,
      analyzerInput: state.analyzer.input,
    });
    state.player.speed = parseFloat(els.demoSpeed.value);
    state.player.rubato = els.rubato.checked;
    state.player.onEnd = () => {
      if (state.running === 'demo') stop();
    };
    state.running = 'demo';
    beginFollowing();
    state.player.start(state.startBeat);
    renderButtons();
    toast(`데모 연주: 악보 템포의 ${Math.round(state.player.speed * 100)}%${state.player.rubato ? ' + 템포 흔들기' : ''}`);
  }

  function stop() {
    if (state.player) state.player.stop();
    state.player = null;
    closeMic();
    state.running = null;
    releaseWakeLock();
    renderButtons();
    renderStatus();
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !state.wakeLock) {
        state.wakeLock = await navigator.wakeLock.request('screen');
        state.wakeLock.addEventListener('release', () => (state.wakeLock = null));
      }
    } catch (e) {
      /* 화면 꺼짐 방지를 지원하지 않음 */
    }
  }
  function releaseWakeLock() {
    if (state.wakeLock) state.wakeLock.release().catch(() => {});
    state.wakeLock = null;
  }

  // ---------- 매 프레임 ----------
  function tick() {
    requestAnimationFrame(tick);
    if (!state.score || !state.running) return;
    const now = state.ctx.currentTime;
    const frame = state.analyzer.process(now);
    const snap = state.follower.update(now, frame);
    state.snap = snap;
    state.lastFrame = frame;

    autoTurn(snap);
    state.view.setPosition(snap.measureIndex, snap.measureFraction);
    renderStatus(frame);
  }

  // 현재 위치보다 "미리 넘기기" 박만큼 앞선 곳이 다른 페이지에 있으면 넘깁니다.
  // (도돌이표로 앞 페이지로 돌아가는 경우도 같은 방식으로 처리됩니다)
  function autoTurn(snap) {
    const score = state.score;
    const look = Math.max(0, parseFloat(els.lookahead.value) || 0);
    const target = Math.min(snap.beat + look, score.totalBeats - 1e-3);
    const pb = score.playback[PT.playbackIndexAt(score, target)];
    const targetPage = state.view.pageOfMeasure(pb.measureIndex);
    // 위치가 새 페이지로 넘어갈 때만 넘깁니다. 사용자가 손으로 넘긴 페이지는 억지로 되돌리지 않습니다.
    if (targetPage !== state.lastAutoPage) {
      state.lastAutoPage = targetPage;
      state.view.showPage(targetPage);
    }
  }

  function renderStatus(frame) {
    const s = state.running ? (state.snap && state.snap.status) || 'waiting' : 'idle';
    els.status.textContent = STATUS_TEXT[s] || s;
    els.status.className = 'pill ' + s;
    if (state.score && state.snap) {
      const m = state.score.measures[state.snap.measureIndex];
      els.measure.textContent = m ? m.number : '–';
      els.bpm.textContent = Math.round(state.snap.bpm);
    }
    if (frame) {
      els.level.style.width = Math.min(100, Math.sqrt(frame.level) * 300) + '%';
      const c = frame.chroma;
      const max = Math.max(...c) || 1;
      const bars = els.chroma.children;
      for (let i = 0; i < 12; i++) bars[i].style.height = Math.max(1, (c[i] / max) * 18) + 'px';
    } else {
      els.level.style.width = '0%';
    }
  }

  function updatePageLabel() {
    if (!state.view || !state.view.pages.length) return;
    els.page.textContent = `${state.view.page + 1} / ${state.view.pages.length}`;
    els.prev.hidden = state.view.page === 0;
    els.next.hidden = state.view.page >= state.view.pages.length - 1;
  }

  function renderButtons() {
    const r = state.running;
    els.start.textContent = r === 'listen' ? '■ 정지' : '▶ 듣기 시작';
    els.start.classList.toggle('active', r === 'listen');
    els.demo.textContent = r === 'demo' ? '■ 데모 정지' : '🎵 데모 연주';
    els.demo.classList.toggle('active', r === 'demo');
  }

  function turn(delta) {
    if (!state.view) return;
    state.view.showPage(state.view.page + delta);
  }

  // 마디를 누르면 그 마디부터 시작 (연주 중이면 그 위치로 바로 이동)
  function onSheetClick(ev) {
    if (!state.view || !state.score || ev.target.closest('.nav')) return;
    const mi = state.view.measureAt(ev.clientX, ev.clientY);
    if (mi == null) return;
    const pb = state.score.playback.find((p) => p.measureIndex === mi);
    if (!pb) return;
    state.startBeat = pb.startBeat;
    const f = state.follower;
    f.reset(pb.startBeat);
    if (state.running) {
      f.start(state.ctx.currentTime);
      if (state.running === 'demo') state.player.start(pb.startBeat);
    }
    state.snap = f.snapshot();
    state.lastAutoPage = state.view.pageOfMeasure(mi);
    state.view.setPosition(mi, 0);
    renderStatus();
    toast(`${state.score.measures[mi].number}마디부터 시작합니다.`);
  }

  // ---------- 이벤트 연결 ----------
  function bind() {
    for (let i = 0; i < 12; i++) els.chroma.appendChild(document.createElement('i'));

    els.file.addEventListener('change', async () => {
      const f = els.file.files[0];
      if (!f) return;
      try {
        await loadScore(await readScoreFile(f), f.name);
      } catch (e) {
        toast(e.message, 6000);
      }
      els.file.value = '';
    });
    els.sample.addEventListener('click', () => loadScore(window.SAMPLE_SCORE, '샘플'));
    els.start.addEventListener('click', () => (state.running === 'listen' ? stop() : (stop(), startListening())));
    els.demo.addEventListener('click', () => (state.running === 'demo' ? stop() : (stop(), startDemo())));
    els.settingsBtn.addEventListener('click', () => {
      els.settings.hidden = !els.settings.hidden;
      els.settingsBtn.setAttribute('aria-expanded', String(!els.settings.hidden));
      relayoutSoon();
    });
    els.prev.addEventListener('click', () => turn(-1));
    els.next.addEventListener('click', () => turn(1));
    els.viewport.addEventListener('click', onSheetClick);

    els.mode.addEventListener('change', () => {
      savePrefs();
      if (state.running === 'listen') {
        stop();
        startListening();
      } else if (state.follower) state.follower.setOptions({ mode: els.mode.value });
    });
    els.tempo.addEventListener('change', () => {
      const bpm = parseFloat(els.tempo.value);
      if (state.follower && bpm > 0) state.follower.setTempo(bpm);
    });
    els.sensitivity.addEventListener('input', () => {
      if (state.analyzer) state.analyzer.sensitivity = +els.sensitivity.value;
      savePrefs();
    });
    els.zoom.addEventListener('change', () => {
      savePrefs();
      if (state.view) {
        state.view.setZoom(parseFloat(els.zoom.value));
        afterRelayout();
      }
    });
    for (const k of ['lookahead', 'demoSpeed', 'rubato', 'demoSound']) els[k].addEventListener('change', savePrefs);

    // 블루투스 페이지 넘김 페달은 보통 화살표/PageUp·PageDown 키를 보냅니다.
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, select, textarea')) return;
      if (['ArrowRight', 'PageDown', 'ArrowDown'].includes(e.key)) {
        turn(1);
        e.preventDefault();
      } else if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) {
        turn(-1);
        e.preventDefault();
      } else if (e.key === ' ' && state.score && !e.target.closest('button')) {
        // (버튼에 초점이 있으면 브라우저가 Space로 그 버튼을 누르므로 건너뜀)
        e.preventDefault();
        els.start.click();
      }
    });

    // 파일 끌어다 놓기
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (!f) return;
      try {
        await loadScore(await readScoreFile(f), f.name);
      } catch (err) {
        toast(err.message, 6000);
      }
    });

    window.addEventListener('resize', relayoutSoon);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.running) requestWakeLock();
    });
  }

  let relayoutTimer = null;
  function relayoutSoon() {
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(() => {
      if (!state.view || !state.score) return;
      state.view.render();
      afterRelayout();
    }, 250);
  }
  function afterRelayout() {
    const mi = state.snap ? state.snap.measureIndex : 0;
    state.lastAutoPage = state.view.pageOfMeasure(mi);
    state.view.showPage(state.lastAutoPage, false);
    state.view.setPosition(mi, state.snap ? state.snap.measureFraction : 0);
    updatePageLabel();
  }

  loadPrefs();
  bind();
  renderStatus();
  requestAnimationFrame(tick);
})();
