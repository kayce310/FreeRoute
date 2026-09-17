import { DEFAULT_THINKING_AG_SIGNATURE } from '../src/config/thinking-signatures.js';
const buf = Buffer.from(DEFAULT_THINKING_AG_SIGNATURE, 'base64');
console.log('length:', DEFAULT_THINKING_AG_SIGNATURE.length);
console.log('rem 4:', DEFAULT_THINKING_AG_SIGNATURE.length % 4);
console.log('valid base64:', buf.toString('base64') === DEFAULT_THINKING_AG_SIGNATURE);
