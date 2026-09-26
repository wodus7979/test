// 데모용 샘플 악보(MusicXML)를 생성합니다.
// 베토벤 「환희의 송가」(퍼블릭 도메인) 주제와 세 개의 변주, 48마디, 피아노 2단 보표.
//   node tools/make-sample.js
// 결과: samples/ode-to-joy.musicxml, samples/sample-score.js
const fs = require('fs');
const path = require('path');

const DIV = 4; // divisions per quarter note

// 주제 멜로디: [음이름, 옥타브, 길이(4분음표=1)]
const THEME = [
  [['E', 4, 1], ['E', 4, 1], ['F', 4, 1], ['G', 4, 1]],
  [['G', 4, 1], ['F', 4, 1], ['E', 4, 1], ['D', 4, 1]],
  [['C', 4, 1], ['C', 4, 1], ['D', 4, 1], ['E', 4, 1]],
  [['E', 4, 1.5], ['D', 4, 0.5], ['D', 4, 2]],
  [['E', 4, 1], ['E', 4, 1], ['F', 4, 1], ['G', 4, 1]],
  [['G', 4, 1], ['F', 4, 1], ['E', 4, 1], ['D', 4, 1]],
  [['C', 4, 1], ['C', 4, 1], ['D', 4, 1], ['E', 4, 1]],
  [['D', 4, 1.5], ['C', 4, 0.5], ['C', 4, 2]],
  [['D', 4, 1], ['D', 4, 1], ['E', 4, 1], ['C', 4, 1]],
  [['D', 4, 1], ['E', 4, 0.5], ['F', 4, 0.5], ['E', 4, 1], ['C', 4, 1]],
  [['D', 4, 1], ['E', 4, 0.5], ['F', 4, 0.5], ['E', 4, 1], ['D', 4, 1]],
  [['C', 4, 1], ['D', 4, 1], ['G', 3, 2]],
  [['E', 4, 1], ['E', 4, 1], ['F', 4, 1], ['G', 4, 1]],
  [['G', 4, 1], ['F', 4, 1], ['E', 4, 1], ['D', 4, 1]],
  [['C', 4, 1], ['C', 4, 1], ['D', 4, 1], ['E', 4, 1]],
  [['D', 4, 1.5], ['C', 4, 0.5], ['C', 4, 2]],
];

// 마디별 화성 (왼손 반주용): 근음, 3음, 5음
const CHORDS = {
  C: [['C', 3], ['E', 3], ['G', 3]],
  G: [['G', 2], ['B', 2], ['D', 3]],
  F: [['F', 2], ['A', 2], ['C', 3]],
};
const HARMONY = ['C', 'G', 'C', 'G', 'C', 'G', 'C', 'C', 'G', 'C', 'G', 'G', 'C', 'G', 'F', 'C'];

const TYPES = { 4: 'whole', 3: 'half', 2: 'half', 1.5: 'quarter', 1: 'quarter', 0.5: 'eighth' };
const DOTTED = new Set([3, 1.5]);

function note({ step, octave, dur, staff, voice, chord = false, stem }) {
  const d = Math.round(dur * DIV);
  return [
    '<note>',
    chord ? '<chord/>' : '',
    `<pitch><step>${step}</step><octave>${octave}</octave></pitch>`,
    `<duration>${d}</duration>`,
    `<voice>${voice}</voice>`,
    `<type>${TYPES[dur]}</type>`,
    DOTTED.has(dur) ? '<dot/>' : '',
    stem ? `<stem>${stem}</stem>` : '',
    `<staff>${staff}</staff>`,
    '</note>',
  ].join('');
}

function up(octaveShift, notes) {
  return notes.map(([s, o, d]) => [s, o + octaveShift, d]);
}

// 오른손: 변주마다 조금씩 다르게
function rightHand(variation, m) {
  const mel = THEME[m];
  if (variation === 0) return mel.map(([s, o, d]) => note({ step: s, octave: o, dur: d, staff: 1, voice: 1 }));
  if (variation === 1) return mel.map(([s, o, d]) => note({ step: s, octave: o, dur: d, staff: 1, voice: 1 }));
  if (variation === 2) {
    // 멜로디 + 3도 아래 화음 (단순히 같은 화성의 음을 덧붙임)
    const out = [];
    for (const [s, o, d] of mel) {
      out.push(note({ step: s, octave: o + 1, dur: d, staff: 1, voice: 1 }));
      out.push(note({ step: s, octave: o, dur: d, staff: 1, voice: 1, chord: true }));
    }
    return out;
  }
  return up(1, mel).map(([s, o, d]) => note({ step: s, octave: o, dur: d, staff: 1, voice: 1 }));
}

// 왼손: 변주마다 다른 반주형
function leftHand(variation, m) {
  const ch = CHORDS[HARMONY[m]];
  const [root, third, fifth] = ch;
  const out = [];
  if (variation === 0) {
    out.push(note({ step: root[0], octave: root[1], dur: 4, staff: 2, voice: 5 }));
    out.push(note({ step: fifth[0], octave: fifth[1], dur: 4, staff: 2, voice: 5, chord: true }));
  } else if (variation === 1) {
    out.push(note({ step: root[0], octave: root[1], dur: 2, staff: 2, voice: 5 }));
    out.push(note({ step: third[0], octave: third[1], dur: 2, staff: 2, voice: 5, chord: true }));
    out.push(note({ step: fifth[0], octave: fifth[1], dur: 2, staff: 2, voice: 5 }));
    out.push(note({ step: third[0], octave: third[1], dur: 2, staff: 2, voice: 5, chord: true }));
  } else {
    for (const [s, o] of [root, fifth, third, fifth]) out.push(note({ step: s, octave: o, dur: 1, staff: 2, voice: 5 }));
  }
  return out;
}

const TITLES = ['주제 (Theme)', '변주 1', '변주 2', '변주 3'];
const measures = [];
let number = 1;
for (let v = 0; v < 4; v++) {
  for (let m = 0; m < 16; m++) {
    const parts = [`<measure number="${number}">`];
    if (number === 1) {
      parts.push(
        '<attributes><divisions>4</divisions><key><fifths>0</fifths></key>',
        '<time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>',
        '<clef number="1"><sign>G</sign><line>2</line></clef>',
        '<clef number="2"><sign>F</sign><line>4</line></clef></attributes>',
        '<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>',
        '<per-minute>100</per-minute></metronome></direction-type><staff>1</staff><sound tempo="100"/></direction>'
      );
    }
    if (m === 0) {
      parts.push(
        `<direction placement="above"><direction-type><words font-weight="bold">${TITLES[v]}</words></direction-type><staff>1</staff></direction>`
      );
    }
    parts.push(...rightHand(v, m));
    parts.push(`<backup><duration>${4 * DIV}</duration></backup>`);
    parts.push(...leftHand(v, m));
    if (number === 64) parts.push('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
    parts.push('</measure>');
    measures.push(parts.join('\n'));
    number++;
  }
}

const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
<work><work-title>환희의 송가 — 주제와 변주 (데모)</work-title></work>
<identification><creator type="composer">L. v. Beethoven (arr. demo)</creator></identification>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">
${measures.join('\n')}
</part>
</score-partwise>
`;

const outDir = path.join(__dirname, '..', 'samples');
fs.writeFileSync(path.join(outDir, 'ode-to-joy.musicxml'), xml);
fs.writeFileSync(
  path.join(outDir, 'sample-score.js'),
  '// 자동 생성 파일 (tools/make-sample.js). file:// 로 열어도 샘플을 불러올 수 있도록 JS 문자열로 포함합니다.\n' +
    'window.SAMPLE_SCORE = ' + JSON.stringify(xml) + ';\n'
);
console.log('wrote', measures.length, 'measures');
