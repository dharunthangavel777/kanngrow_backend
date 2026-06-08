// ── Language Engine (0ms detection) ───────────────────────────────────────────
import { LanguageCode } from '../dna/dna.types';

export interface LanguageProfile {
  detected: LanguageCode;
  script: 'latin' | 'tamil' | 'devanagari' | 'malayalam' | 'telugu' | 'kannada' | 'bengali';
  instruction: string;
}

export function detectLanguage(message: string): LanguageProfile {
  const hasTamilScript = /[\u0B80-\u0BFF]/.test(message);
  const hasDevanagari  = /[\u0900-\u097F]/.test(message);
  const hasMalayalam   = /[\u0D00-\u0D7F]/.test(message);
  const hasTelugu      = /[\u0C00-\u0C7F]/.test(message);
  const hasKannada     = /[\u0C80-\u0CFF]/.test(message);
  const hasBengali     = /[\u0980-\u09FF]/.test(message);
  const hasEnglish     = /[a-zA-Z]{2,}/.test(message);
  const lm             = message.toLowerCase();

  const tanglishWords = ['la', 'da', 'bro', 'pa', 'naa', 'enna', 'epdi', 'sollu', 'yenna',
    'panna', 'iruku', 'illai', 'seri', 'machan', 'dei', 'pannalam', 'vaanga', 'romba', 'konjam'];
  const isTanglish = hasEnglish && tanglishWords.some(w =>
    lm.includes(` ${w} `) || lm.endsWith(` ${w}`) || lm.startsWith(`${w} `)
  );

  const hinglishWords = ['kya', 'kar', 'hai', 'nahi', 'aur', 'bhai', 'yaar', 'matlab',
    'theek', 'accha', 'haan', 'toh', 'abhi', 'bohot', 'thoda', 'kuch', 'mujhe', 'apna'];
  const isHinglish = hasEnglish && hinglishWords.some(w =>
    lm.includes(` ${w} `) || lm.endsWith(` ${w}`) || lm.startsWith(`${w} `)
  );

  if (hasTamilScript && hasEnglish) return build('tanglish', 'latin');
  if (isTanglish)                   return build('tanglish', 'latin');
  if (hasTamilScript)               return build('tamil', 'tamil');
  if (hasDevanagari && hasEnglish)  return build('hinglish', 'latin');
  if (isHinglish)                   return build('hinglish', 'latin');
  if (hasDevanagari)                return build('hindi', 'devanagari');
  if (hasMalayalam)                 return build('malayalam', 'malayalam');
  if (hasTelugu)                    return build('telugu', 'telugu');
  if (hasKannada)                   return build('kannada', 'kannada');
  if (hasBengali)                   return build('bengali', 'bengali');
  return build('english', 'latin');
}

function build(lang: LanguageCode, script: LanguageProfile['script']): LanguageProfile {
  return { detected: lang, script, instruction: getInstruction(lang) };
}

function getInstruction(lang: LanguageCode): string {
  const map: Record<LanguageCode, string> = {
    english:   `LANGUAGE: Respond in natural, clear English.`,
    tanglish:  `LANGUAGE RULE (NON-NEGOTIABLE): The user writes in Tanglish (Tamil+English mixed). YOU MUST respond in Tanglish.
Style: "Bro, ithu super idea da! Tiruppur-la garments wholesale-a source pannitu Meesho-la list pannu — margin romba nalla irukkum."
Use English words with Tamil sentence flow and rhythm. Never switch to formal English. Never use Tamil script.`,
    tamil:     `LANGUAGE RULE (NON-NEGOTIABLE): The user writes in Tamil script. YOU MUST respond in Tamil script.
Write naturally like a business advisor who speaks Tamil fluently. Use respectful நீங்கள் form.`,
    hindi:     `LANGUAGE RULE (NON-NEGOTIABLE): The user writes in Hindi (Devanagari). YOU MUST respond in Hindi. Write clearly and naturally.`,
    hinglish:  `LANGUAGE RULE (NON-NEGOTIABLE): The user writes in Hinglish (Hindi+English mixed). YOU MUST respond in Hinglish.
Style: "Bhai, yeh idea solid hai! Textile reselling mein margin 35-50% tak hota hai, Meesho pe start karna bahut easy hai."`,
    malayalam: `LANGUAGE RULE (NON-NEGOTIABLE): The user writes in Malayalam. YOU MUST respond in Malayalam script.`,
    telugu:    `LANGUAGE RULE (NON-NEGOTIABLE): The user writes in Telugu. YOU MUST respond in Telugu script.`,
    kannada:   `LANGUAGE RULE (NON-NEGOTIABLE): The user writes in Kannada. YOU MUST respond in Kannada script.`,
    bengali:   `LANGUAGE RULE (NON-NEGOTIABLE): The user writes in Bengali. YOU MUST respond in Bengali script.`,
    mixed:     `LANGUAGE: Respond in English, warm and conversational.`,
  };
  return map[lang] ?? map.english;
}
