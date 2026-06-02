import OpenAI from 'openai';
import { env } from './env.config';

let openaiClient: OpenAI;

export function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

export const openaiConfig = {
  model: env.OPENAI_MODEL,
  maxTokens: env.OPENAI_MAX_TOKENS,
  temperature: env.OPENAI_TEMPERATURE,
};
