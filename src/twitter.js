import { TwitterApi } from 'twitter-api-v2';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateTweet, generateReply, getFallbackTweet, getFallbackReply } from './ai.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local');
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

const client = new TwitterApi({
  appKey: env.CONSUMER_KEY,
  appSecret: env.CONSUMER_KEY_SECRET,
  accessToken: env.ACCESS_TOKEN,
  accessSecret: env.ACCESS_TOKEN_SECRET,
});

const STATE_FILE = resolve(__dirname, '..', 'state.json');

function loadState() {
  if (!existsSync(STATE_FILE)) return { posted: [], engaged: [] };
  return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

const ENGAGEMENT_KEYWORDS = [
  '"freelance designer"',
  '"UI UX" design',
  '"brand identity" design',
  '"web design" freelance',
  '"logo design"',
  '"mobile app" design',
  '"building in public" design',
  '"designer life"',
  '"design portfolio"',
  '"freelance web developer"',
];

export async function postTweet() {
  let text = await generateTweet();
  if (!text) {
    text = getFallbackTweet();
    console.log('Using fallback tweet (AI unavailable)');
  }
  const response = await client.v2.tweet(text);
  console.log(`Posted: ${text}`);
  console.log(`Tweet ID: ${response.data.id}`);

  const state = loadState();
  state.posted.push({ id: response.data.id, text, time: new Date().toISOString() });
  saveState(state);

  return response.data;
}

export async function engage() {
  const keyword = ENGAGEMENT_KEYWORDS[Math.floor(Math.random() * ENGAGEMENT_KEYWORDS.length)];
  console.log(`Searching for: ${keyword}`);

  const tweets = await client.v2.search({
    query: keyword,
    'tweet.fields': ['author_id', 'conversation_id'],
    max_results: 10,
  });

  if (!tweets.data || tweets.data.length === 0) {
    console.log('No tweets found');
    return;
  }

  const state = loadState();
  let engaged = 0;

  for (const tweet of tweets.data) {
    if (state.engaged.includes(tweet.id)) continue;
    if (tweet.author_id === env.TWITTER_USERNAME.replace('@', '')) continue;

    try {
      await client.v2.like(env.ACCESS_TOKEN.split('-')[0], tweet.id);
      console.log(`Liked: ${tweet.id}`);

      let reply = await generateReply(tweet.text, tweet.author_id || 'user');
      if (!reply) {
        reply = getFallbackReply();
        console.log('Using fallback reply (AI unavailable)');
      }
      await client.v2.reply(reply, tweet.id);
      console.log(`Replied: ${reply}`);

      state.engaged.push(tweet.id);
      engaged++;

      if (engaged >= 3) break;

      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.log(`Failed on tweet ${tweet.id}: ${err.message}`);
    }
  }

  saveState(state);
  console.log(`Engaged with ${engaged} tweets`);
}
