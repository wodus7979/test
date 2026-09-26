// 브라우저 종단 테스트 (선택): 앱 설치 조건과 오프라인 동작 확인
//   - 크롬이 "설치 가능한 앱"으로 인정하는지 (매니페스트·아이콘·서비스 워커)
//   - 한 번 연 뒤에는 인터넷이 끊겨도 앱이 열리고 샘플 악보가 그려지는지
const assert = require('assert');
const { chromium } = require('playwright');
const { createServer } = require('./serve.js');

(async () => {
  const server = createServer().listen(0);
  const port = server.address().port;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${port}/index.html`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller);

    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    assert.deepStrictEqual(installabilityErrors, [], JSON.stringify(installabilityErrors));
    const manifest = await cdp.send('Page.getAppManifest');
    assert.deepStrictEqual(manifest.errors, []);
    console.log('✓ 설치 가능한 앱으로 인정됨');

    await context.setOffline(true);
    await page.reload();
    await page.click('#sample');
    await page.waitForFunction(() => window.app.score && window.app.view.pages.length > 0);
    const svgCount = await page.locator('.sheet svg').count();
    assert.ok(svgCount > 0);
    assert.deepStrictEqual(errors, []);
    console.log('✓ 오프라인에서도 앱이 열리고 악보가 그려짐');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
