import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const model = 'gemini-embedding-001';
const embeddingDimension = 768;
const batchSize = 100;
const pageSize = 500;
const maxAttempts = 5;
const requestTimeoutMs = 60_000;

type Chunk = Database['public']['Tables']['document_chunks']['Row'];

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

function normalize(values: number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) throw new Error('Embedding has zero or invalid magnitude');
  return values.map((value) => value / magnitude);
}

function asVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

function parseStoredEmbedding(value: number[] | string | null): number[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const parsed = value.slice(1, -1).split(',').filter(Boolean).map(Number);
    return parsed.every(Number.isFinite) ? parsed : null;
  }
  return null;
}

function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return /429|rate.?limit|timeout|timed out|temporar|unavailable|503|500/.test(message);
}

async function embedBatch(ai: GoogleGenAI, chunks: Chunk[]): Promise<number[][]> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await ai.models.embedContent({
        model,
        contents: chunks.map((chunk) => chunk.content),
        config: {
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: embeddingDimension,
          abortSignal: controller.signal,
        },
      });
      const embeddings = response.embeddings?.map((embedding) => embedding.values ?? []);
      if (!embeddings || embeddings.length !== chunks.length) throw new Error('Gemini returned an unexpected embedding count');
      return embeddings.map((values) => {
        if (values.length !== embeddingDimension || values.some((value) => !Number.isFinite(value))) {
          throw new Error(`Gemini returned an invalid embedding dimension; expected ${embeddingDimension}`);
        }
        return normalize(values);
      });
    } catch (error: unknown) {
      if (attempt === maxAttempts || !isRetryable(error)) throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 2 ** (attempt - 1) * 1000 + Math.random() * 250));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('Embedding batch failed');
}

async function loadUnembedded(supabase: ReturnType<typeof createClient<Database>>): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('document_chunks').select('*').is('embedding', null).order('document_id').order('chunk_index').range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Could not load unembedded chunks: ${error.message}`);
    chunks.push(...((data ?? []) as Chunk[]));
    if (!data || data.length < pageSize) return chunks;
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.GEMINI_API_KEY) throw new Error('Required server configuration is missing');
  const supabase = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { count: total, error: countError } = await supabase.from('document_chunks').select('id', { count: 'exact', head: true });
  if (countError) throw new Error(`Could not count chunks: ${countError.message}`);
  if (total !== 1167) throw new Error(`Expected 1167 chunks, found ${total ?? 0}`);
  const unembedded = await loadUnembedded(supabase);
  const alreadyEmbedded = total - unembedded.length;
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  let successful = 0;
  let failed = 0;
  for (let offset = 0; offset < unembedded.length; offset += batchSize) {
    const batch = unembedded.slice(offset, offset + batchSize);
    try {
      const embeddings = await embedBatch(ai, batch);
      for (let index = 0; index < batch.length; index += 1) {
        const { error } = await supabase.from('document_chunks').update({ embedding: asVectorLiteral(embeddings[index]) }).eq('id', batch[index].id).is('embedding', null);
        if (error) throw new Error(`Could not store embedding: ${error.message}`);
        successful += 1;
      }
    } catch (error: unknown) {
      failed += batch.length;
      console.error(`Batch ${Math.floor(offset / batchSize) + 1} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  const { data: stored, error: storedError } = await supabase.from('document_chunks').select('embedding').not('embedding', 'is', null);
  if (storedError) throw new Error(`Could not validate stored embeddings: ${storedError.message}`);
  const invalid = (stored ?? []).filter((chunk) => parseStoredEmbedding(chunk.embedding)?.length !== embeddingDimension);
  if (invalid.length) throw new Error(`${invalid.length} stored embeddings do not contain exactly ${embeddingDimension} values`);
  const { count: remaining, error: remainingError } = await supabase.from('document_chunks').select('id', { count: 'exact', head: true }).is('embedding', null);
  if (remainingError) throw new Error(`Could not count remaining chunks: ${remainingError.message}`);
  console.log('Embedding generation complete');
  console.log(`Total chunks: ${total}`);
  console.log(`Already embedded: ${alreadyEmbedded}`);
  console.log(`Successfully embedded: ${successful}`);
  console.log(`Failed: ${failed}`);
  console.log(`Remaining unembedded: ${remaining ?? 0}`);
  console.log(`Embedding dimension: ${embeddingDimension}`);
}

main().catch((error: unknown) => {
  console.error(`Embedding generation failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});