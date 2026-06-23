import { postTweet, engage } from './twitter.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(__dirname, '..', 'state.json');

function loadState() {
  if (!existsSync(STATE_FILE)) return { posted: [], engaged: [], lastEngage: null };
  return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
}

async function main() {
  const state = loadState();
  const mode = process.argv[2] || 'both';

  console.log(`Mode: ${mode}`);
  console.log(`Tweets posted so far: ${state.posted.length}`);
  console.log(`Tweets engaged with: ${state.engaged.length}`);

  try {
    if (mode === 'post' || mode === 'both') {
      await postTweet();
    }

    if (mode === 'engage' || mode === 'both') {
      const hoursSinceEngage = state.lastEngage
        ? (Date.now() - new Date(state.lastEngage).getTime()) / 3600000
        : Infinity;

      if (hoursSinceEngage >= 2 || mode !== 'both') {
        await engage();
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
