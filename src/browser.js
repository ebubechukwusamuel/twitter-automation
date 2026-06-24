import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs';
import { resolve } from 'path';

const STATE_FILE = resolve(import.meta.dirname, '..', 'state.json');
const AUTH_FILE = resolve(import.meta.dirname, '..', 'auth.json');
const BASE = 'https://x.com';

function loadEnv() {
  const env = {};
  const envPath = resolve(import.meta.dirname, '..', '.env.local');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      const [key, ...rest] = line.split('=');
      env[key.trim()] = rest.join('=').trim();
    }
  }
  if (process.env.TWITTER_USERNAME) env.TWITTER_USERNAME = process.env.TWITTER_USERNAME;
  if (process.env.TWITTER_PASSWORD) env.TWITTER_PASSWORD = process.env.TWITTER_PASSWORD;
  if (process.env.TWITTER_EMAIL) env.TWITTER_EMAIL = process.env.TWITTER_EMAIL;
  return env;
}

const env = loadEnv();
const USERNAME = (env.TWITTER_USERNAME || '').replace('@', '');
const PASSWORD = env.TWITTER_PASSWORD || '';

function loadState() {
  if (!existsSync(STATE_FILE)) return { posted: [], engaged: [], lastEngage: null };
  return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function randomDelay(page, min = 500, max = 2000) {
  return page.waitForTimeout(Math.floor(Math.random() * (max - min)) + min);
}

export async function createSession() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    storageState: existsSync(AUTH_FILE) ? AUTH_FILE : undefined,
  });
  return { browser, context };
}

export async function login(context, page) {
  try {
    console.log('Logging in to Twitter...');
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(6000);

    const inputSelectors = [
      'input[autocomplete="username"]',
      'input[name="text"]',
      'input[type="email"]',
      'input[type="text"]',
    ];

    let textInput = null;
    for (const sel of inputSelectors) {
      textInput = page.locator(sel).first();
      if (await textInput.isVisible({ timeout: 3000 }).catch(() => false)) break;
      textInput = null;
    }

    if (!textInput) {
      console.log('Page URL:', page.url());
      await page.screenshot({ path: resolve(import.meta.dirname, '..', 'login-page.png') });
      throw new Error('Could not find username input');
    }

    await textInput.fill(USERNAME);
    await page.waitForTimeout(1000);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);

    const passwordInput = page.locator('input[name="password"]');
    if (await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await passwordInput.fill(PASSWORD);
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
    } else {
      const textInput2 = page.locator('input[type="email"]');
      if (await textInput2.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textInput2.fill(env.TWITTER_EMAIL || USERNAME);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(3000);
        await page.locator('input[name="password"]').fill(PASSWORD);
        await page.keyboard.press('Enter');
      }
    }

    await page.waitForTimeout(3000);

    console.log('Login submitted, URL:', page.url());

    if (page.url().includes('onboarding')) {
      console.log('Onboarding page detected, attempting to proceed...');
      for (let i = 0; i < 10; i++) {
        const url = page.url();
        if (!url.includes('onboarding') && !url.includes('login')) {
          console.log('Left onboarding, URL:', url);
          break;
        }

        const nextBtn = page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Confirm")');
        const skipBtn = page.locator('button:has-text("Skip"), button:has-text("Not now"), button:has-text("Maybe later")');
        const dismissBtn = page.locator('a[role="link"]:has-text("Skip"), span:has-text("Skip")');

        let clicked = false;
        for (const btn of [nextBtn, skipBtn, dismissBtn]) {
          if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await btn.click();
            console.log('Clicked button on onboarding page');
            await page.waitForTimeout(2000);
            clicked = true;
            break;
          }
        }

        if (!clicked) {
          console.log('No buttons found on onboarding page, waiting...');
          const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
          console.log('Onboarding text:', bodyText);
          await page.waitForTimeout(5000);
        }

        if (i === 9) console.log('Exhausted onboarding attempts');
      }
    }

    console.log('After onboarding, URL:', page.url());

    const primaryCol = page.locator('div[data-testid="primaryColumn"]');
    await primaryCol.waitFor({ state: 'visible', timeout: 30000 });
    console.log('Timeline visible');

    for (let i = 0; i < 5; i++) {
      const modal = page.locator('div[role="dialog"]');
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('Dismissing dialog...');
        const dismissBtn = modal.locator('button:has-text("Skip"), button:has-text("Not now"), button:has-text("Close")');
        if (await dismissBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await dismissBtn.click();
          await page.waitForTimeout(1500);
        }
      } else break;
    }

    console.log('Current URL:', page.url());

    const postBtn = page.locator('a[data-testid="SideNav_NewTweet_Button"], a[aria-label="Post"]');
    await postBtn.waitFor({ state: 'visible', timeout: 15000 });
    console.log('Post button visible, auth confirmed');

    await context.storageState({ path: AUTH_FILE });
    console.log('Auth saved to', AUTH_FILE);
  } catch (err) {
    console.error('Login failed:', err.message);
    await page.screenshot({ path: resolve(import.meta.dirname, '..', 'login-error.png') });
    throw err;
  }
}

export async function ensureLoggedIn(context, page) {
  if (existsSync(AUTH_FILE)) {
    try {
      console.log('Restoring saved auth session');
      await page.goto(`${BASE}/home`, { waitUntil: 'load', timeout: 45000 });
      const primaryCol = page.locator('div[data-testid="primaryColumn"]');
      await primaryCol.waitFor({ state: 'visible', timeout: 30000 });
      console.log('Auth session valid');
      return true;
    } catch (err) {
      console.log('Saved auth expired or needs re-auth:', err.message.substring(0, 100));
      rmSync(AUTH_FILE, { force: true });
    }
  }

  await login(context, page);
  return true;
}

export async function postTweet(context, page, text) {
  try {
    console.log('Current URL:', page.url());

    const postBtn = page.locator('a[data-testid="SideNav_NewTweet_Button"]');
    await postBtn.waitFor({ state: 'visible', timeout: 20000 });
    console.log('Post button found');
    await postBtn.click();
    await page.waitForTimeout(3000);

    const textareaSelectors = [
      'div[data-testid="tweetTextarea_0"]',
      '[role="textbox"]',
      'div[contenteditable="true"]',
    ];

    let textarea = null;
    for (const sel of textareaSelectors) {
      textarea = page.locator(sel).first();
      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) break;
      textarea = null;
    }

    if (!textarea) {
      console.log('Page URL:', page.url());
      await page.screenshot({ path: resolve(import.meta.dirname, '..', 'compose-modal.png') });
      throw new Error('Could not find tweet compose area');
    }

    await textarea.click();
    await randomDelay(page, 500, 1000);
    await page.keyboard.type(text, { delay: 30 });
    await randomDelay(page, 1000, 1500);

    const tweetBtnSelectors = [
      'div[data-testid="tweetButtonInline"]',
      'button:has-text("Post")',
      'div[data-testid="tweetButton"]',
    ];

    let tweetBtn = null;
    for (const sel of tweetBtnSelectors) {
      tweetBtn = page.locator(sel).first();
      if (await tweetBtn.isVisible({ timeout: 2000 }).catch(() => false)) break;
      tweetBtn = null;
    }

    if (tweetBtn) {
      await tweetBtn.click();
    } else {
      await page.keyboard.press('Control+Enter');
    }

    await page.waitForTimeout(3000);
    console.log(`Posted: ${text}`);

    const state = loadState();
    state.posted.push({ id: Date.now().toString(), text, time: new Date().toISOString() });
    saveState(state);

    return true;
  } catch (err) {
    console.error('Post failed:', err.message);
    await page.screenshot({ path: resolve(import.meta.dirname, '..', 'post-error.png') });
    return false;
  }
}

export async function engage(context, page, keywords) {
  try {
    const keyword = keywords[Math.floor(Math.random() * keywords.length)];
    console.log(`Searching for: ${keyword}`);

    await page.goto(`${BASE}/search?q=${encodeURIComponent(keyword)}&src=typed_query`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const tweets = page.locator('article[data-testid="tweet"]');
    const count = await tweets.count();

    if (count === 0) {
      console.log('No tweets found');
      return 0;
    }

    const state = loadState();
    let engaged = 0;
    const maxEngage = Math.min(3, count);

    for (let i = 0; i < count && engaged < maxEngage; i++) {
      const tweet = tweets.nth(i);
      const tweetLink = await tweet.locator('a[href*="/status/"]').getAttribute('href');
      const tweetId = tweetLink?.split('/status/')[1]?.split('?')[0];

      if (!tweetId || state.engaged.includes(tweetId)) continue;

      try {
        const likeBtn = tweet.locator('div[data-testid="like"]');
        if (await likeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await likeBtn.click();
          console.log(`Liked: ${tweetId}`);
          await randomDelay(page, 1000, 2000);
        }

        const replyBtn = tweet.locator('div[data-testid="reply"]');
        if (await replyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await replyBtn.click();
          await randomDelay(page, 1000, 2000);

          const replyArea = page.locator('div[data-testid="tweetTextarea_0"]');
          if (await replyArea.isVisible({ timeout: 3000 }).catch(() => false)) {
            const tweetTextEl = tweet.locator('div[data-testid="tweetText"]');
            const tweetText = (await tweetTextEl.innerText().catch(() => '')) || '';
            console.log(`Replying to: ${tweetText.substring(0, 80)}...`);

            const { generateReply, getFallbackReply } = await import('./ai.js');
            let replyText = await generateReply(tweetText, 'user');
            if (!replyText) replyText = getFallbackReply();

            await replyArea.click();
            await page.keyboard.type(replyText, { delay: 20 });
            await randomDelay(page, 500, 1000);

            const replySubmitBtn = page.locator('div[data-testid="tweetButtonInline"]');
            if (await replySubmitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
              await replySubmitBtn.click();
              console.log(`Replied: ${replyText}`);
              await page.waitForTimeout(2000);
            }
          }

          const closeBtn = page.locator('button[aria-label="Close"]');
          if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await closeBtn.click();
            await randomDelay(page, 1000, 1500);
          }
        }

        state.engaged.push(tweetId);
        engaged++;
      } catch (err) {
        console.log(`Failed on tweet ${tweetId}: ${err.message}`);
      }
    }

    saveState(state);
    console.log(`Engaged with ${engaged} tweets`);
    return engaged;
  } catch (err) {
    console.error('Engage failed:', err.message);
    await page.screenshot({ path: resolve(import.meta.dirname, '..', 'engage-error.png') });
    return 0;
  }
}
