// MusicXML → 연주 순서대로 펼친 악보 모델
// 브라우저(window.PT)와 Node(module.exports) 양쪽에서 사용할 수 있습니다.
(function (root) {
  'use strict';

  const STEP_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const BEAT_UNIT_QUARTERS = {
    whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125,
  };
  const EPS = 1e-6;

  function childrenByTag(el, tag) {
    const out = [];
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1 && c.nodeName === tag) out.push(c);
    }
    return out;
  }
  function child(el, tag) {
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1 && c.nodeName === tag) return c;
    }
    return null;
  }
  function childText(el, tag) {
    const c = child(el, tag);
    return c ? c.textContent.trim() : null;
  }
  function elementChildren(el) {
    const out = [];
    for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) out.push(c);
    return out;
  }

  function pitchToMidi(pitchEl) {
    const step = childText(pitchEl, 'step');
    const octave = parseInt(childText(pitchEl, 'octave'), 10);
    const alter = parseFloat(childText(pitchEl, 'alter') || '0');
    return 12 * (octave + 1) + STEP_SEMITONES[step] + Math.round(alter);
  }

  // 한 음이 만들어 내는 크로마(12음) 에너지. 배음(3·5배음)도 조금 더해서
  // 실제 피아노 소리의 스펙트럼과 비슷하게 만듭니다. 결과는 centerNormalize 되어 있어
  // 두 크로마의 내적이 곧 상관계수(-1~1)가 됩니다.
  function chromaForPitches(pitches) {
    const c = new Array(12).fill(0);
    for (const p of pitches) {
      c[p % 12] += 1;
      c[(p + 19) % 12] += 0.35; // 3배음 (완전5도 + 옥타브)
      c[(p + 28) % 12] += 0.15; // 5배음 (장3도 + 2옥타브)
    }
    return centerNormalize(c);
  }
  // 평균을 빼고 길이를 1로: 양수뿐인 벡터끼리의 코사인 유사도가 항상 높게 나오는 문제를 막습니다.
  function centerNormalize(v) {
    let mean = 0;
    for (const x of v) mean += x;
    mean /= v.length;
    return normalize(v.map((x) => x - mean));
  }
  function normalize(v) {
    let s = 0;
    for (const x of v) s += x * x;
    s = Math.sqrt(s);
    return s > 0 ? v.map((x) => x / s) : v.slice();
  }

  // 한 파트의 마디들을 읽어 각 마디 안의 음 시작점(박 단위)을 모읍니다.
  function readPart(partEl) {
    const measures = [];
    let divisions = 1;
    let timeSig = { beats: 4, beatType: 4 };
    let currentEnding = null; // 볼타(1번/2번 괄호)가 적용되는 번호 목록

    for (const mEl of childrenByTag(partEl, 'measure')) {
      const m = {
        number: mEl.getAttribute('number'),
        implicit: mEl.getAttribute('implicit') === 'yes',
        notes: [], // {beat, midi, dur}
        tempos: [], // {beat, bpm}
        forwardRepeat: false,
        backwardRepeat: false,
        repeatTimes: 2,
        endings: null,
        maxBeat: 0,
        timeSig: null,
      };
      let cursor = 0; // 박 단위 (4분음표 = 1)
      let lastOnset = 0;
      let endingStartsHere = null;
      let endingStops = false;

      for (const el of elementChildren(mEl)) {
        switch (el.nodeName) {
          case 'attributes': {
            const d = childText(el, 'divisions');
            if (d) divisions = parseFloat(d);
            const t = child(el, 'time');
            if (t && childText(t, 'beats')) {
              timeSig = {
                beats: parseFloat(childText(t, 'beats')),
                beatType: parseFloat(childText(t, 'beat-type')),
              };
            }
            break;
          }
          case 'note': {
            if (child(el, 'grace') || child(el, 'cue')) break;
            const durDiv = parseFloat(childText(el, 'duration') || '0');
            const dur = durDiv / divisions;
            const isChord = !!child(el, 'chord');
            const onset = isChord ? lastOnset : cursor;
            const pitchEl = child(el, 'pitch');
            const tieStop = childrenByTag(el, 'tie').some((t) => t.getAttribute('type') === 'stop');
            if (pitchEl && !child(el, 'rest')) {
              const midi = pitchToMidi(pitchEl);
              if (tieStop) {
                // 붙임줄로 이어진 음: 새로 치는 음이 아니므로 앞 음의 길이만 늘립니다.
                const prev = findTiedPrevious(measures, m, midi);
                if (prev) prev.dur += dur;
              } else {
                m.notes.push({ beat: onset, midi, dur });
              }
            }
            if (!isChord) {
              lastOnset = cursor;
              cursor += dur;
            }
            m.maxBeat = Math.max(m.maxBeat, cursor);
            break;
          }
          case 'backup':
            cursor -= parseFloat(childText(el, 'duration') || '0') / divisions;
            break;
          case 'forward':
            cursor += parseFloat(childText(el, 'duration') || '0') / divisions;
            m.maxBeat = Math.max(m.maxBeat, cursor);
            break;
          case 'direction': {
            const sound = child(el, 'sound');
            let bpm = sound && sound.getAttribute('tempo') ? parseFloat(sound.getAttribute('tempo')) : null;
            if (bpm == null) {
              const dt = child(el, 'direction-type');
              const met = dt && child(dt, 'metronome');
              if (met && childText(met, 'per-minute')) {
                const unit = BEAT_UNIT_QUARTERS[childText(met, 'beat-unit')] || 1;
                const dotted = !!child(met, 'beat-unit-dot');
                bpm = parseFloat(childText(met, 'per-minute')) * unit * (dotted ? 1.5 : 1);
              }
            }
            if (bpm && isFinite(bpm) && bpm > 0) m.tempos.push({ beat: cursor, bpm });
            break;
          }
          case 'sound':
            if (el.getAttribute('tempo')) m.tempos.push({ beat: cursor, bpm: parseFloat(el.getAttribute('tempo')) });
            break;
          case 'barline': {
            const rep = child(el, 'repeat');
            if (rep) {
              if (rep.getAttribute('direction') === 'forward') m.forwardRepeat = true;
              if (rep.getAttribute('direction') === 'backward') {
                m.backwardRepeat = true;
                const times = parseInt(rep.getAttribute('times') || '2', 10);
                if (times > 1) m.repeatTimes = times;
              }
            }
            const ending = child(el, 'ending');
            if (ending) {
              const type = ending.getAttribute('type');
              const nums = (ending.getAttribute('number') || '1')
                .split(/[,\s]+/)
                .map((s) => parseInt(s, 10))
                .filter((n) => !isNaN(n));
              if (type === 'start') endingStartsHere = nums;
              if (type === 'stop' || type === 'discontinue') endingStops = true;
            }
            break;
          }
          default:
            break;
        }
      }

      if (endingStartsHere) currentEnding = endingStartsHere;
      m.endings = currentEnding;
      if (endingStops) currentEnding = null;

      m.timeSig = { ...timeSig };
      m.nominalBeats = (timeSig.beats * 4) / timeSig.beatType;
      measures.push(m);
    }
    return measures;
  }

  function findTiedPrevious(measures, current, midi) {
    for (let i = current.notes.length - 1; i >= 0; i--) if (current.notes[i].midi === midi) return current.notes[i];
    for (let k = measures.length - 1; k >= Math.max(0, measures.length - 4); k--) {
      const ns = measures[k].notes;
      for (let i = ns.length - 1; i >= 0; i--) if (ns[i].midi === midi) return ns[i];
    }
    return null;
  }

  // 도돌이표·1/2번 괄호를 반영한 연주 순서 (마디 인덱스 배열)
  function unrollRepeats(measures) {
    const order = [];
    const done = new Array(measures.length).fill(0); // 되돌아간 횟수
    let repeatStart = 0;
    let pass = 1;
    let i = 0;
    const limit = measures.length * 10;
    while (i < measures.length && order.length < limit) {
      const m = measures[i];
      if (m.forwardRepeat && i !== repeatStart) {
        repeatStart = i;
        pass = 1;
      }
      if (m.endings && !m.endings.includes(pass)) {
        i++;
        continue;
      }
      order.push(i);
      if (m.backwardRepeat) {
        if (done[i] < m.repeatTimes - 1) {
          done[i]++;
          pass = done[i] + 1;
          i = repeatStart;
          continue;
        }
        done[i] = 0;
        pass = 1;
        repeatStart = i + 1;
      }
      i++;
    }
    return order;
  }

  function parseMusicXML(xmlText, DOMParserImpl) {
    const Parser = DOMParserImpl || root.DOMParser;
    const doc = new Parser().parseFromString(xmlText, 'application/xml');
    const scoreEl = doc.documentElement;
    if (!scoreEl || scoreEl.nodeName === 'parsererror' || doc.getElementsByTagName('parsererror').length) {
      throw new Error('MusicXML 파일을 해석할 수 없습니다.');
    }
    if (scoreEl.nodeName === 'score-timewise') {
      throw new Error('score-timewise 형식은 지원하지 않습니다. score-partwise로 내보내 주세요.');
    }

    const titleEl =
      doc.getElementsByTagName('work-title')[0] || doc.getElementsByTagName('movement-title')[0];
    const title = titleEl ? titleEl.textContent.trim() : '';

    const partEls = childrenByTag(scoreEl, 'part');
    if (!partEls.length) throw new Error('악보에 파트가 없습니다.');
    const parts = partEls.map(readPart);
    const measureCount = Math.max(...parts.map((p) => p.length));

    // 파트 합치기: 마디 길이는 가장 긴 파트 기준
    const measures = [];
    for (let i = 0; i < measureCount; i++) {
      const first = parts[0][i] || parts.find((p) => p[i])[i];
      let length = 0;
      const notes = [];
      const tempos = [];
      for (const p of parts) {
        const m = p[i];
        if (!m) continue;
        length = Math.max(length, m.maxBeat);
        notes.push(...m.notes);
        tempos.push(...m.tempos);
      }
      if (length < EPS) length = first.nominalBeats;
      // 못갖춘마디가 아니면 박자표 길이를 기준으로 합니다.
      if (!first.implicit && Math.abs(length - first.nominalBeats) < 0.26) length = first.nominalBeats;
      measures.push({
        index: i,
        number: first.number,
        lengthBeats: length,
        timeSig: first.timeSig,
        notes,
        tempos,
        forwardRepeat: first.forwardRepeat,
        backwardRepeat: first.backwardRepeat,
        repeatTimes: first.repeatTimes,
        endings: first.endings,
      });
    }

    const order = unrollRepeats(measures);

    // 연주 순서대로 이벤트(동시에 치는 음 묶음)와 템포 지도를 만듭니다.
    const playback = []; // {measureIndex, startBeat, lengthBeats}
    const rawEvents = [];
    const tempoMap = [];
    let beat = 0;
    for (const mi of order) {
      const m = measures[mi];
      playback.push({ measureIndex: mi, startBeat: beat, lengthBeats: m.lengthBeats });
      for (const t of m.tempos) tempoMap.push({ beat: beat + t.beat, bpm: t.bpm });
      for (const n of m.notes) {
        rawEvents.push({ beat: beat + n.beat, midi: n.midi, dur: n.dur, measureIndex: mi, playbackIndex: playback.length - 1 });
      }
      beat += m.lengthBeats;
    }
    const totalBeats = beat;

    rawEvents.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
    const events = [];
    for (const n of rawEvents) {
      const last = events[events.length - 1];
      if (last && Math.abs(last.beat - n.beat) < EPS) {
        if (!last.pitches.includes(n.midi)) {
          last.pitches.push(n.midi);
          last.notes.push({ midi: n.midi, dur: n.dur });
        }
      } else {
        events.push({
          beat: n.beat,
          measureIndex: n.measureIndex,
          playbackIndex: n.playbackIndex,
          pitches: [n.midi],
          notes: [{ midi: n.midi, dur: n.dur }],
        });
      }
    }
    events.forEach((e, i) => {
      e.index = i;
      e.chroma = chromaForPitches(e.pitches);
    });

    tempoMap.sort((a, b) => a.beat - b.beat);
    const dedupTempo = [];
    for (const t of tempoMap) {
      const last = dedupTempo[dedupTempo.length - 1];
      if (last && Math.abs(last.beat - t.beat) < EPS) last.bpm = t.bpm;
      else if (!last || last.bpm !== t.bpm) dedupTempo.push({ ...t });
    }
    if (!dedupTempo.length || dedupTempo[0].beat > EPS) dedupTempo.unshift({ beat: 0, bpm: dedupTempo.length ? dedupTempo[0].bpm : 100 });

    const result = {
      title,
      measures,
      playback,
      events,
      tempoMap: dedupTempo,
      baseTempo: dedupTempo[0].bpm,
      totalBeats,
    };
    for (const e of events) e.scoreTime = beatToScoreTime(result, e.beat);
    return result;
  }

  // 악보의 템포 지도에서 특정 박의 BPM (4분음표 기준)
  function tempoAt(score, beat) {
    let bpm = score.tempoMap[0].bpm;
    for (const t of score.tempoMap) {
      if (t.beat <= beat + EPS) bpm = t.bpm;
      else break;
    }
    return bpm;
  }

  // 박 위치 → 악보 템포대로 연주했을 때의 시각(초)
  function beatToScoreTime(score, beat) {
    let t = 0;
    const tm = score.tempoMap;
    for (let i = 0; i < tm.length; i++) {
      const from = tm[i].beat;
      if (from >= beat) break;
      const to = i + 1 < tm.length ? Math.min(tm[i + 1].beat, beat) : beat;
      t += ((to - from) * 60) / tm[i].bpm;
    }
    return t;
  }

  // 박 위치 → 연주 순서상의 마디 (이진 탐색)
  function playbackIndexAt(score, beat) {
    const pb = score.playback;
    if (!pb.length) return -1;
    if (beat <= 0) return 0;
    let lo = 0;
    let hi = pb.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pb[mid].startBeat <= beat + EPS) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  const api = { parseMusicXML, tempoAt, beatToScoreTime, playbackIndexAt, chromaForPitches, normalize, centerNormalize, unrollRepeats };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PT = Object.assign(root.PT || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
