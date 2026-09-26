// Node 단위 테스트:  npm test   (page-turner 폴더에서)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const { parseMusicXML, playbackIndexAt, normalize } = require('../js/score-model.js');
const { ScoreFollower } = require('../js/score-follower.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓', name);
  } catch (e) {
    console.log('  ✗', name);
    console.log(e.stack);
    process.exitCode = 1;
  }
}

// 재현 가능한 난수
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const sampleXml = fs.readFileSync(path.join(__dirname, '..', 'samples', 'ode-to-joy.musicxml'), 'utf8');
const sample = parseMusicXML(sampleXml, DOMParser);

function wrap(measuresXml, extra = '') {
  return `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"/></part-list>
  <part id="P1">${measuresXml}</part>${extra}</score-partwise>`;
}
const n = (step, oct, dur, extra = '') =>
  `<note>${extra}<pitch><step>${step}</step><octave>${oct}</octave></pitch><duration>${dur}</duration></note>`;

console.log('악보 해석');
test('샘플: 64마디, 256박, 템포 100', () => {
  assert.strictEqual(sample.measures.length, 64);
  assert.strictEqual(sample.totalBeats, 256);
  assert.strictEqual(sample.baseTempo, 100);
  assert.strictEqual(sample.playback.length, 64);
  assert.strictEqual(sample.title, '환희의 송가 — 주제와 변주 (데모)');
});
test('샘플: 첫 이벤트는 E4 + 왼손 C3,G3 화음', () => {
  const e = sample.events[0];
  assert.strictEqual(e.beat, 0);
  assert.deepStrictEqual(e.pitches.slice().sort((a, b) => a - b), [48, 55, 64]);
});
test('화음·backup·붙임줄 처리', () => {
  const xml = wrap(`<measure number="1"><attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    ${n('C', 4, 2)}${n('E', 4, 2, '<chord/>')}${n('D', 4, 4, '')}${n('D', 4, 2, '<tie type="start"/>')}
    <backup><duration>8</duration></backup>${n('C', 3, 8)}</measure>
    <measure number="2">${n('D', 4, 2, '<tie type="stop"/>')}${n('E', 4, 6)}</measure>`);
  const s = parseMusicXML(xml, DOMParser);
  assert.deepStrictEqual(
    s.events.map((e) => [e.beat, e.pitches.slice().sort((a, b) => a - b)]),
    [[0, [48, 60, 64]], [1, [62]], [3, [62]], [5, [64]]]
  );
  const tied = s.events[2].notes.find((x) => x.midi === 62);
  assert.strictEqual(tied.dur, 2); // 1박 + 붙임줄 1박
});
test('도돌이표 + 1/2번 괄호 펼치기', () => {
  const xml = wrap(`
    <measure number="1"><barline location="left"><repeat direction="forward"/></barline>
      <attributes><divisions>1</divisions></attributes>${n('C', 4, 4)}</measure>
    <measure number="2"><barline location="left"><ending number="1" type="start"/></barline>${n('D', 4, 4)}
      <barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline></measure>
    <measure number="3"><barline location="left"><ending number="2" type="start"/></barline>${n('E', 4, 4)}
      <barline location="right"><ending number="2" type="discontinue"/></barline></measure>
    <measure number="4">${n('F', 4, 4)}</measure>`);
  const s = parseMusicXML(xml, DOMParser);
  assert.deepStrictEqual(s.playback.map((p) => p.measureIndex), [0, 1, 0, 2, 3]);
  assert.strictEqual(s.totalBeats, 20);
  assert.strictEqual(playbackIndexAt(s, 9.5), 2);
});
test('메트로놈 표기(점2분음표=60) → 4분음표 180', () => {
  const xml = wrap(`<measure number="1"><attributes><divisions>1</divisions><time><beats>6</beats><beat-type>8</beat-type></time></attributes>
    <direction><direction-type><metronome><beat-unit>half</beat-unit><beat-unit-dot/><per-minute>60</per-minute></metronome></direction-type></direction>
    ${n('C', 4, 3)}</measure>`);
  assert.strictEqual(parseMusicXML(xml, DOMParser).baseTempo, 180);
});
test('못갖춘마디(implicit) 길이 유지', () => {
  const xml = wrap(`<measure number="0" implicit="yes"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${n('G', 4, 1)}</measure>
    <measure number="1">${n('C', 5, 3)}</measure>`);
  const s = parseMusicXML(xml, DOMParser);
  assert.deepStrictEqual(s.playback.map((p) => p.lengthBeats), [1, 3]);
});

// ---- 추적기 시뮬레이션 --------------------------------------------------
// 실제 연주를 흉내낸 onset 열을 만들고, 매 20ms 프레임마다 추적기를 돌립니다.
function simulate(score, { rateFn, seed = 1, miss = 0.1, spurious = 0.05, noise = 0.35, pauseAt = null, pauseLen = 0, mode = 'hybrid', startDelay = 0.5 }) {
  const r = rng(seed);
  const base = score.baseTempo;
  // 연주 시각: 박 → 초 (속도가 변하는 연주)
  const perf = [];
  let t = startDelay;
  let prevBeat = 0;
  for (const e of score.events) {
    const db = e.beat - prevBeat;
    t += (db * 60) / (base * rateFn(e.beat));
    if (pauseAt != null && prevBeat < pauseAt && e.beat >= pauseAt) t += pauseLen;
    prevBeat = e.beat;
    perf.push({ time: t + (r() - 0.5) * 0.06, beat: e.beat, e });
  }
  const onsets = [];
  for (const p of perf) {
    if (r() < miss) continue;
    // 실제 분석기 출력처럼 양수 크로마(음 에너지)에 잡음을 섞음
    const c = p.e.pitches.reduce((acc, m) => { acc[m % 12] += 1; acc[(m + 7) % 12] += 0.35; return acc; }, new Array(12).fill(0.05))
      .map((x) => Math.max(0, x + (r() - 0.3) * noise * 2));
    onsets.push({ time: p.time, chroma: normalize(c) });
    if (r() < spurious) onsets.push({ time: p.time + 0.12, chroma: normalize(Array.from({ length: 12 }, () => r())) });
  }
  onsets.sort((a, b) => a.time - b.time);
  const trueBeatAt = (time) => {
    // 연주 기준 실제 위치(선형 보간)
    if (time <= perf[0].time) return 0;
    for (let i = 1; i < perf.length; i++) {
      if (perf[i].time >= time) {
        const a = perf[i - 1];
        const b = perf[i];
        // 멈춤 구간에서는 앞 음 위치에 머무름
        const gap = b.time - a.time;
        const expected = ((b.beat - a.beat) * 60) / (base * rateFn(a.beat));
        if (gap > expected * 1.5) return Math.min(b.beat, a.beat + ((time - a.time) / expected) * (b.beat - a.beat));
        return a.beat + ((time - a.time) / gap) * (b.beat - a.beat);
      }
    }
    return score.totalBeats;
  };
  const soundAt = (time) => perf.some((p) => time >= p.time - 0.01 && time <= p.time + 1.0);

  const f = new ScoreFollower(score, { mode });
  f.start(0);
  const trace = [];
  let oi = 0;
  const end = perf[perf.length - 1].time + 3;
  for (let now = 0; now <= end; now += 0.02) {
    let onset = null;
    // 크로마 분석 지연(약 90ms) 후 전달
    if (oi < onsets.length && onsets[oi].time + 0.09 <= now) onset = onsets[oi++];
    const s = f.update(now, { sound: soundAt(now), onset });
    trace.push({ now, beat: s.beat, truth: trueBeatAt(now), status: s.status, bpm: s.bpm });
  }
  return { trace, perf };
}

// 페이지 = 8마디(32박) 단위, 2박 전에 넘김. 넘김 시각이 실제 필요한 시각과 얼마나 차이 나는지
function pageTurnErrors(trace, pageBeats = 32, lookahead = 2) {
  const errs = [];
  for (let boundary = pageBeats; boundary < 256; boundary += pageBeats) {
    const turnBeat = boundary - lookahead;
    const followed = trace.find((x) => x.beat >= turnBeat);
    const ideal = trace.find((x) => x.truth >= turnBeat);
    if (!followed || !ideal) {
      errs.push(Infinity);
      continue;
    }
    errs.push(followed.now - ideal.now);
  }
  return errs;
}

console.log('위치 추적');
test('일정한 속도(악보보다 느린 80%)로 연주: 페이지 넘김 오차 < 0.6초', () => {
  const { trace } = simulate(sample, { rateFn: () => 0.8 });
  const errs = pageTurnErrors(trace);
  assert.ok(errs.every((e) => Math.abs(e) < 0.6), 'errors: ' + errs.map((e) => e.toFixed(2)));
  const last = trace[trace.length - 1];
  assert.ok(Math.abs(last.bpm - 80) < 8, 'bpm ' + last.bpm);
});
test('점점 빨라지는 연주(70%→130%) + 음 15% 누락: 오차 < 0.8초', () => {
  const { trace } = simulate(sample, { rateFn: (b) => 0.7 + (0.6 * b) / 256, miss: 0.15, seed: 7 });
  const errs = pageTurnErrors(trace);
  assert.ok(errs.every((e) => Math.abs(e) < 0.8), 'errors: ' + errs.map((e) => e.toFixed(2)));
});
test('여러 난수 시드에서 추적 위치가 실제 위치에서 크게 벗어나지 않음', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const { trace } = simulate(sample, { rateFn: (b) => 1 + 0.15 * Math.sin(b / 10), seed });
    const worst = Math.max(...trace.map((x) => Math.abs(x.beat - x.truth)));
    assert.ok(worst < 3, `seed ${seed}: 최대 오차 ${worst.toFixed(2)}박`);
  }
});
test('연주를 5초 멈추면 위치도 멈춤(앞서 나가지 않음)', () => {
  const { trace } = simulate(sample, { rateFn: () => 1, pauseAt: 100, pauseLen: 5, miss: 0 });
  const during = trace.filter((x) => x.truth >= 99 && x.truth <= 100.5);
  const maxAhead = Math.max(...during.map((x) => x.beat - x.truth));
  assert.ok(maxAhead < 2.5, '멈춘 동안 앞서간 박: ' + maxAhead.toFixed(2));
  assert.ok(trace.some((x) => x.status === 'paused'));
  const errs = pageTurnErrors(trace);
  assert.ok(errs.every((e) => Math.abs(e) < 0.8), 'errors: ' + errs.map((e) => e.toFixed(2)));
});
test('박자만 모드: 악보 템포대로 진행', () => {
  const f = new ScoreFollower(sample, { mode: 'tempo' });
  f.start(10);
  const s = f.update(10 + 6, {}); // 100bpm으로 6초 = 10박
  assert.ok(Math.abs(s.beat - 10) < 1e-6, String(s.beat));
  assert.strictEqual(s.measureIndex, 2);
});
test('소리 없이 박자로만 앞서가는 것은 확인 안 된 음 2개까지', () => {
  const f = new ScoreFollower(sample, { mode: 'hybrid' });
  f.start(0);
  f.update(0.1, { sound: true, onset: { time: 0.1, chroma: sample.events[0].chroma } });
  let s;
  for (let t = 0.12; t < 1.4; t += 0.02) s = f.update(t, { sound: true });
  assert.ok(s.beat < sample.events[3].beat, String(s.beat));
});

console.log('앱 설치(PWA)');
const ROOT = path.join(__dirname, '..');
test('서비스 워커가 저장하는 파일이 모두 있음', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const list = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const f of list) if (f !== './') assert.ok(fs.existsSync(path.join(ROOT, f)), '없는 파일: ' + f);
  // index.html 이 불러오는 파일도 빠짐없이 저장 목록에 있어야 오프라인에서 열림
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const [, ref] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) assert.ok(list.includes(ref), '저장 목록에 없음: ' + ref);
});
test('매니페스트 아이콘 파일이 있음', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.strictEqual(m.display, 'standalone');
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(ROOT, i.src)), i.src);
});

console.log(`\n${passed}개 통과`);
