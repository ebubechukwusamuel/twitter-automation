import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const AUTH_FILE = resolve(import.meta.dirname, '..', 'auth.json');
const STATE_FILE = resolve(import.meta.dirname, '..', 'state.json');
const BASE = 'https://x.com';

async function localLogin() {
  console.log('Connecting to your existing Edge (port 9222)...\n');

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const defaultContext = browser.contexts()[0];
  const page = await defaultContext.newPage();

  console.log('Connected! Checking X.com session...\n');

  await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  const url = page.url();
  console.log('URL after navigating:', url);

  if (url.includes('/home')) {
    console.log('✓ Already logged in! Saving session...');

    await defaultContext.storageState({ path: AUTH_FILE });
    console.log(`✓ auth.json saved to ${AUTH_FILE}`);

    writeFileSync(STATE_FILE, JSON.stringify({ posted: [], engaged: [], lastEngage: null }, null, 2));
    console.log('✓ state.json reset');

    const authBase64 = readFileSync(AUTH_FILE, 'base64');
    console.log('\n=== NEW AUTH_JSON (add to GitHub secret) ===');
    console.log(authBase64);
    console.log('=== END ===\n');
  } else {
    console.log(`⚠️  Not on timeline (${url}). Opening X.com for you...`);
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Please log in. Waiting up to 3 minutes...');
    try {
      await page.waitForURL('**/home', { timeout: 180000 });
      console.log('\n✓ Timeline loaded! Saving session...');
      await defaultContext.storageState({ path: AUTH_FILE });
      console.log(`✓ auth.json saved`);
      const authBase64 = readFileSync(AUTH_FILE, 'base64');
      console.log('\n=== NEW AUTH_JSON (add to GitHub secret) ===');
      console.log(authBase64);
      console.log('=== END ===\n');
    } catch (err) {
      console.error('✗ Timed out waiting for login.');
    }
  }

  await page.close();
  console.log('Done! You can check auth.json in the twitter-automation folder.');
}

localLogin().catch(console.error);
