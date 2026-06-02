import { v4 as uuidv4 } from 'uuid';

export const generateId = (): string => uuidv4();

export const toTimestamp = (): string => new Date().toISOString();

export function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );
}

export function sanitizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
