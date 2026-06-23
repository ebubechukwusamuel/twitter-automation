import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const STATE_FILE = resolve(import.meta.dirname, '..', 'state.json');
const AUTH_FILE = resolve(import.meta.dirname, '..', 'auth.json');

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

export async function login() {
  if (existsSync(AUTH_FILE)) {
    console.log('Using saved auth session');
    return null;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    console.log('Logging in to Twitter...');
    await page.goto('https://twitter.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

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
      console.log('Page HTML:', await page.evaluate(() => document.body.innerHTML.substring(0, 2000)));
      await page.screenshot({ path: resolve(import.meta.dirname, '..', 'login-page.png') });

      await page.goto('https://twitter.com/i/flow/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);

      for (const sel of inputSelectors) {
        textInput = page.locator(sel).first();
        if (await textInput.isVisible({ timeout: 3000 }).catch(() => false)) break;
        textInput = null;
      }

      if (!textInput) {
        console.log('Flow page URL:', page.url());
        console.log('Flow page HTML:', await page.evaluate(() => document.body.innerHTML.substring(0, 2000)));
        throw new Error('Could not find username input on either login page');
      }
    }
    await textInput.fill(USERNAME);
    await page.waitForTimeout(1000);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    const passwordInput = page.locator('input[name="password"]');
    if (await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await passwordInput.fill(PASSWORD);
      await page.click('div[data-testid="LoginForm_Login_Button"]');
    } else {
      const textInput = page.locator('input[name="text"]');
      if (await textInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textInput.fill(env.TWITTER_EMAIL || '');
        await page.click('div[role="button"]:has-text("Next")');
        await page.waitForTimeout(2000);
        await page.locator('input[name="password"]').fill(PASSWORD);
        await page.click('div[data-testid="LoginForm_Login_Button"]');
      }
    }

    await page.waitForTimeout(5000);

    const dismissBtn = page.locator('button:has-text("Skip")');
    if (await dismissBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dismissBtn.click();
      await page.waitForTimeout(2000);
    }

    await context.storageState({ path: AUTH_FILE });
    console.log('Auth saved to', AUTH_FILE);
  } catch (err) {
    console.error('Login failed:', err.message);
    await page.screenshot({ path: resolve(import.meta.dirname, '..', 'login-error.png') });
    throw err;
  } finally {
    await browser.close();
  }
}

async function getContext() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    storageState: AUTH_FILE,
  });
  return { browser, context };
}

function randomDelay(page, min = 500, max = 2000) {
  return page.waitForTimeout(Math.floor(Math.random() * (max - min)) + min);
}

export async function postTweet(text) {
  const { browser, context } = await getContext();
  const page = await context.newPage();

  try {
    await page.goto('https://twitter.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const textarea = page.locator('div[data-testid="tweetTextarea_0"]');
    if (!(await textarea.isVisible({ timeout: 8000 }).catch(() => false))) {
      const composerBtn = page.locator('a[href="/compose/post"]');
      if (await composerBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await composerBtn.click();
        await page.waitForTimeout(3000);
      }
    }

    if (!(await textarea.isVisible({ timeout: 5000 }).catch(() => false))) {
      throw new Error('Could not find tweet compose area');
    }

    await textarea.click();
    await randomDelay(page, 500, 1000);
    await page.keyboard.type(text, { delay: 30 });
    await randomDelay(page, 1000, 1500);

    const tweetBtn = page.locator('div[data-testid="tweetButtonInline"]');
    if (!(await tweetBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      await page.keyboard.press('Control+Enter');
    } else {
      await tweetBtn.click();
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
  } finally {
    await browser.close();
  }
}

export async function engage(keywords) {
  const { browser, context } = await getContext();
  const page = await context.newPage();

  try {
    const keyword = keywords[Math.floor(Math.random() * keywords.length)];
    console.log(`Searching for: ${keyword}`);

    await page.goto(`https://twitter.com/search?q=${encodeURIComponent(keyword)}&src=typed_query`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

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
            const tweetText = await tweet.locator('div[data-testid="tweetText"]').innerText();
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
  } finally {
    await browser.close();
  }
}

export async function ensureLoggedIn() {
  if (existsSync(AUTH_FILE)) {
    try {
      const { browser, context } = await getContext();
      const page = await context.newPage();
      await page.goto('https://twitter.com/home', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);
      const url = page.url();
      await browser.close();
      if (url.includes('login')) {
        console.log('Auth expired, re-logging in...');
        return false;
      }
      console.log('Auth session valid');
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
