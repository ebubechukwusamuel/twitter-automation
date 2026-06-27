import Groq from 'groq-sdk';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

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
  if (process.env.GROQ_API_KEY) env.GROQ_API_KEY = process.env.GROQ_API_KEY;
  return env;
}

const env = loadEnv();
const groq = new Groq({ apiKey: env.GROQ_API_KEY || env.GROC_API_kEY });

const PERSONA = `You are Ebube, a freelance designer and developer in Nigeria. You tweet about design, development, freelancing, and building in public. Your tweets are casual, conversational, and authentic — like a real person sharing their thoughts, not a marketing bot. You use natural language, occasional abbreviations, and write like you're talking to a friend. No hashtags. No emojis. Just real talk.

IMPORTANT: Never post anything about the "Mr Elijah" project or any work related to it. Do not mention or reference it in any tweet.`;

function parseTweet(text) {
  return text.replace(/^["']|["']$/g, '').replace(/^Tweet:\s*/i, '').trim();
}

const MODELS = ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.1-8b-instant'];

async function generateWithRetry(prompt) {
  for (const modelName of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await groq.chat.completions.create({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
        });
        return result.choices[0]?.message?.content || null;
      } catch (err) {
        const retryable = err.message?.includes('429') || err.message?.includes('503') || err.message?.includes('quota') || err.message?.includes('Too Many');
        if (retryable && attempt === 0) {
          console.log(`${modelName} busy, retrying...`);
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        console.log(`${modelName} error: ${err.message?.substring(0, 100)}`);
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

export async function generatePost(withImage = false) {
  let prompt
  if (withImage) {
    prompt = `${PERSONA}\n\nWrite one tweet (under 280 characters) about something you're currently working on, a project you recently finished, a behind-the-scenes look at your workflow, or your work environment. Make it sound completely natural — like you're sharing a quick update. Mention what you're building or designing.

Focus on these topics:
- What you're currently working on
- A project you've completed (UI design, brand identity, website, app)
- Behind-the-scenes of your workflow / tools
- Your work environment or setup
- A design or dev challenge you solved

After the tweet, on a new line, write IMAGE_TYPE: followed by one of: project, code, design, mobile, general. Pick the closest match to the tweet.
- project: tweet about a specific finished project or client work
- code: tweet about coding, development workflow, tools
- design: tweet about UI/UX, brand identity, visual design
- mobile: general or personal update
- general: anything else

Example output:
Just shipped a complete brand identity for a health startup. Logo, color system, typography, the whole thing. Client loved it.
IMAGE_TYPE: design`
  } else {
    prompt = `${PERSONA}\n\nWrite one tweet (under 280 characters) about design, development, freelancing, or building in public. Make it sound completely natural — a thought, opinion, or personal reflection.`
  }

  const result = await generateWithRetry(prompt);
  if (!result) return { text: null, imageType: null };

  const lines = result.trim().split('\n');
  let imageType = null;
  const typeLine = lines.find(l => l.startsWith('IMAGE_TYPE:'));
  if (typeLine) {
    imageType = typeLine.replace('IMAGE_TYPE:', '').trim().toLowerCase();
  }
  const text = parseTweet(lines.filter(l => !l.startsWith('IMAGE_TYPE:')).join('\n'));
  return { text, imageType };
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
