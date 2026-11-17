import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args:['--no-sandbox'], defaultViewport:{width:1600,height:1000} });
const page = await browser.newPage();

async function readPluginNames() {
  return await page.evaluate(() => {
    const nav = document.querySelector('[data-testid="settings-nav"]');
    if (!nav) return { error: 'nav 未找到' };
    const items = [...nav.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean);
    return { lang: document.documentElement.lang, items };
  });
}

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
await page.click('[data-testid="settings-entry"]');
await new Promise(r => setTimeout(r, 1500));

console.log('=== 初始（应为 zh-CN + 中文插件名）===');
let r1 = await readPluginNames();
console.log('  lang:', r1.lang);
console.log('  导航项:', r1.items.join(' | '));
await page.screenshot({ path: 'qa/screenshots/fix-zh.png' });

// 切到 English
await page.click('[data-testid="settings-nav-general"]');
await new Promise(r => setTimeout(r, 800));
const enBtn = await page.$('[data-testid="language-en"]');
if (enBtn) {
  await enBtn.click();
  await new Promise(r => setTimeout(r, 3500));
  console.log('\n=== 切换到 English（应为 en + 英文插件名）===');
  let r2 = await readPluginNames();
  console.log('  lang:', r2.lang);
  console.log('  导航项:', r2.items.join(' | '));
  await page.screenshot({ path: 'qa/screenshots/fix-en.png' });

  // 切回中文
  const zhBtn = await page.$('[data-testid="language-zh-CN"]');
  if (zhBtn) {
    await zhBtn.click();
    await new Promise(r => setTimeout(r, 3500));
    console.log('\n=== 切回中文（应为 zh-CN + 中文插件名）===');
    let r3 = await readPluginNames();
    console.log('  lang:', r3.lang);
    console.log('  导航项:', r3.items.join(' | '));
    await page.screenshot({ path: 'qa/screenshots/fix-zh2.png' });
  }
}
await browser.close();
