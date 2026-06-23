import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const envPath = resolve(import.meta.dirname, '..', '.env.local');
  if (!existsSync(envPath)) return {};
  const lines = readFileSync(envPath, 'utf-8').split('\n').filter(Boolean);
  const env = {};
  for (const line of lines) {
    const [key, ...rest] = line.split('=');
    env[key.trim()] = rest.join('=').trim();
  }
  return env;
}

const env = loadEnv();

export const TWITTER_CONFIG = {
  appKey: env.CONSUMER_KEY,
  appSecret: env.CONSUMER_KEY_SECRET,
  accessToken: env.ACCESS_TOKEN,
  accessSecret: env.ACCESS_TOKEN_SECRET,
};

export const POSTS_DIR = resolve(import.meta.dirname, '..', 'posts');
export const STATE_FILE = resolve(import.meta.dirname, '..', 'state.json');

export const ENGAGEMENT_KEYWORDS = [
  'freelance designer',
  'UI UX',
  'brand identity',
  'web design',
  'logo design',
  'mobile app design',
  'design tips',
  'designer life',
  'building in public design',
  'freelance web developer',
  'design portfolio',
];

export const REPLY_TEMPLATES = [
  "This is great! Keep sharing your journey — following along.",
  "Love this perspective. The design community needs more of this.",
  "Solid work. Clean and thoughtful execution.",
  "Really resonates with my approach too. Thanks for sharing.",
  "This is underrated advice. Every designer should see this.",
  "Beautiful work! What tools did you use?",
  "Great thread. Saving this for reference.",
  "100% agree. Simple always wins.",
  "Nice to see more designers sharing their process. Inspiring.",
];
