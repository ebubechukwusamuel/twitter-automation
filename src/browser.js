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
      console.log('Onboarding page detected, handling phone verification...');

      // First, dump all inputs to understand the page structure
      const inputInfo = await page.evaluate(() =>
        [...document.querySelectorAll('input, button, select')].map(el => ({
          tag: el.tagName,
          type: el.getAttribute('type') || '',
          name: el.getAttribute('name') || '',
          placeholder: el.getAttribute('placeholder') || '',
          text: (el.textContent || '').trim().substring(0, 30),
          id: el.getAttribute('id') || '',
          'aria-label': el.getAttribute('aria-label') || '',
          autocomplete: el.getAttribute('autocomplete') || '',
          inputmode: el.getAttribute('inputmode') || '',
          visible: el.offsetParent !== null,
          class: el.className?.substring(0, 40) || '',
        }))
      );
      console.log('=== PHONE PAGE INPUTS ===');
      inputInfo.forEach((inf, i) => console.log(`  ${i}: <${inf.tag}> type=${inf.type} placeholder="${inf.placeholder}" name="${inf.name}" text="${inf.text}" visible=${inf.visible} auto="${inf.autocomplete}" mode="${inf.inputmode}" aria="${inf['aria-label']}"`));
      console.log('=== END ===');

      // The page shows "Enter your phone number" with a username_or_email field.
      // X.com uses a universal input - phone number goes into the same field.
      // First, click "Continue with phone" to ensure we're in phone mode
      const pageText2 = await page.evaluate(() => document.body.innerText).catch(() => '');
      if (pageText2.includes('Continue with phone') && !pageText2.includes('Enter your')) {
        const phoneModeBtn = page.locator('button:has-text("Continue with phone")').first();
        if (await phoneModeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await phoneModeBtn.click();
          console.log('Clicked "Continue with phone" to select phone mode');
          await page.waitForTimeout(2000);
        }
      }

      // Fill phone into the auto-filled username field (don't clear, just overwrite)
      const cleanPhone = PHONE.replace(/^0+/, '');
      const userInputs = page.locator('input[name="username_or_email"]');
      const count = await userInputs.count();
      console.log(`Found ${count} username/email inputs`);

      // Find a visible input that has the auto-filled username value
      let target = null;
      for (let i = 0; i < count; i++) {
        const inp = userInputs.nth(i);
        if (await inp.isVisible({ timeout: 500 }).catch(() => false)) {
          const val = await inp.inputValue().catch(() => '');
          console.log(`Input ${i}: value="${val}"`);
          if (val === USERNAME || val === '@' + USERNAME || val) {
            target = inp;
            console.log(`Using input ${i} (has value "${val}")`);
            break;
          }
        }
      }
      // Fallback to first visible
      if (!target) {
        for (let i = 0; i < count; i++) {
          const inp = userInputs.nth(i);
          if (await inp.isVisible({ timeout: 500 }).catch(() => false)) {
            target = inp;
            console.log(`Fallback to input ${i}`);
            break;
          }
        }
      }

      if (target) {
        // Click to focus, select all, then type the phone
        await target.click();
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(300);
        await page.keyboard.type(cleanPhone, { delay: 30 });
        console.log(`Phone entered: ${cleanPhone}`);
        await page.waitForTimeout(1000);
      }

      // Click Continue button (not "Continue with phone")
      const submitBtn = page.locator('button[type="submit"]:has-text("Continue"), input[type="submit"]').first();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
        console.log('Clicked Continue button');
      } else {
        await page.keyboard.press('Enter');
        console.log('Pressed Enter');
      }
      await page.waitForTimeout(5000);

      // Handle SMS verification code if prompted
      await page.screenshot({ path: resolve(import.meta.dirname, '..', 'after-phone.png') });
      const postPhoneText = await page.evaluate(() => document.body.innerText).catch(() => '');
      console.log('=== AFTER PHONE PAGE TEXT ===');
      console.log(postPhoneText.substring(0, 2000));
      console.log('=== END ===');

      // Wait for SMS code input or timeline
      for (let i = 0; i < 10; i++) {
        const url = page.url();
        if (!url.includes('onboarding') && !url.includes('login')) {
          console.log('Left onboarding, URL:', url);
          break;
        }

        // Check for SMS verification code inputs (6 individual boxes)
        const codeInputs = page.locator('input[inputmode="numeric"]');
        const codeCount = await codeInputs.count();
        if (codeCount >= 4) {
          console.log(`Found ${codeCount} SMS code inputs!`);
          console.log('SMS verification code required. Please check your phone.');
          // Check if TWITTER_SMS_CODE env var is set
          const smsCode = env.TWITTER_SMS_CODE || '';
          if (smsCode) {
            console.log('TWITTER_SMS_CODE found, entering code...');
            const firstInput = await codeInputs.first();
            await firstInput.click();
            await page.keyboard.type(smsCode, { delay: 100 });
            await page.waitForTimeout(2000);
            // Wait for the next step
            await page.waitForTimeout(5000);
          } else {
            console.log('No SMS code available - cannot proceed with CI login.');
            console.log('Alternative: run locally once and upload auth.json as secret.');
            break;
          }
          break;
        }

        // Check for "Try again" or error messages
        const tryAgainBtn = page.locator('button:has-text("Try again"), button:has-text("Resend")');
        if (await tryAgainBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          console.log('Error occurred - try again button visible');
          await page.screenshot({ path: resolve(import.meta.dirname, '..', 'phone-error.png') });
          break;
        }

        // If we see primaryColumn, we're done
        const primaryCol = page.locator('div[data-testid="primaryColumn"]');
        if (await primaryCol.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('Timeline reached!');
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
      const tweetLink = await tweet.locator('a[href*="/status/"]').first().getAttribute('href');
      const tweetId = tweetLink?.split('/status/')[1]?.split('?')[0];

      if (!tweetId || state.engaged.includes(tweetId)) continue;

      let didSomething = false;

      try {
        const likeBtn = tweet.locator('button[data-testid="like"]');
        if (await likeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await likeBtn.click();
          console.log(`Liked: ${tweetId}`);
          didSomething = true;
          await randomDelay(page, 1000, 2000);
        } else {
          console.log(`Tweet ${tweetId}: like button not found`);
        }

        const replyBtn = tweet.locator('button[data-testid="reply"]');
        if (await replyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
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
            } else {
              console.log(`Tweet ${tweetId}: could not submit reply`);
            }
          } else {
            console.log(`Tweet ${tweetId}: reply textarea not found`);
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
        } else {
          console.log(`Tweet ${tweetId}: reply button not found`);
        }

        if (didSomething) {
          state.engaged.push(tweetId);
          engaged++;
        } else {
          console.log(`Tweet ${tweetId}: skipped (no action taken)`);
        }
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
