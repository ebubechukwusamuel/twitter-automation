import { GoogleGenerativeAI } from '@google/generative-ai';
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
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

const PERSONA = `You are Ebube, a freelance designer and developer in Nigeria. You tweet about design, development, freelancing, and building in public. Your tweets are casual, conversational, and authentic — like a real person sharing their thoughts, not a marketing bot. You use natural language, occasional abbreviations, and write like you're talking to a friend. No hashtags. No emojis. Just real talk.`;

function parseTweet(text) {
  return text.replace(/^["']|["']$/g, '').replace(/^Tweet:\s*/i, '').trim();
}

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro'];

async function generateWithRetry(prompt) {
  for (const modelName of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (err) {
        const retryable = err.message?.includes('429') || err.message?.includes('503') || err.message?.includes('quota') || err.message?.includes('Too Many');
        if (retryable && attempt === 0) {
          console.log(`${modelName} busy, retrying...`);
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        if (modelName !== MODELS[MODELS.length - 1]) {
          console.log(`${modelName} failed, trying next model...`);
          break;
        }
        return null;
      }
    }
  }
}

export async function generateTweet(topic) {
  const prompt = `${PERSONA}\n\nWrite one tweet (under 280 characters) about ${topic || 'design, development, or freelancing'}. Make it sound completely natural — like something you'd actually post. No quotes. No hashtags. No emojis. Just the tweet text.`;
  const text = await generateWithRetry(prompt);
  return text ? parseTweet(text) : null;
}

export async function generateReply(tweetText, username) {
  const prompt = `${PERSONA}\n\nSomeone tweeted this:\n"${tweetText}"\n— by @${username}\n\nWrite a natural reply (under 200 characters) that sounds like a real person engaging with their content. Be thoughtful and specific to what they said. No hashtags. No emojis. Just the reply text.`;
  const text = await generateWithRetry(prompt);
  return text ? parseTweet(text) : null;
}

const FALLBACK_TWEETS = [
  "Just wrapped up a brand identity project. Love when a client gives full creative freedom — those always turn out the best.",
  "Spent the morning refactoring a React component. Went from 200 lines to 60. Feels good.",
  "Hot take: most freelancers undercharge because they don't track their time properly. Start tracking everything. You'll thank yourself.",
  "Building a new landing page template this week. Goal: make it convert without being salesy. There's a sweet spot.",
  "Three years into freelancing and I'm still learning new things every week. That's the best part.",
  "Design tip: when in doubt, add more whitespace. Works every time.",
  "Nothing beats the feeling of shipping a project you're genuinely proud of.",
  "Client asked for 'minimal but vibrant' today. Took me a second. But I think I nailed it.",
  "The gap between 'I can design this' and 'I can code this' is shrinking every year. Gotta keep up.",
  "Just discovered a Figma plugin that saves me 2 hours per project. Game changer.",
  "Freelancing isn't about being your own boss. It's about being your own IT, sales, marketing, accounting, and legal department. Still worth it though.",
  "Working on a mobile app UI right now. The challenge is making complex features feel simple.",
  "Consistency > perfection. Ship it, iterate, ship again.",
  "Tried a new CSS technique today that I've been putting off for months. Took 10 minutes.",
  "Spent the whole afternoon tweaking margins. Worth it. Design is in the details.",
  "Some clients think good design is expensive until they see what bad design costs them.",
  "Took a 2 hour break from screens today. Came back and fixed a bug in 5 minutes. Coincidence? I think not.",
];

const FALLBACK_REPLIES = [
  "This is a great perspective. Thanks for sharing!",
  "Really appreciate this take. Something to think about.",
  "Solid advice. Been learning this the hard way too.",
  "Completely agree with this. Simple always wins.",
  "Love seeing people share their process. Keep going!",
  "This hits home. Learned this lesson a few times myself.",
  "Great work! Clean and thoughtful.",
  "This is underrated. More people need to hear this.",
  "Exactly this. Took me a while to figure it out too.",
  "Thanks for sharing this. Helpful as always.",
];

export function getFallbackTweet() {
  return FALLBACK_TWEETS[Math.floor(Math.random() * FALLBACK_TWEETS.length)];
}

export function getFallbackReply() {
  return FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
}
