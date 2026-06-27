import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(__dirname, '..', 'assets');
mkdirSync(ASSETS, { recursive: true });

const SITE = 'https://ebubesamuel.vercel.app';
const browser = await chromium.launch({ headless: true });

// ── 1. Portfolio site screenshots ──
const siteShots = [
  { name: 'home-hero.png', url: SITE },
  { name: 'home-projects-section.png', url: SITE },
  { name: 'projects-gallery.png', url: `${SITE}/projects` },
  { name: 'about-portfolio.png', url: `${SITE}/about` },
  { name: 'contact-page.png', url: `${SITE}/contact` },
];

for (const shot of siteShots) {
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(shot.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const path = resolve(ASSETS, shot.name);
    await page.screenshot({ path });
    console.log(`  ✓ ${shot.name}`);
    await ctx.close();
  } catch (err) {
    console.error(`  ✗ ${shot.name}: ${err.message}`);
  }
}

// ── 2. Full-page project screenshots ──
const fullShots = [
  { name: 'full-portfolio-home.png', url: SITE },
  { name: 'full-projects-page.png', url: `${SITE}/projects` },
  { name: 'full-about-page.png', url: `${SITE}/about` },
];

for (const shot of fullShots) {
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(shot.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const path = resolve(ASSETS, shot.name);
    await page.screenshot({ path, fullPage: true });
    console.log(`  ✓ ${shot.name}`);
    await ctx.close();
  } catch (err) {
    console.error(`  ✗ ${shot.name}: ${err.message}`);
  }
}

// ── 3. Code screenshots via HTML mockup ──
const codeHtml = (title, code) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1e1e1e;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:'Segoe UI','SF Mono',Consolas,monospace;padding:20px}
.window{border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);width:800px;background:#252526}
.titlebar{background:#3c3c3c;padding:12px 16px;display:flex;align-items:center;gap:8px}
.dots{display:flex;gap:6px}
.dot{width:12px;height:12px;border-radius:50%;background:#ff5f56}
.dot.y{background:#ffbd2e}
.dot.g{background:#27c93f}
.title-text{color:#ccc;font-size:13px;margin-left:12px}
.editor{background:#1e1e1e;padding:20px}
.line{display:flex;line-height:1.8;font-size:14px;font-family:'Consolas','SF Mono',monospace}
.ln{color:#858585;width:48px;text-align:right;padding-right:16px;user-select:none;flex-shrink:0}
.cd{flex:1;white-space:pre;color:#d4d4d4}
.kw{color:#c586c0} .str{color:#ce9178} .cm{color:#6a9955} .fn{color:#dcdcaa}
.pr{color:#9cdcfe} .num{color:#b5cea8}
</style></head><body><div class="window">
<div class="titlebar"><div class="dots"><div class="dot"></div><div class="dot y"></div><div class="dot g"></div></div><div class="title-text">${title}</div></div>
<div class="editor">${code}</div></div></body></html>`;

function L(n, c) {
  return `<div class="line"><span class="ln">${n}</span><span class="cd">${c}</span></div>`;
}

const codes = [
  { name: 'code-react-component.png', title: 'Hero.tsx', lines: [
    L(1, `<span class="kw">import</span> { motion } <span class="kw">from</span> <span class="str">"framer-motion"</span>`),
    L(2, `<span class="kw">import</span> Image <span class="kw">from</span> <span class="str">"next/image"</span>`),
    L(3, ``),
    L(4, `<span class="kw">export default function</span> <span class="fn">Hero</span>() {`),
    L(5, `  <span class="kw">return</span> (`),
    L(6, `    &lt;motion.section`),
    L(7, `      <span class="pr">initial</span>=<span class="str">{{ opacity: 0, y: 20 }}</span>`),
    L(8, `      <span class="pr">animate</span>=<span class="str">{{ opacity: 1, y: 0 }}</span>`),
    L(9, `      <span class="pr">className</span>=<span class="str">"flex flex-col items-center"</span>`),
    L(10, `    &gt;`),
    L(11, `      &lt;Image <span class="pr">src</span>=<span class="str">"/profile.jpg"</span>`),
    L(12, `        <span class="pr">alt</span>=<span class="str">"Ebube Samuel"</span> /&gt;`),
    L(13, `      &lt;h1&gt;Hi, I&apos;m Ebube&lt;/h1&gt;`),
    L(14, `    &lt;/motion.section&gt;`),
    L(15, `  )`),
    L(16, `}`),
  ]},
  { name: 'code-brand-system.png', title: 'brand.js', lines: [
    L(1, `<span class="cm">// Brand identity system</span>`),
    L(2, `<span class="kw">const</span> <span class="fn">brand</span> = {`),
    L(3, `  <span class="pr">primary</span>: <span class="str">"#4fc3f7"</span>,`),
    L(4, `  <span class="pr">secondary</span>: <span class="str">"#039be5"</span>,`),
    L(5, `  <span class="pr">accent</span>: <span class="str">"#f97316"</span>,`),
    L(6, `  <span class="pr">background</span>: <span class="str">"#0a0a0b"</span>,`),
    L(7, `  <span class="pr">surface</span>: <span class="str">"#161617"</span>,`),
    L(8, `  <span class="pr">foreground</span>: <span class="str">"#fafafa"</span>,`),
    L(9, `  <span class="pr">border</span>: <span class="str">"#27272a"</span>,`),
    L(10, `}`),
    L(11, `<span class="kw">export</span> { brand }`),
  ]},
  { name: 'code-workflow.png', title: 'automation.js', lines: [
    L(1, `<span class="cm">// Auto-post scheduler</span>`),
    L(2, `<span class="kw">const</span> <span class="fn">POST_HOURS</span> = [6, 8, 10, 12, 14, 16, 18, 20];`),
    L(3, ``),
    L(4, `<span class="kw">async function</span> <span class="fn">runScheduler</span>() {`),
    L(5, `  <span class="kw">const</span> hour = <span class="kw">new</span> <span class="fn">Date</span>().<span class="fn">getUTCHours</span>();`),
    L(6, `  <span class="kw">if</span> (<span class="fn">POST_HOURS</span>.<span class="fn">includes</span>(hour)) {`),
    L(7, `    <span class="kw">const</span> post = <span class="kw">await</span> <span class="fn">generatePost</span>();`),
    L(8, `    <span class="kw">await</span> <span class="fn">postTweet</span>(post.text, post.image);`),
    L(9, `  }`),
    L(10, `}`),
  ]},
];

for (const c of codes) {
  try {
    const html = codeHtml(c.title, c.lines.join('\n'));
    const tmp = resolve(ASSETS, `_tmp.html`);
    writeFileSync(tmp, html);
    const ctx = await browser.newContext({ viewport: { width: 900, height: 500 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`file://${tmp}`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(300);
    const el = page.locator('.window');
    const path = resolve(ASSETS, c.name);
    await el.screenshot({ path });
    console.log(`  ✓ ${c.name}`);
    await ctx.close();
  } catch (err) {
    console.error(`  ✗ ${c.name}: ${err.message}`);
  }
}

await browser.close();
console.log('\nAll captures done');
