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
  if (process.env.TWITTER_PHONE) env.TWITTER_PHONE = process.env.TWITTER_PHONE;
  return env;
}

const env = loadEnv();
const USERNAME = (env.TWITTER_USERNAME || '').replace('@', '');
const PASSWORD = env.TWITTER_PASSWORD || '';
const PHONE = env.TWITTER_PHONE || '';

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
    await page.goto(`${BASE}/i/flow/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(6000);

    const inputSelectors = [
      'input[autocomplete="username webauthn"]',
      'input[name="text"]',
      'input[name="username_or_email"]',
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

    // On new X onboarding, password may already be visible
    let pw = page.locator('input[name="password"]');
    if (await pw.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pw.fill(PASSWORD);
      console.log('Password entered alongside username');
      await page.waitForTimeout(500);
      // Try clicking a submit/next button first
      const nextBtn = page.locator('button[type="submit"], button:has-text("Next"), button:has-text("Log in"), button:has-text("Sign in")').first();
      if (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nextBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
    } else {
      // Traditional separate username step
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
      pw = page.locator('input[name="password"]');
      if (await pw.isVisible({ timeout: 5000 }).catch(() => false)) {
        await pw.fill(PASSWORD);
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
    }

    await page.waitForTimeout(3000);

    console.log('Login submitted, URL:', page.url());

    if (page.url().includes('onboarding')) {
      console.log('Onboarding page detected, trying email/username route...');

      // Click "Email or username" to skip phone verification
      const emailLink = page.locator('a, span, div, button', { hasText: 'Email or username' }).first();
      if (await emailLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await emailLink.click({ force: true });
        console.log('Clicked Email or username');
        await page.waitForTimeout(3000);
      }

      // Fill username and password
      const userInput = page.locator('input[name="username_or_email"]').first();
      if (await userInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await userInput.fill(USERNAME);
        await page.waitForTimeout(500);
      }
      const pwInput = page.locator('input[name="password"]').first();
      if (await pwInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pwInput.fill(PASSWORD);
        await page.waitForTimeout(500);
      }

      // Submit
      const loginBtn = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first();
      if (await loginBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await loginBtn.click();
        console.log('Clicked login button');
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(4000);

      // Wait for the timeline to appear
      for (let i = 0; i < 10; i++) {
        const url = page.url();
        if (!url.includes('onboarding') && !url.includes('login')) {
          console.log('Left onboarding, URL:', url);
          break;
        }

        const primaryCol = page.locator('div[data-testid="primaryColumn"]');
        if (await primaryCol.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('Timeline reached!');
          break;
        }

        // Check for SMS code inputs
        const codeInputs = page.locator('input[inputmode="numeric"]');
        if (await codeInputs.count() >= 4) {
          console.log('SMS verification required. Run save-auth script instead.');
          break;
        }

        await page.waitForTimeout(3000);
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

export async function postTweet(context, page, text, imagePath) {
  try {
    console.log('Current URL:', page.url());

    const postBtn = page.locator('a[data-testid="SideNav_NewTweet_Button"]');
    await postBtn.waitFor({ state: 'visible', timeout: 20000 });
    console.log('Post button found');
    await postBtn.click();
    await page.waitForTimeout(3000);

    if (imagePath && existsSync(imagePath)) {
      try {
        // Click the media/gallery button to reveal file input
        const mediaBtnSelectors = [
          'button[data-testid="attachmentsButton"]',
          'button[aria-label="Media"]',
          'button[aria-label="Add photos or video"]',
          'div[aria-label="Add photos or video"]',
          'button:has(svg[aria-label*="media"])',
          'button:has(svg path[d*="M19.75"])',  // common X media icon path
        ];
        for (const sel of mediaBtnSelectors) {
          const btn = page.locator(sel).first();
          if (await btn.count() > 0 && await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await btn.click();
            console.log('Clicked media button');
            await page.waitForTimeout(1500);
            break;
          }
        }

        // Directly set the file on any file input (may be hidden)
        const allFileInputs = page.locator('input[type="file"]');
        const count = await allFileInputs.count();
        if (count > 0) {
          await allFileInputs.first().setInputFiles(imagePath);
          console.log('Image attached');
          await page.waitForTimeout(3000);
        } else {
          console.log('No file input found — posting text-only');
        }
      } catch (imgErr) {
        console.log('Image attach failed:', imgErr.message);
        await page.screenshot({ path: resolve(import.meta.dirname, '..', 'attach-error.png') });
      }
    }

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
      'button[data-testid="tweetButton"]',
    ];

    let tweetBtn = null;
    for (const sel of tweetBtnSelectors) {
      tweetBtn = page.locator(sel).first();
      if (await tweetBtn.isVisible({ timeout: 2000 }).catch(() => false)) break;
      tweetBtn = null;
    }

    if (tweetBtn) {
      await tweetBtn.click();
      console.log('Clicked tweet button');
    } else {
      await page.keyboard.press('Control+Enter');
      console.log('Sent via Ctrl+Enter');
    }

    // Verify the compose dialog actually closed (confirm post went through)
    const dialogSelectors = [
      'div[data-testid="sheetDialog"]',
      'div[role="dialog"]',
      'div[aria-labelledby="modal-header"]',
      'div[data-testid="tweetTextarea_0"]',
    ];

    let posted = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);

      // Check if compose dialog is still open
      let stillOpen = false;
      for (const sel of dialogSelectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 300 }).catch(() => false)) {
          stillOpen = true;
          break;
        }
      }

      if (!stillOpen) {
        posted = true;
        break;
      }

      // On last 2 attempts, try submitting again
      if (attempt >= 7) {
        if (tweetBtn) {
          await tweetBtn.click({ timeout: 2000 }).catch(() => {});
        } else {
          await page.keyboard.press('Control+Enter');
        }
      }
    }

    if (!posted) {
      console.log('Post failed — compose dialog did not close');
      await page.screenshot({ path: resolve(import.meta.dirname, '..', 'post-failed-modal.png') });
      return false;
    }

    await randomDelay(page, 1500, 2500);
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

function isReadableTweet(text) {
  if (!text || text.trim().length < 10) return false;
  const cleaned = text.trim();
  const linkRatio = (cleaned.match(/https?:\/\/\S+/g) || []).join('').length / cleaned.length;
  if (linkRatio > 0.6) return false;
  return true;
}

async function engageWithTweet(page, tweet, state) {
  const tweetLink = await tweet.locator('a[href*="/status/"]').first().getAttribute('href').catch(() => null);
  const tweetId = tweetLink?.split('/status/')[1]?.split('?')[0];
  if (!tweetId || state.engaged.includes(tweetId)) return false;

  const tweetTextEl = tweet.locator('div[data-testid="tweetText"]');
  const tweetText = (await tweetTextEl.innerText().catch(() => '')) || '';

  if (!isReadableTweet(tweetText)) {
    console.log(`Skipping tweet ${tweetId} — unreadable content`);
    return false;
  }

  console.log(`Engaging with: ${tweetText.substring(0, 80)}...`);

  let didSomething = false;

  try {
    const likeBtn = tweet.locator('button[data-testid="like"]');
    if (await likeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await likeBtn.click();
      console.log(`Liked: ${tweetId}`);
      didSomething = true;
      await randomDelay(page, 1000, 2000);
    }

    const replyBtn = tweet.locator('button[data-testid="reply"]');
    if (await replyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await replyBtn.click();
      await randomDelay(page, 1000, 2000);

      const replyArea = page.locator('div[data-testid="tweetTextarea_0"]');
      if (await replyArea.isVisible({ timeout: 3000 }).catch(() => false)) {
        const { generateReply } = await import('./ai.js');
        const replyText = await generateReply(tweetText, 'user');

        if (!replyText) {
          console.log(`Skipping reply — couldn't generate meaningful response`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);
        } else {
          await replyArea.click();
          await page.keyboard.type(replyText, { delay: 20 });
          await randomDelay(page, 500, 1000);

          let submitted = false;
          const submitSelectors = [
            'button[data-testid="tweetButtonInline"]',
            'div[data-testid="tweetButtonInline"]',
            'button[data-testid="tweetButton"]',
            'div[data-testid="tweetButton"]',
          ];
          for (const sel of submitSelectors) {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
              await btn.click();
              console.log(`Replied via ${sel}`);
              submitted = true;
              break;
            }
          }
          if (!submitted) {
            await page.keyboard.press('Control+Enter');
            console.log(`Replied via Ctrl+Enter`);
            submitted = true;
          }
          if (submitted) {
            didSomething = true;
            await page.waitForTimeout(3000);
          }
        }
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);

      const closeBtn = page.locator('button[aria-label="Close"]');
      if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeBtn.click();
        await randomDelay(page, 1000, 1500);
      }

      const mask = page.locator('div[data-testid="mask"]');
      if (await mask.isVisible({ timeout: 2000 }).catch(() => false)) {
        await mask.click({ force: true });
        await page.waitForTimeout(1000);
      }
    }

    if (didSomething) {
      state.engaged.push(tweetId);
      return true;
    }
    return false;
  } catch (err) {
    console.log(`Failed on tweet ${tweetId}: ${err.message}`);
    return false;
  }
}

async function engageBySearch(page, keywords, state) {
  const keyword = keywords[Math.floor(Math.random() * keywords.length)];
  console.log(`Searching for: ${keyword}`);

  await page.goto(`${BASE}/search?q=${encodeURIComponent(keyword)}&src=typed_query&f=top`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  const tweets = page.locator('article[data-testid="tweet"]');
  const count = await tweets.count();
  if (count === 0) {
    console.log('No tweets found');
    return 0;
  }

  let engaged = 0;
  const maxEngage = Math.min(3, count);

  for (let i = 0; i < count && engaged < maxEngage; i++) {
    const tweet = tweets.nth(i);
    if (await engageWithTweet(page, tweet, state)) engaged++;
  }

  return engaged;
}

async function engageByAccounts(page, accounts, state) {
  const account = accounts[Math.floor(Math.random() * accounts.length)];
  console.log(`Visiting @${account}'s profile`);

  await page.goto(`${BASE}/${account}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  const tweets = page.locator('article[data-testid="tweet"]');
  const count = await tweets.count();
  if (count === 0) {
    console.log(`No tweets from @${account}`);
    return 0;
  }

  let engaged = 0;
  const maxEngage = Math.min(2, count);

  for (let i = 0; i < count && engaged < maxEngage; i++) {
    const tweet = tweets.nth(i);
    if (await engageWithTweet(page, tweet, state)) engaged++;
  }

  return engaged;
}

export async function engage(context, page, keywords, targetAccounts) {
  try {
    const state = loadState();
    let total = 0;

    if (targetAccounts?.length > 0) {
      total += await engageByAccounts(page, targetAccounts, state);
    }

    total += await engageBySearch(page, keywords, state);

    saveState(state);
    console.log(`Engaged with ${total} tweets total`);
    return total;
  } catch (err) {
    console.error('Engage failed:', err.message);
    await page.screenshot({ path: resolve(import.meta.dirname, '..', 'engage-error.png') });
    return 0;
  }
}
