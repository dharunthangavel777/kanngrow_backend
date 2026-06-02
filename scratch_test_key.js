const dotenv = require('dotenv');
dotenv.config();

const rawKey = process.env.FIREBASE_PRIVATE_KEY;
console.log('Raw key length:', rawKey ? rawKey.length : 'undefined');
console.log('Raw key representation:', JSON.stringify(rawKey));

const processedKey = rawKey ? rawKey.replace(/\\n/g, '\n') : '';
console.log('Processed key length:', processedKey.length);
console.log('Processed key representation:', JSON.stringify(processedKey));
