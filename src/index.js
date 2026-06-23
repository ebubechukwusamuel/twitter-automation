import { login, postTweet, engage, ensureLoggedIn } from './browser.js';
import { generateTweet } from './ai.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const STATE_FILE = resolve(import.meta.dirname, '..', 'state.json');
const ENGAGEMENT_KEYWORDS = [
  'freelance designer',
  'UI UX design',
  'brand identity design',
  'web design freelance',
  'logo design',
  'mobile app design',
  'building in public design',
  'designer life',
  'design portfolio',
  'freelance web developer',
];

function loadState() {
  if (!existsSync(STATE_FILE)) return { posted: [], engaged: [], lastEngage: null };
  return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
}

async function main() {
  const state = loadState();
  const mode = process.argv[2] || 'both';
  const forceLogin = process.argv.includes('--relogin');

  console.log(`Mode: ${mode}`);
  console.log(`Tweets posted so far: ${state.posted.length}`);
  console.log(`Tweets engaged with: ${state.engaged.length}`);

  try {
    const loggedIn = await ensureLoggedIn();
    if (!loggedIn || forceLogin) {
      await login();
    }

    if (mode === 'post' || mode === 'both') {
      let text = await generateTweet();
      if (!text) {
        const { getFallbackTweet } = await import('./ai.js');
        text = getFallbackTweet();
        console.log('Using fallback tweet (AI unavailable)');
      }
      await postTweet(text);
    }

    if (mode === 'engage' || mode === 'both') {
      const hoursSinceEngage = state.lastEngage
        ? (Date.now() - new Date(state.lastEngage).getTime()) / 3600000
        : Infinity;

      if (hoursSinceEngage >= 2 || mode !== 'both') {
        await engage(ENGAGEMENT_KEYWORDS);
        state.lastEngage = new Date().toISOString();
        writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      } else {
        console.log('Skipping engage — last engagement was <2h ago');
      }
    }

    console.log('Done');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
