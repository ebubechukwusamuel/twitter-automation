import { createSession, login, postTweet, ensureLoggedIn, engage } from './browser.js';
import { generatePost, getFallbackTweet } from './ai.js';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const STATE_FILE = resolve(import.meta.dirname, '..', 'state.json');
const POST_HOURS = [6, 8, 10, 12, 14, 16, 18, 20];
const ENGAGEMENT_KEYWORDS = [
  'tech twitter',
  'software engineering',
  'web development',
  'product design',
  'startup life',
  'coding',
  'founder',
  'SaaS',
  'frontend',
  'UI design',
  'building in public',
  'programming',
  'building products',
  'tech career',
  'developer',
  'business',
  'entrepreneurship',
  'startups',
  'small business',
  'branding',
  'marketing',
  'growth hacking',
  'productivity',
  'innovation',
  'AI',
  'design',
  'freelancing',
  'remote work',
  'digital nomad',
  'venture capital',
  'fundraising',
  'tech companies',
  'SME',
  'Nigeria tech',
  'African startups',
];

const TARGET_ACCOUNTS = [
  'levelsio',
  'shadcn',
  'rauchg',
  'dan_abramov',
  'acdlite',
  'steventey',
  'devtools_fm',
  'sundarpichai',
  'elonmusk',
  'naval',
  'jackbutcher',
  'mxstbr',
  'leerob',
  'bitandbang',
  'swyx',
  't3dotgg',
  'hhg_',
  'framer',
  'tailwindcss',
  'vercel',
  'nextjs',
  'reactjs',
  'figmadesign',
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

    const currentHour = new Date().getUTCHours();
    const shouldPost = POST_HOURS.includes(currentHour) && (mode === 'post' || mode === 'both');
    const shouldEngage = currentHour % 2 === 0 || mode === 'engage';

    if (shouldPost) {
      const withImage = Math.random() < 0.6;
      console.log(`Rolled: ${withImage ? 'image' : 'text-only'} post`);

      const post = await generatePost(withImage);
      let text = post?.text;
      let imagePath = null;

      if (!text) {
        text = getFallbackTweet();
        console.log('Using fallback tweet (AI unavailable)');
      }

      if (withImage) {
        const assetsDir = resolve(import.meta.dirname, '..', 'assets');
        if (existsSync(assetsDir)) {
          const files = readdirSync(assetsDir).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));

          // Categorize images by filename prefix
          const categories = {
            project: files.filter(f => f.startsWith('project-') || f.startsWith('full-project-')),
            code: files.filter(f => f.startsWith('code-')),
            design: files.filter(f => f.startsWith('about-') || f.startsWith('full-about')),
            mobile: files.filter(f => f.startsWith('mobile-')),
            general: files.filter(f => !f.startsWith('project-') && !f.startsWith('full-project-') && !f.startsWith('code-') && !f.startsWith('about-') && !f.startsWith('full-about') && !f.startsWith('mobile-')),
          };

          let pool = files;
          const wanted = post?.imageType;
          if (wanted && categories[wanted]?.length > 0) {
            pool = categories[wanted];
            console.log(`AI suggested image type "${wanted}" — ${pool.length} matching images`);
          } else {
            console.log(`No match for "${wanted}", picking from all ${files.length} images`);
          }

          imagePath = resolve(assetsDir, pool[Math.floor(Math.random() * pool.length)]);
          console.log('Attaching image:', imagePath);
        } else {
          console.log('No images in assets/ to attach — posting text-only');
        }
      }

      await postTweet(context, page, text, imagePath);
    } else {
      console.log(`Skipping post — UTC hour ${currentHour} not in posting schedule`);
    }

    if (shouldEngage && (mode === 'engage' || mode === 'both')) {
      await engage(context, page, ENGAGEMENT_KEYWORDS, TARGET_ACCOUNTS);
      state.lastEngage = new Date().toISOString();
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
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
