import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const AUTH_FILE = resolve(import.meta.dirname, '..', 'auth.json');
const STATE_FILE = resolve(import.meta.dirname, '..', 'state.json');
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
  if (process.env.TWITTER_PHONE) env.TWITTER_PHONE = process.env.TWITTER_PHONE;
  return env;
}

const env = loadEnv();
const USERNAME = (env.TWITTER_USERNAME || '').replace('@', '');
const PASSWORD = env.TWITTER_PASSWORD || '';
const PHONE = env.TWITTER_PHONE || '';

async function localLogin() {
  console.log('Starting local login for X.com...\n');

  const browser = await chromium.launch({
    headless: false,
    channel: 'msedge',
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  console.log('Browser opened (Edge). Auto-filling credentials...\n');

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Fill username
  const usernameInput = page.locator('input[autocomplete="username"], input[name="text"]').first();
  if (await usernameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await usernameInput.fill(USERNAME);
    await page.keyboard.press('Enter');
    console.log('✓ Username entered');
    await page.waitForTimeout(3000);
  }

  // Fill password
  const passwordInput = page.locator('input[name="password"]');
  if (await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await passwordInput.fill(PASSWORD);
    await page.keyboard.press('Enter');
    console.log('✓ Password entered');
    await page.waitForTimeout(5000);
  }

  // Check if we hit onboarding (phone verification)
  let url = page.url();
  if (url.includes('onboarding')) {
    console.log('\n⚠️  Phone verification required.');
    console.log('   Auto-filling phone number...');

    // Click "Continue with phone" if visible
    const phoneBtn = page.locator('button:has-text("Continue with phone")').first();
    if (await phoneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await phoneBtn.click();
      await page.waitForTimeout(2000);
    }

    // Enter phone in the username field
    const cleanPhone = PHONE.replace(/^0+/, '');
    const userInput = page.locator('input[name="username_or_email"]').first();
    if (await userInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await userInput.click();
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(300);
      await userInput.fill(cleanPhone);
      console.log(`✓ Phone entered: ${cleanPhone}`);
      await page.waitForTimeout(1000);
    }

    // Click Continue
    const continueBtn = page.locator('button[type="submit"]:has-text("Continue"), input[type="submit"]').first();
    if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await continueBtn.click();
      console.log('✓ Submitted phone');
      await page.waitForTimeout(3000);
    } else {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
    }

    // Check for SMS code input
    const codeInputs = page.locator('input[inputmode="numeric"]');
    if (await codeInputs.count() >= 4) {
      console.log('\n📱 SMS CODE SENT! Check your phone.');
      console.log('   Type the SMS code in the browser.');
      console.log('   The script waits up to 5 minutes for you.\n');
    }
  }

  // Wait for user to complete login (up to 5 min)
  console.log('\n⏳ Waiting for you to complete login and reach timeline...\n');

  try {
    await page.waitForURL('**/home', { timeout: 300000 });
    console.log('\n✓ Timeline loaded! Session valid.');

    await context.storageState({ path: AUTH_FILE });
    console.log(`✓ auth.json saved to ${AUTH_FILE}`);

    // Reset state for fresh start
    writeFileSync(STATE_FILE, JSON.stringify({ posted: [], engaged: [], lastEngage: null }, null, 2));
    console.log('✓ state.json reset');

    const authBase64 = readFileSync(AUTH_FILE, 'base64');
    console.log('\n=== ADD THIS AS GITHUB SECRET ===');
    console.log('Secret name: AUTH_JSON');
    console.log('Value:');
    console.log(authBase64);
    console.log('=== END ===\n');

    console.log('Run this command to add the secret:');
    console.log('  gh secret set AUTH_JSON --repo ebubechukwusamuel/twitter-automation --body "<paste base64 above>"');

    await page.waitForTimeout(3000);
  } catch (err) {
    console.error('\n✗ Timed out. Make sure you reach your X.com home timeline.');
    console.error('  Check the browser window and try again.');
  }

  await browser.close();
  console.log('Done.');
}

localLogin().catch(console.error);
