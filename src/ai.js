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

const PERSONA = `You are Ebube (Ebubechukwu Samuel), a freelance designer & developer. You tweet about what you're ACTUALLY building — real projects, real code, real design work. Your tweets are casual, conversational, and authentic. You use natural language, occasional abbreviations, and write like you're talking to a friend. No hashtags. No emojis. Just real talk.

REAL PROJECTS YOU'VE BUILT (reference these):
- Flowtrack: project management web app with real-time chat, task management, teams (Next.js, Prisma, PeerJS, Three.js)
- Kredo: all-in-one freelancer OS — proposals, contracts, invoices, time tracking, client portal (Next.js, shadcn/ui, Prisma, Paystack, Stripe, n8n)
- Spyglass: CLI tool that indexes codebases with vector embeddings and answers questions via RAG (Node.js, Ollama, OpenAI, SQLite)
- Portfolio: ebubesamuel.vercel.app — your personal portfolio site
- LinkedIn Optimizer: n8n automation workflow that scrapes profiles and generates optimized rewrites via GPT-4o
- Twitter Automation: this exact bot you're tweeting from

YOUR TOOLS: Figma, Illustrator, Photoshop, VS Code, Next.js, React, Tailwind, Flutter, React Native, Prisma, Postgres, n8n, Git

YOUR SERVICES: Brand identity, website design & development, mobile apps, UI/UX design, brand strategy

IMPORTANT: Don't lie. Only tweet about your actual work and experience. If you don't have experience with something, don't pretend you do.`;

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
    prompt = `${PERSONA}\n\nWrite one tweet (under 280 characters) about your ACTUAL current work or a real project you've built. Be specific — name the project, the tech, the challenge. Make it sound like a genuine update, not marketing.

Focus on these REAL topics:
- What you're working on right now (Flowtrack, Kredo, Spyglass, or client work)
- A real project you've shipped (use its exact name: Flowtrack, Kredo, Spyglass, portfolio, Mazion Brand, Twitter Automation, LinkedIn Optimizer)
- Behind-the-scenes of your actual workflow / tools
- A design or dev challenge you actually solved
- Freelancing lessons from your real experience

After the tweet, on a new line, write IMAGE_TYPE: followed by one of: project, code, design, mobile, general. Pick the closest match to the tweet.
- project: tweet is about a specific project (Flowtrack, Kredo, Spyglass, portfolio, client site)
- code: tweet about coding, dev workflow, tools, debugging
- design: tweet about UI/UX, brand identity, Figma, visual design
- mobile: general update, freelancing, personal
- general: anything else

Then on the next line, write MATCH: followed by the specific project name or keyword if you mentioned one (e.g., Flowtrack, Kredo, Spyglass, Twitter, Automation, Mazion, Brand). If no specific project is named, write MATCH: none.

Example output:
Been refactoring Flowtrack's real-time chat to use PeerJS instead of polling. Way fewer requests and messages appear instantly.
IMAGE_TYPE: code
MATCH: Flowtrack

Example output:
Just finished the Kredo invoice PDF generator. Download link, line items, Paystack payment link — all in one clean template.
IMAGE_TYPE: project
MATCH: Kredo

Example output:
Three years freelancing and I've learned: charge by value not by hour, always use contracts, and track every single minute. The tools matter less than the habits.
IMAGE_TYPE: general
MATCH: none

Example output:
Designed a full brand identity for a fintech client yesterday. Logo, type scale, color tokens, component library in Figma. Clean and systematic.
IMAGE_TYPE: design
MATCH: none

Example output:
Reorganized my entire VS Code workspace today. Project templates, consistent folder structure, shared ESLint/Prettier configs across all repos.
IMAGE_TYPE: code
MATCH: none`
  } else {
    prompt = `${PERSONA}\n\nWrite one tweet (under 280 characters) about freelancing, design, or development from YOUR real experience. A genuine thought or lesson learned building projects like Flowtrack, Kredo, Spyglass, or doing client work. Keep it authentic — no made-up stories.`
  }

  const result = await generateWithRetry(prompt);
  if (!result) return { text: null, imageType: null, match: null };

  const lines = result.trim().split('\n');
  let imageType = null;
  let match = null;
  const typeLine = lines.find(l => l.startsWith('IMAGE_TYPE:'));
  if (typeLine) {
    imageType = typeLine.replace('IMAGE_TYPE:', '').trim().toLowerCase();
  }
  const matchLine = lines.find(l => l.startsWith('MATCH:'));
  if (matchLine) {
    match = matchLine.replace('MATCH:', '').trim().toLowerCase();
    if (match === 'none') match = null;
  }
  const text = parseTweet(lines.filter(l => !l.startsWith('IMAGE_TYPE:') && !l.startsWith('MATCH:')).join('\n'));
  return { text, imageType, match };
}

export async function generateReply(tweetText, username) {
  const prompt = `${PERSONA}\n\nSomeone tweeted this:\n"${tweetText}"\n— by @${username}\n\nWrite a natural reply (under 200 characters) that sounds like a genuine person engaging with their content. Be specific to what they said. No hashtags. No emojis. Just the reply text.`;
  const text = await generateWithRetry(prompt);
  return text ? parseTweet(text) : null;
}

const FALLBACK_TWEETS = [
  "Been refactoring Flowtrack's real-time chat to use PeerJS instead of polling. Way fewer requests and messages appear instantly.",
  "Just shipped the Kredo invoice system. PDF download, Paystack payment link, line items — all in one clean template.",
  "Spent the morning cleaning up Prisma queries in Flowtrack. Cut about 40% of database calls by batching relations properly.",
  "Hot take: most freelancers undercharge because they don't track their time properly. Start tracking everything. You'll thank yourself.",
  "Three years freelancing and I'm still learning new things every week. That's the best part.",
  "Design tip: when in doubt, add more whitespace. Works every time.",
  "Nothing beats the feeling of shipping a project you're genuinely proud of.",
  "Built a CLI tool called Spyglass that indexes codebases with vector embeddings. Basically grep that understands your code.",
  "Freelancing isn't about being your own boss. It's about being your own IT, sales, marketing, accounting, and legal department. Still worth it though.",
  "Working on a multi-tenant app right now. The challenge is making complex permissions feel simple.",
  "Consistency > perfection. Ship it, iterate, ship again.",
  "Just set up n8n to automate LinkedIn profile rewrites with GPT-4o. Scrapes the profile, generates optimized copy, uploads to Drive.",
  "Setting up consistent ESLint, Prettier, and TS configs across all my projects. Future me will be grateful.",
  "The gap between 'I can design this' and 'I can code this' is shrinking every year. Gotta keep up.",
  "Building a freelancer OS called Kredo. Proposals, contracts, invoices, time tracking — all in one place. Replaces 5 tools.",
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
