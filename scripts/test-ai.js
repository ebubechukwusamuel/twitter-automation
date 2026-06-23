import { generateTweet, generateReply } from '../src/ai.js';

const tweet = await generateTweet('why simple design wins');
console.log('Generated tweet:', tweet);
console.log('Length:', tweet.length);

const reply = await generateReply('Just launched my new portfolio site! Took me 3 months but finally happy with it.', 'user123');
console.log('Generated reply:', reply);
console.log('Length:', reply.length);
