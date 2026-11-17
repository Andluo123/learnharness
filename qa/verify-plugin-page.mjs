import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args:['--no-sandbox'], defaultViewport:{width:1600,height:1000} });
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
await page.click('[data-testid="settings-entry"]');
await new Promise(r => setTimeout(r, 1500));

// 点进每个插件设置页看标题
for (const [id, expectZh] of [['core-plugins','核心插件'],['plugins','社区插件']]) {
  const btn = await page.$(`[data-testid="settings-nav-${id}"]`);
  if (btn) { await btn.click(); await new Promise(r => setTimeout(r, 900)); }
}

// 逐个插件页
const pluginIds = ['flashcards','coding-questions','drawing-pad','rich-code-blocks'];
console.log('=== 插件设置页标题（中文）===');
for (const pid of pluginIds) {
  const btn = await page.$(`[data-testid="settings-nav-plugin:${pid}"]`);
  if (!btn) { console.log(`  ${pid}: 导航项未找到`); continue; }
  await btn.click();
  await new Promise(r => setTimeout(r, 900));
  const title = await page.evaluate(() => {
    const sec = document.querySelector('[data-testid^="section-plugin-"]');
    return sec?.querySelector('h2, h3, .settings-section-title, p')?.textContent?.trim()
      || sec?.textContent?.trim().slice(0, 40) || '(空)';
  });
  console.log(`  ${pid.padEnd(18)} → ${title}`);
}
await page.screenshot({ path: 'qa/screenshots/fix-plugin-page.png' });
await browser.close();
