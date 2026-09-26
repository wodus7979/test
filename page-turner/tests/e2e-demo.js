// 브라우저 종단 테스트 (선택):  npm run test:e2e
// 헤드리스 크롬에서 샘플 악보를 불러오고 데모 연주를 틀어,
// 실제 오디오 분석 → 위치 추적 → 자동 페이지 넘김이 연주를 제대로 따라가는지 확인합니다.
const assert = require('assert');
const { chromium } = require('playwright');
const { createServer } = require('./serve.js');

(async () => {
  const server = createServer().listen(0);
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${port}/index.html`);
    await page.click('#sample');
    await page.waitForFunction(() => window.app.score && window.app.view.pages.length > 1);
    const boundaries = await page.evaluate(() => {
      const a = window.app;
      return a.view.pages.map((p) => a.score.playback.find((b) => b.measureIndex === p.firstMeasure).startBeat);
    });
    await page.evaluate(() => {
      document.getElementById('demoSound').checked = false;
      document.getElementById('demoSpeed').value = '1.2';
      document.getElementById('rubato').checked = true;
    });
    await page.click('#demo');

    const samples = [];
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(500);
      samples.push(
        await page.evaluate(() => {
          const a = window.app;
          const t = a.ctx.currentTime;
          let truth = 0; // 데모가 실제로 마지막에 친 음의 박
          for (const e of a.score.events) {
            if (a.player._perfTime(e.scoreTime) <= t) truth = e.beat;
            else break;
          }
          return { beat: a.snap.beat, truth, page: a.view.page };
        })
      );
    }

    const worst = Math.max(...samples.map((s) => Math.abs(s.beat - s.truth)));
    console.log(`추적 오차 최대 ${worst.toFixed(2)}박`);
    assert.ok(worst < 3, '연주 위치를 놓쳤습니다');

    // 페이지가 넘어간 순간의 실제 연주 위치는 다음 페이지 시작 직전(미리 넘기기 2박 전후)이어야 함
    let prev = 0;
    let turns = 0;
    for (const s of samples) {
      if (s.page !== prev) {
        const boundary = boundaries[s.page];
        console.log(`페이지 ${prev + 1}→${s.page + 1}: 실제 위치 ${s.truth}박 (페이지 경계 ${boundary}박)`);
        assert.strictEqual(s.page, prev + 1);
        assert.ok(boundary - s.truth <= 4 && boundary - s.truth >= 0, '넘김 시점이 어긋났습니다');
        prev = s.page;
        turns++;
      }
    }
    assert.ok(turns >= 1, '페이지가 넘어가지 않았습니다');
    assert.deepStrictEqual(errors, []);
    console.log('✓ 종단 테스트 통과');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
