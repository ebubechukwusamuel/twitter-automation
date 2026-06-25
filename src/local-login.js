import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const AUTH_FILE = resolve(import.meta.dirname, '..', 'auth.json');
const BASE = 'https://x.com';

async function localLogin() {
  console.log('Starting local login for X.com...\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  console.log('Browser opened. Please log in manually in the browser window.');

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });

  console.log('\n=== INSTRUCTIONS ===');
  console.log('1. Enter your username/email and password');
  console.log('2. Complete any verification (phone, email, etc.)');
  console.log('3. Wait for your X.com homepage (timeline) to load');
  console.log('4. The script will auto-detect and save the session');
  console.log('========================\n');

  try {
    await page.waitForURL('**/home', { timeout: 120000 });
    console.log('Timeline loaded! Session valid.');

    await context.storageState({ path: AUTH_FILE });
    console.log(`\n✓ auth.json saved to ${AUTH_FILE}`);

    const authData = readFileSync(AUTH_FILE, 'base64');
    console.log('\n=== COPY THIS BASE64 STRING TO GITHUB SECRET ===');
    console.log('Secret name: AUTH_JSON');
    console.log('Value:');
    console.log(authData);
    console.log('=== END ===\n');

    console.log('To add to GitHub:');
    console.log(`  gh secret set AUTH_JSON --body "${authData.substring(0, 20)}..." --repo ebubechukwusamuel/twitter-automation`);

    await page.waitForTimeout(3000);
  } catch (err) {
    console.error('Timed out waiting for timeline. Make sure you are logged in.');
    console.error('Error:', err.message);
  }

  await browser.close();
  console.log('Done.');
}

localLogin().catch(console.error);
