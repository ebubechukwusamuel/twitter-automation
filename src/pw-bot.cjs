const { execSync } = require('child_process');
const { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } = require('fs');
const { resolve } = require('path');
const Groq = require('groq-sdk');

const STATE_FILE = resolve(__dirname, '..', 'state.json');
const PW_SCRIPT = resolve(__dirname, '..', 'scripts', '_pw-run.js');
const ASSETS_DIR = resolve(__dirname, '..', 'assets');
const POST_HOURS = [6, 8, 10, 12, 14, 16, 18, 20];
const SESSION_ID = '1';
const BASE = 'https://x.com';

const ENGAGEMENT_KEYWORDS = ['tech twitter','software engineering','web development','product design','startup life','coding','founder','SaaS','frontend','UI design','building in public','programming','building products','tech career','developer','business','entrepreneurship','startups','small business','branding','marketing','growth hacking','productivity','innovation','AI','design','freelancing','remote work','digital nomad','venture capital','fundraising','tech companies','SME','Nigeria tech','African startups'];

const TARGET_ACCOUNTS = ['levelsio','shadcn','rauchg','dan_abramov','acdlite','steventey','devtools_fm','sundarpichai','elonmusk','naval','jackbutcher','mxstbr','leerob','bitandbang','swyx','t3dotgg','hhg_','framer','tailwindcss','vercel','nextjs','reactjs','figmadesign'];

const PROJECT_KEYWORDS = [
  { names: ['flowtrack', 'flowstarck'], file: 'project-flowtrack.png' },
  { names: ['kredo'], file: 'project-kredo.png' },
  { names: ['spyglass'], file: 'project-spyglass.png' },
  { names: ['twitter', 'automation', 'bot'], file: 'project-twitter-automation.png' },
  { names: ['mazion', 'brand identity'], file: 'project-mazion-brand.png' },
];

function loadEnv() {
  const env = {};
  const envPath = resolve(__dirname, '..', '.env.local');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      const [key, ...rest] = line.split('=');
      env[key.trim()] = rest.join('=').trim();
    }
  }
  return env;
}

function loadState() {
  if (!existsSync(STATE_FILE)) return { posted: [], engaged: [], lastEngage: null, repliedTo: [], repliedUsers: [] };
  return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
}

function pw(jsCode) {
  const tmpFile = resolve(__dirname, '..', 'scripts', `_pw_tmp_${Date.now()}.js`);
  writeFileSync(tmpFile, jsCode, 'utf-8');
  try {
    const output = execSync(`playwriter -s ${SESSION_ID} -f "${tmpFile}"`, {
      cwd: resolve(__dirname, '..'),
      timeout: 60000,
      encoding: 'utf-8',
      env: { ...process.env },
    });
    return output;
  } finally {
    try { require('fs').rmSync(tmpFile, { force: true }); } catch {}
  }
}

async function main() {
  const state = loadState();
  const mode = process.argv[2] || 'both';
  const env = loadEnv();
  const groq = new Groq({ apiKey: env.GROQ_API_KEY });
  const username = (env.TWITTER_USERNAME || '').replace('@', '');

  console.log(`Mode: ${mode}`);
  console.log(`Tweets posted so far: ${state.posted.length}`);
  console.log(`Tweets engaged with: ${state.engaged.length}`);

  const currentHour = new Date().getUTCHours();
  const shouldPost = POST_HOURS.includes(currentHour) && (mode === 'post' || mode === 'both');
  const shouldEngage = currentHour % 2 === 0 || mode === 'engage';

  if (shouldPost) {
    const withImage = Math.random() < 0.6;
    console.log(`Rolled: ${withImage ? 'image' : 'text-only'} post`);

    const aiPrompt = `You are Ebube (Ebubechukwu Samuel), a freelance designer & developer. Tweet about what you're ACTUALLY building — real projects, real code, real design work. Your tweets are casual, conversational, and authentic. Natural language, occasional abbreviations. No hashtags. No emojis.

Real projects you've built: Flowtrack (project management web app), Kredo (freelancer OS), Spyglass (CLI codebase RAG tool), Portfolio (ebubesamuel.vercel.app), LinkedIn Optimizer (n8n automation), Twitter Automation (this bot).

Rules:
- Keep it under 200 characters
- Mention the specific project name if possible
- Ask a question or share a lesson learned
- Sound like a real person, not a marketing bot
${withImage ? `- End with IMAGE_TYPE: project|code|design|mobile|general` : ''}
- End with MATCH: <project name if mentioned, otherwise 'none'>
- Output ONLY the tweet text followed by the IMAGE_TYPE and MATCH lines`;

    let text = '';
    let imageType = '';
    let projectMatch = '';
    try {
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: aiPrompt }],
        model: 'llama-3.3-70b-versatile',
        temperature: 1.0,
      });
      const raw = completion.choices[0]?.message?.content || '';
      const lines = raw.trim().split('\n').filter(Boolean);
      text = lines.filter(l => !l.startsWith('IMAGE_TYPE:') && !l.startsWith('MATCH:')).join('\n').trim();
      imageType = lines.find(l => l.startsWith('IMAGE_TYPE:'))?.split(':')[1]?.trim() || '';
      projectMatch = lines.find(l => l.startsWith('MATCH:'))?.split(':')[1]?.trim() || '';
    } catch (err) {
      console.error('AI generate failed:', err.message);
      text = `Currently building ${['Flowtrack', 'Kredo', 'Spyglass'][Math.floor(Math.random() * 3)]} — learning a ton about what actually matters in SaaS. What's one tool you wish existed but doesn't?`;
    }

    if (!text) {
      const fallbacks = [
        "Currently building Flowtrack — learning a ton about what actually matters in SaaS. What's one tool you wish existed but doesn't?",
        "Just shipped a new feature for Kredo. The amount of hidden complexity in invoicing alone is wild. Building in public really changes how you think about code quality.",
        "Working on making my CLI tool Spyglass actually useful. RAG is cool but the UX of CLI tools is what makes or breaks adoption.",
      ];
      text = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    console.log('Generated:', text.substring(0, 80) + '...');
    console.log('Image type:', imageType, 'Match:', projectMatch);

    let imagePath = null;
    if (withImage && existsSync(ASSETS_DIR)) {
      const files = readdirSync(ASSETS_DIR).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
      if (files.length > 0) {
        const textLower = text.toLowerCase();
        let matchedFile = null;
        for (const entry of PROJECT_KEYWORDS) {
          if (entry.names.some(n => textLower.includes(n))) {
            if (files.includes(entry.file)) { matchedFile = entry.file; break; }
          }
        }
        if (!matchedFile && projectMatch && projectMatch !== 'none') {
          for (const entry of PROJECT_KEYWORDS) {
            if (entry.names.includes(projectMatch.toLowerCase()) && files.includes(entry.file)) {
              matchedFile = entry.file; break;
            }
          }
        }
        if (!matchedFile) {
          const categories = {
            project: files.filter(f => f.startsWith('project-') || f.startsWith('full-project-')),
            code: files.filter(f => f.startsWith('code-')),
            design: files.filter(f => f.startsWith('about-') || f.startsWith('full-about')),
            mobile: files.filter(f => f.startsWith('mobile-')),
            general: files.filter(f => !f.startsWith('project-') && !f.startsWith('full-project-') && !f.startsWith('code-') && !f.startsWith('about-') && !f.startsWith('full-about') && !f.startsWith('mobile-')),
          };
          const pool = (imageType && categories[imageType]?.length > 0) ? categories[imageType] : files;
          matchedFile = pool[Math.floor(Math.random() * pool.length)];
        }
        imagePath = resolve(ASSETS_DIR, matchedFile).replace(/\\/g, '/');
      }
    }
    console.log('Image:', imagePath || 'none');

    // Post tweet via playwriter
    const postScript = `
const fs = require('node:fs');
const path = require('node:path');

async function run() {
  let p = context.pages().find(x => x.url().includes('x.com'));
  if (!p) { p = context.pages().find(x => x.url() === 'about:blank') ?? (await context.newPage()); await p.goto('${BASE}', { waitUntil: 'domcontentloaded', timeout: 30000 }); }
  await p.goto('${BASE}/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  const postBtn = p.locator('a[data-testid="SideNav_NewTweet_Button"]');
  await postBtn.waitFor({ state: 'visible', timeout: 15000 });
  await postBtn.click();
  await new Promise(r => setTimeout(r, 3000));

  ${imagePath ? `
  if (fs.existsSync('${imagePath}')) {
    const fileInput = p.locator('input[type="file"]');
    if (await fileInput.count() > 0) { await fileInput.setInputFiles('${imagePath}'); await new Promise(r => setTimeout(r, 2000)); }
    else {
      const mediaBtn = p.locator('button[data-testid="attachmentsButton"]');
      if (await mediaBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await mediaBtn.click(); await new Promise(r => setTimeout(r, 1500));
        const fi2 = p.locator('input[type="file"]');
        if (await fi2.count() > 0) { await fi2.setInputFiles('${imagePath}'); await new Promise(r => setTimeout(r, 2000)); }
      }
    }
  }
  ` : ''}

  const tweetBox = p.locator('div[data-testid="tweetTextarea_0"]');
  await tweetBox.click();
  await new Promise(r => setTimeout(r, 500));
  await tweetBox.fill('');
  await p.keyboard.type(${JSON.stringify(text)}, { delay: 20 });
  await new Promise(r => setTimeout(r, 1500));

  const submitBtn = p.locator('button[data-testid="tweetButtonInline"]').first();
  if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await submitBtn.click(); }
  else { await p.keyboard.press('Control+Enter'); }
  await new Promise(r => setTimeout(r, 4000));
  console.log('Post submitted');
}
run().catch(e => { console.error('Post failed:', e.message); process.exit(1); });
`;
    const postOutput = pw(postScript);
    console.log('Post output:', postOutput.trim());
    state.posted.push({ text: text.substring(0, 80), image: imagePath, date: new Date().toISOString() });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } else {
    console.log(`Skipping post — UTC hour ${currentHour} not in posting schedule`);
  }

  if (shouldEngage && (mode === 'engage' || mode === 'both')) {
    console.log('Starting engage...');
    const engageScript = `
async function run() {
  let p = context.pages().find(x => x.url().includes('x.com'));
  if (!p) { p = context.pages().find(x => x.url() === 'about:blank') ?? (await context.newPage()); await p.goto('${BASE}', { waitUntil: 'domcontentloaded', timeout: 30000 }); }

  const keywords = ${JSON.stringify(ENGAGEMENT_KEYWORDS)};
  const kw = keywords[Math.floor(Math.random() * keywords.length)];
  console.log('Searching:', kw);

  await p.goto('${BASE}/search?q=' + encodeURIComponent(kw) + '&src=typed_query', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  const tweets = p.locator('article[data-testid="tweet"]');
  const count = await tweets.count();
  console.log('Found', count, 'tweets');
  let engaged = 0;

  for (let i = 0; i < count && engaged < 2; i++) {
    const t = tweets.nth(i);
    const txt = await t.locator('div[data-testid="tweetText"]').innerText().catch(() => '');
    if (!txt || txt.length < 10 || txt.split(/\\s+/).length < 3) continue;

    const link = await t.locator('a[href*="/status/"]').first().getAttribute('href').catch(() => '');
    const tid = link?.split('/status/')[1]?.split('?')[0];
    if (!tid) continue;
    const state = JSON.parse(fs.readFileSync('${STATE_FILE.replace(/\\/g, '/')}', 'utf-8'));
    if (state.engaged?.includes(tid)) continue;

    const likeBtn = t.locator('button[data-testid="like"]');
    if (await likeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      const liked = await likeBtn.getAttribute('aria-label').catch(() => '');
      if (liked && !liked.includes('Unlike')) {
        await likeBtn.click(); await new Promise(r => setTimeout(r, 1500));
        if (!state.engaged) state.engaged = [];
        state.engaged.push(tid);
        fs.writeFileSync('${STATE_FILE.replace(/\\/g, '/')}', JSON.stringify(state, null, 2));
        engaged++;
        console.log('Liked:', tid);
      }
    }

    if (engaged >= 2) break;
  }
  console.log('Engaged with', engaged, 'tweets');
}
run().catch(e => { console.error('Engage failed:', e.message); });
`;
    const engageOutput = pw(engageScript);
    console.log('Engage output:', engageOutput.trim());
    state.lastEngage = new Date().toISOString();
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }

  // Cleanup duplicate replies (one-time)
  if (!state.cleanupDone) {
    console.log('Cleaning up duplicate replies...');
    const cleanupScript = `
const fs = require('node:fs');
async function run() {
  let p = context.pages().find(x => x.url().includes('x.com'));
  if (!p) { p = context.pages().find(x => x.url() === 'about:blank') ?? (await context.newPage()); await p.goto('${BASE}', { waitUntil: 'domcontentloaded', timeout: 30000 }); }

  await p.goto('${BASE}/ebubechukwu_sam', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  // Scroll to load more tweets
  for (let s = 0; s < 8; s++) { await p.evaluate(() => window.scrollBy(0, 800)); await new Promise(r => setTimeout(r, 2000)); }

  const allTweets = p.locator('article[data-testid="tweet"]');
  const tweetCount = await allTweets.count();
  console.log('Profile tweets loaded:', tweetCount);

  // Group bot's replies by target user
  const byTarget = {};

  for (let i = 0; i < tweetCount; i++) {
    const tw = allTweets.nth(i);

    // Check if this is a reply from the bot
    const isReply = await tw.locator('[data-testid="reply-indicator"]').isVisible({ timeout: 500 }).catch(() => false);
    if (!isReply) continue;

    const replyToText = await tw.locator('span:has-text("Replying to")').innerText().catch(() => '');
    const targetMatch = replyToText.match(/@(\\w+)/);
    if (!targetMatch || targetMatch[1] === 'ebubechukwu_sam') continue;

    const target = targetMatch[1];
    const link = await tw.locator('a[href*="/status/"]').first().getAttribute('href').catch(() => '');
    const tid = link?.split('/status/')[1]?.split('?')[0];
    if (!tid) continue;

    if (!byTarget[target]) byTarget[target] = [];
    byTarget[target].push({ tweetId: tid, index: i });
    console.log('Reply to @' + target + ': ' + tid);
  }

  // Load state
  const statePath = '${STATE_FILE.replace(/\\/g, '/')}';
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  if (!state.repliedUsers) state.repliedUsers = [];
  let deleted = 0;

  // Delete duplicate replies — keep first, delete rest
  for (const [target, replies] of Object.entries(byTarget)) {
    if (replies.length <= 1) continue;
    console.log('@' + target + ' has ' + replies.length + ' replies, keeping 1...');

    // Add target to repliedUsers so we never reply again
    if (!state.repliedUsers.includes(target)) state.repliedUsers.push(target);

    // Delete extras (keep replies[0], delete replies[1..n])
    for (let k = 1; k < replies.length; k++) {
      const { tweetId } = replies[k];
      console.log('Deleting reply to @' + target + ': ' + tweetId);

      // Navigate to the tweet
      await p.goto('${BASE}/ebubechukwu_sam/status/' + tweetId, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 3000));

      // Click more menu
      const moreBtn = p.locator('button[data-testid="caret"]').first();
      if (await moreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await moreBtn.click();
        await new Promise(r => setTimeout(r, 1500));

        // Click Delete
        const deleteBtn = p.locator('button[data-testid="delete"]');
        if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await deleteBtn.click();
          await new Promise(r => setTimeout(r, 1500));

          // Confirm
          const confirmBtn = p.locator('button[data-testid="confirmationSheetConfirm"]');
          if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await confirmBtn.click();
            await new Promise(r => setTimeout(r, 2000));
            deleted++;
            console.log('Deleted reply to @' + target + ': ' + tweetId);
          }
        }
      }
    }
  }

  state.cleanupDone = true;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log('Deleted ' + deleted + ' duplicate replies');
}
run().catch(e => { console.error('Cleanup failed:', e.message); });
`;
    const cleanupOutput = pw(cleanupScript);
    console.log('Cleanup output:', cleanupOutput.trim());
    state.cleanupDone = true;
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }

  // Reply to mentions
  console.log('Checking mentions...');
  const replyScript = `
const fs = require('node:fs');
async function run() {
  let p = context.pages().find(x => x.url().includes('x.com'));
  if (!p) { p = context.pages().find(x => x.url() === 'about:blank') ?? (await context.newPage()); await p.goto('${BASE}', { waitUntil: 'domcontentloaded', timeout: 30000 }); }

  // Check notifications
  await p.goto('${BASE}/notifications', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  const state = JSON.parse(fs.readFileSync('${STATE_FILE.replace(/\\/g, '/')}', 'utf-8'));
  if (!state.repliedTo) state.repliedTo = [];
  if (!state.repliedUsers) state.repliedUsers = [];
  let replied = 0;

  const mentions = p.locator('article[data-testid="tweet"]');
  const mcount = await mentions.count();
  console.log('Mentions found:', mcount);

  for (let i = 0; i < mcount && replied < 3; i++) {
    const t = mentions.nth(i);
    const link = await t.locator('a[href*="/status/"]').first().getAttribute('href').catch(() => '');
    const tid = link?.split('/status/')[1]?.split('?')[0];
    if (!tid || state.repliedTo.includes(tid)) continue;

    const authorLink = await t.locator('div[data-testid="User-Name"] a').first().getAttribute('href').catch(() => '');
    const author = authorLink.replace('/', '').replace('@', '');
    if (!author || author === 'ebubechukwu_sam') continue;
    if (state.repliedUsers.includes(author)) { console.log('Already replied to @' + author); state.repliedTo.push(tid); continue; }

    const txt = await t.locator('div[data-testid="tweetText"]').innerText().catch(() => '');
    if (!txt || txt.length < 5) continue;

    const replyBtn = t.locator('button[data-testid="reply"]');
    if (!(await replyBtn.isVisible({ timeout: 2000 }).catch(() => false))) continue;
    await replyBtn.click();
    await new Promise(r => setTimeout(r, 2000));

    const replyArea = p.locator('div[data-testid="tweetTextarea_0"]');
    if (!(await replyArea.isVisible({ timeout: 3000 }).catch(() => false))) { state.repliedTo.push(tid); continue; }

    // AI reply via fetch to Groq
    const groqKey = '${env.GROQ_API_KEY}';
    const replyResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + groqKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are Ebube, a freelance designer & developer. Reply to this tweet comment naturally, conversationally. 1-2 sentences max. No emojis, no hashtags. Be helpful or add to the discussion.' },
          { role: 'user', content: 'Someone commented: "' + txt.substring(0, 200) + '". Reply as Ebube:' }
        ],
        temperature: 0.8,
      }),
    });
    const replyData = await replyResp.json();
    let replyText = replyData.choices?.[0]?.message?.content?.trim() || '';
    replyText = replyText.replace(/^["']|["']$/g, '').trim();
    if (!replyText || replyText.length < 2) { state.repliedTo.push(tid); continue; }

    await replyArea.click();
    await p.keyboard.type(replyText, { delay: 20 });
    await new Promise(r => setTimeout(r, 1500));

    const submitBtns = ['button[data-testid="tweetButtonInline"]', 'button[data-testid="tweetButton"]'];
    let submitted = false;
    for (const sel of submitBtns) {
      const btn = p.locator(sel).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) { await btn.click(); submitted = true; break; }
    }
    if (!submitted) { await p.keyboard.press('Control+Enter'); submitted = true; }

    state.repliedTo.push(tid);
    if (author) state.repliedUsers.push(author);
    replied++;
    console.log('Replied to @' + author + ':', replyText.substring(0, 60));
    fs.writeFileSync('${STATE_FILE.replace(/\\/g, '/')}', JSON.stringify(state, null, 2));
    await new Promise(r => setTimeout(r, 3000));

    // Close modal
    for (let c = 0; c < 3; c++) {
      const closeBtn = p.locator('button[aria-label="Close"]');
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) { await closeBtn.click(); await new Promise(r => setTimeout(r, 500)); }
      await p.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 500));
    }
  }

  // Check profile for replies to our tweets
  await p.goto('${BASE}/ebubechukwu_sam', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));
  for (let s = 0; s < 3; s++) { await p.evaluate(() => window.scrollBy(0, 600)); await new Promise(r => setTimeout(r, 1500)); }

  const ourTweets = p.locator('article[data-testid="tweet"]');
  const twCount = await ourTweets.count();
  console.log('Profile tweets:', twCount);

  for (let i = 0; i < Math.min(twCount, 5) && replied < 5; i++) {
    const tw = ourTweets.nth(i);
    const twLink = await tw.locator('a[href*="/status/"]').first().getAttribute('href').catch(() => '');
    const twId = twLink?.split('/status/')[1]?.split('?')[0];
    if (!twId) continue;

    // Open tweet
    await tw.locator('a[href*="/status/"]').first().click();
    await new Promise(r => setTimeout(r, 3000));

    const replies = p.locator('article[data-testid="tweet"]');
    const rCount = await replies.count();

    for (let j = 0; j < rCount && replied < 5; j++) {
      const rt = replies.nth(j);
      const rLink = await rt.locator('a[href*="/status/"]').first().getAttribute('href').catch(() => '');
      const rId = rLink?.split('/status/')[1]?.split('?')[0];
      if (!rId || state.repliedTo.includes(rId)) continue;

      const rAuthorLink = await rt.locator('div[data-testid="User-Name"] a').first().getAttribute('href').catch(() => '');
      const rAuthor = rAuthorLink.replace('/', '').replace('@', '');
      if (!rAuthor || rAuthor === 'ebubechukwu_sam') continue;
      if (state.repliedUsers.includes(rAuthor)) { state.repliedTo.push(rId); continue; }

      const rText = await rt.locator('div[data-testid="tweetText"]').innerText().catch(() => '');
      if (!rText || rText.length < 5) continue;

      const rReplyBtn = rt.locator('button[data-testid="reply"]');
      if (!(await rReplyBtn.isVisible({ timeout: 2000 }).catch(() => false))) continue;
      await rReplyBtn.click();
      await new Promise(r => setTimeout(r, 2000));

      const rArea = p.locator('div[data-testid="tweetTextarea_0"]');
      if (!(await rArea.isVisible({ timeout: 3000 }).catch(() => false))) { state.repliedTo.push(rId); continue; }

      const groqKey2 = '${env.GROQ_API_KEY}';
      const rrResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + groqKey2, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You are Ebube. Reply to this comment naturally, 1-2 sentences. No emojis, no hashtags.' },
            { role: 'user', content: 'Someone commented on your tweet: "' + rText.substring(0, 200) + '". Reply as Ebube:' }
          ],
          temperature: 0.8,
        }),
      });
      const rrData = await rrResp.json();
      let rrText = rrData.choices?.[0]?.message?.content?.trim() || '';
      rrText = rrText.replace(/^["']|["']$/g, '').trim();
      if (!rrText || rrText.length < 2) { state.repliedTo.push(rId); continue; }

      await rArea.click();
      await p.keyboard.type(rrText, { delay: 20 });
      await new Promise(r => setTimeout(r, 1500));

      for (const sel of ['button[data-testid="tweetButtonInline"]', 'button[data-testid="tweetButton"]']) {
        const btn = p.locator(sel).first();
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) { await btn.click(); break; }
      }

      state.repliedTo.push(rId);
      state.repliedUsers.push(rAuthor);
      replied++;
      console.log('Replied to @' + rAuthor + ' on our tweet');
      fs.writeFileSync('${STATE_FILE.replace(/\\/g, '/')}', JSON.stringify(state, null, 2));
      await new Promise(r => setTimeout(r, 3000));
    }
    await p.goBack();
    await new Promise(r => setTimeout(r, 3000));
  }

  fs.writeFileSync('${STATE_FILE.replace(/\\/g, '/')}', JSON.stringify(state, null, 2));
  console.log('Replied to ' + replied + ' total');
}
run().catch(e => { console.error('Reply failed:', e.message); });
`;
    const replyOutput = pw(replyScript);
    console.log('Reply output:', replyOutput.trim());

  console.log('Done');
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
