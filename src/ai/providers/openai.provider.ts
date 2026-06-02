import { getOpenAI, openaiConfig } from '../../core/config/openai.config';
import { logger } from '../../core/config/logger.config';
import { env } from '../../core/config/env.config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'json';
}

export class OpenAIProvider {
  private client = getOpenAI();

  async complete(options: CompletionOptions): Promise<string> {
    const {
      messages,
      model = openaiConfig.model,
      maxTokens = openaiConfig.maxTokens,
      temperature = openaiConfig.temperature,
      responseFormat = 'text',
    } = options;

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        ...(responseFormat === 'json'
          ? { response_format: { type: 'json_object' } }
          : {}),
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from OpenAI');

      logger.debug(`OpenAI tokens used: ${response.usage?.total_tokens}`);
      return content;
    } catch (error) {
      logger.error(`OpenAI error: ${(error as Error).message}`);
      throw error;
    }
  }

  async completeJSON<T>(options: CompletionOptions): Promise<T> {
    const text = await this.complete({ ...options, responseFormat: 'json' });
    return JSON.parse(text) as T;
  }
}

