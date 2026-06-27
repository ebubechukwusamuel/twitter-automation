import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(__dirname, '..', 'assets');
mkdirSync(ASSETS, { recursive: true });

const SITE = 'https://ebubesamuel.vercel.app';
const browser = await chromium.launch({ headless: true });

// ── 1. Project detail pages ──
const slugs = ['kredo', 'spyglass', 'flowtrack', 'twitter-automation', 'mazion-brand'];

for (const slug of slugs) {
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`${SITE}/projects/${slug}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const path = resolve(ASSETS, `project-${slug}.png`);
    await page.screenshot({ path });
    console.log(`  ✓ project-${slug}.png`);
    await ctx.close();
  } catch (err) {
    console.error(`  ✗ project-${slug}: ${err.message}`);
  }
}

// ── 2. Full-page captures ──
const fullSlugs = ['spyglass', 'flowtrack', 'mazion-brand'];
for (const slug of fullSlugs) {
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`${SITE}/projects/${slug}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const path = resolve(ASSETS, `full-project-${slug}.png`);
    await page.screenshot({ path, fullPage: true });
    console.log(`  ✓ full-project-${slug}.png`);
    await ctx.close();
  } catch (err) {
    console.error(`  ✗ full-project-${slug}: ${err.message}`);
  }
}

// ── 3. Mobile viewport screenshots ──
const mobilePages = [
  { name: 'mobile-home.png', url: SITE },
  { name: 'mobile-projects.png', url: `${SITE}/projects` },
  { name: 'mobile-about.png', url: `${SITE}/about` },
];

for (const p of mobilePages) {
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const page = await ctx.newPage();
    await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const path = resolve(ASSETS, p.name);
    await page.screenshot({ path });
    console.log(`  ✓ ${p.name}`);
    await ctx.close();
  } catch (err) {
    console.error(`  ✗ ${p.name}: ${err.message}`);
  }
}

// ── 4. More code screenshots ──
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
.pr{color:#9cdcfe} .num{color:#b5cea8} .tag{color:#569cd6} .at{color:#9cdcfe} .val{color:#ce9178}
</style></head><body><div class="window">
<div class="titlebar"><div class="dots"><div class="dot"></div><div class="dot y"></div><div class="dot g"></div></div><div class="title-text">${title}</div></div>
<div class="editor">${code}</div></div></body></html>`;

function L(n, c) {
  return `<div class="line"><span class="ln">${n}</span><span class="cd">${c}</span></div>`;
}

const codes = [
  {
    name: 'code-tailwind.png', title: 'globals.css',
    lines: [
      L(1, `<span class="cm">/* Tailwind theme config */</span>`),
      L(2, `<span class="pr">@theme</span> {`),
      L(3, `  --color-accent: <span class="str">#4fc3f7</span>;`),
      L(4, `  --color-surface: <span class="str">#161617</span>;`),
      L(5, `  --color-muted: <span class="str">#a1a1aa</span>;`),
      L(6, `  --color-border: <span class="str">#27272a</span>;`),
      L(7, `  --font-inter: <span class="str">"Inter"</span>, sans-serif;`),
      L(8, `  --font-montserrat: <span class="str">"Montserrat"</span>, sans-serif;`),
      L(9, `}`),
    ],
  },
  {
    name: 'code-project-data.png', title: 'projects.ts',
    lines: [
      L(1, `<span class="kw">const</span> projects = [`),
      L(2, `  {`),
      L(3, `    <span class="pr">slug</span>: <span class="str">"kredo"</span>,`),
      L(4, `    <span class="pr">title</span>: <span class="str">"Kredo"</span>,`),
      L(5, `    <span class="pr">category</span>: <span class="str">"dev"</span>,`),
      L(6, `    <span class="pr">tags</span>: [<span class="str">"Next.js"</span>, <span class="str">"TypeScript"</span>, <span class="str">"PostgreSQL"</span>],`),
      L(7, `    <span class="pr">description</span>: <span class="str">"All-in-one freelancer OS"</span>,`),
      L(8, `  },`),
      L(9, `  {`),
      L(10, `    <span class="pr">slug</span>: <span class="str">"spyglass"</span>,`),
      L(11, `    <span class="pr">title</span>: <span class="str">"Spyglass"</span>,`),
      L(12, `    <span class="pr">category</span>: <span class="str">"dev"</span>,`),
      L(13, `  },`),
      L(14, `];`),
    ],
  },
  {
    name: 'code-api-route.png', title: 'route.ts',
    lines: [
      L(1, `<span class="kw">export async function</span> <span class="fn">POST</span>(req: Request) {`),
      L(2, `  <span class="kw">const</span> { name, email, message } = <span class="kw">await</span> req.<span class="fn">json</span>();`),
      L(3, ``),
      L(4, `  <span class="kw">const</span> html = <span class="fn">notificationEmail</span>(name, email, message);`),
      L(5, `  <span class="kw">await</span> <span class="fn">sendMail</span>({ <span class="pr">to</span>: OWNER, <span class="pr">subject</span>, <span class="pr">html</span> });`),
      L(6, `  <span class="kw">await</span> <span class="fn">sendMail</span>({ <span class="pr">to</span>: email, <span class="pr">subject</span>: autoSubject, <span class="pr">html</span>: autoHtml });`),
      L(7, `  <span class="kw">await</span> <span class="fn">appendToSheet</span>(<span class="str">"Messages"</span>, [timestamp, name, email, message]);`),
      L(8, ``),
      L(9, `  <span class="kw">return</span> <span class="fn">NextResponse</span>.<span class="fn">json</span>({ <span class="pr">success</span>: <span class="kw">true</span> });`),
      L(10, `}`),
    ],
  },
  {
    name: 'code-database.png', title: 'schema.prisma',
    lines: [
      L(1, `<span class="kw">model</span> <span class="fn">Project</span> {`),
      L(2, `  <span class="pr">id</span>        String   <span class="pr">@id</span> <span class="pr">@default</span>(<span class="fn">cuid</span>())`),
      L(3, `  <span class="pr">title</span>     String`),
      L(4, `  <span class="pr">slug</span>      String   <span class="pr">@unique</span>`),
      L(5, `  <span class="pr">category</span>  String`),
      L(6, `  <span class="pr">tags</span>      String[]`),
      L(7, `  <span class="pr">createdAt</span> DateTime <span class="pr">@default</span>(<span class="fn">now</span>())`),
      L(8, `  <span class="pr">updatedAt</span> DateTime <span class="pr">@updatedAt</span>`),
      L(9, `}`),
    ],
  },
];

for (const c of codes) {
  try {
    const html = codeHtml(c.title, c.lines.join('\n'));
    const tmp = resolve(ASSETS, '_tmp.html');
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
console.log('\nAll extra captures done');
