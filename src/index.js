import { createSession, login, postTweet, ensureLoggedIn, engage } from './browser.js';
import { generatePost, getFallbackTweet } from './ai.js';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const STATE_FILE = resolve(import.meta.dirname, '..', 'state.json');
const ENGAGEMENT_KEYWORDS = [
  'building in public',
  'freelance designer',
  'UI UX design',
  'brand identity design',
  'web design freelance',
  'logo design',
  'building in public design',
  'side project',
  'indie maker',
  'design portfolio',
  'freelance web developer',
  'design tools',
  'design system',
  'shipping product',
  'startup design',
];

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

  let session;
  try {
    session = await createSession();
    const { browser, context } = session;
    const page = await context.newPage();

    const loggedIn = await ensureLoggedIn(context, page);

    if (mode === 'post' || mode === 'both') {
      const post = await generatePost();
      let text = post?.text;
      let imagePath = null;

      if (!text) {
        text = getFallbackTweet();
        console.log('Using fallback tweet (AI unavailable)');
      }

      if (post?.includeImage) {
        const assetsDir = resolve(import.meta.dirname, '..', 'assets');
        if (existsSync(assetsDir)) {
          const files = readdirSync(assetsDir).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
          if (files.length > 0) {
            imagePath = resolve(assetsDir, files[Math.floor(Math.random() * files.length)]);
            console.log('Including image:', imagePath);
          } else {
            console.log('No images in assets/ to attach');
          }
        }
      }

      await postTweet(context, page, text, imagePath);
    }

    if (mode === 'engage' || mode === 'both') {
      const hoursSinceEngage = state.lastEngage
        ? (Date.now() - new Date(state.lastEngage).getTime()) / 3600000
        : Infinity;

      if (hoursSinceEngage >= 2 || mode !== 'both') {
        await engage(context, page, ENGAGEMENT_KEYWORDS);
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
  } finally {
    if (session) await session.browser.close();
  }
}

main();
