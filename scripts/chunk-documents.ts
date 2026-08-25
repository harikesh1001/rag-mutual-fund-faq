import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const targetTokens = 400;
const overlapTokens = 60;
const charactersPerToken = 4;

type Source = Database['public']['Tables']['sources']['Row'];
type Document = Database['public']['Tables']['documents']['Row'];

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function tokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / charactersPerToken));
}

function splitLongUnit(unit: string): string[] {
  const words = unit.split(/\s+/).filter(Boolean);
  const maxCharacters = targetTokens * charactersPerToken;
  const parts: string[] = [];
  let part = '';
  for (const word of words) {
    if (part && part.length + word.length + 1 > maxCharacters) {
      parts.push(part);
      part = '';
    }
    part = part ? `${part} ${word}` : word;
  }
  if (part) parts.push(part);
  return parts;
}

function isHeading(line: string): boolean {
  const trimmed = line.trim();
  return /^#{1,6}\s|^[A-Z][A-Z\s/&-]{4,}$|^\d+(?:\.\d+)*[.)]?\s+\S/.test(trimmed) || (trimmed.length <= 100 && /:$/.test(trimmed));
}

function makeUnits(content: string): string[] {
  const lines = content.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const units: string[] = [];
  let current = '';
  for (const line of lines) {
    if (isHeading(line) && current) {
      units.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) units.push(current);
  return units.flatMap((unit) => tokenCount(unit) > targetTokens ? splitLongUnit(unit) : [unit]);
}

function makeChunks(content: string): string[] {
  const units = makeUnits(content);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;
  for (const unit of units) {
    const unitTokens = tokenCount(unit);
    if (current.length && currentTokens + unitTokens > targetTokens) {
      chunks.push(current.join('\n\n'));
      const overlap: string[] = [];
      let overlapSize = 0;
      for (let index = current.length - 1; index >= 0 && overlapSize < overlapTokens; index -= 1) {
        overlap.unshift(current[index]);
        overlapSize += tokenCount(current[index]);
      }
      current = overlap;
      currentTokens = overlapSize;
    }
    current.push(unit);
    currentTokens += unitTokens;
  }
  if (current.length) chunks.push(current.join('\n\n'));
  return chunks;
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase server configuration is missing');
  const supabase = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: documents, error: documentError } = await supabase.from('documents').select('*').eq('extraction_status', 'success').order('created_at');
  if (documentError) throw new Error(`Could not load ingested documents: ${documentError.message}`);
  const { error: schemaError } = await supabase.from('document_chunks').select('source_id, source_title, amc, document_type, chunk_hash').limit(0);
  if (schemaError) throw new Error(`Chunk schema is missing metadata; apply supabase/migrations/007_chunk_metadata.sql first: ${schemaError.message}`);
  const sourceIds = [...new Set((documents ?? []).map((document) => document.source_id))];
  const { data: sources, error: sourceError } = await supabase.from('sources').select('*').in('id', sourceIds);
  if (sourceError) throw new Error(`Could not load document sources: ${sourceError.message}`);
  const sourceById = new Map((sources ?? []).map((source) => [source.id, source as Source]));
  let created = 0;
  let skipped = 0;
  let errors = 0;
  const sizes: number[] = [];

  for (const document of (documents ?? []) as Document[]) {
    const source = sourceById.get(document.source_id);
    if (!source) {
      errors += 1;
      console.error(`Document ${document.id}: source metadata not found`);
      continue;
    }
    const chunks = makeChunks(document.content);
    const rows = chunks.map((content, chunkIndex) => ({
      document_id: document.id,
      chunk_index: chunkIndex,
      content,
      scheme_id: source.scheme_id,
      topic: null,
      source_url: source.url,
      publication_date: source.publication_date,
      source_id: source.id,
      source_title: source.title,
      amc: 'SBI Mutual Fund',
      document_type: document.document_type,
      chunk_hash: hashContent(content),
    }));
    if (!rows.length) continue;
    const { data: existing, error: existingError } = await supabase.from('document_chunks').select('chunk_index, chunk_hash, topic').eq('document_id', document.id);
    if (existingError) throw new Error(`Could not check chunks for ${document.id}: ${existingError.message}`);
    const existingKeys = new Set((existing ?? []).map((chunk) => `${chunk.chunk_index}:${chunk.chunk_hash}`));
    const existingTopics = new Map((existing ?? []).map((chunk) => [chunk.chunk_index, chunk.topic]));
    const rebuiltRows = rows.map((row) => ({
      ...row,
      topic: existingTopics.get(row.chunk_index) ?? null,
      embedding: null,
    }));
    const newRows = rebuiltRows.filter((row) => !existingKeys.has(`${row.chunk_index}:${row.chunk_hash}`));
    if (rebuiltRows.length) {
      const { error: upsertError } = await supabase.from('document_chunks').upsert(rebuiltRows, { onConflict: 'document_id,chunk_index' });
      if (upsertError) {
        errors += 1;
        console.error(`Document ${document.id}: ${upsertError.message}`);
        continue;
      }
      const { error: deleteError } = await supabase.from('document_chunks').delete().eq('document_id', document.id).gte('chunk_index', rebuiltRows.length);
      if (deleteError) {
        errors += 1;
        console.error(`Document ${document.id}: ${deleteError.message}`);
        continue;
      }
      created += newRows.length;
      sizes.push(...rebuiltRows.map((row) => tokenCount(row.content)));
    }
    skipped += rebuiltRows.length - newRows.length;
  }

  const minimum = sizes.length ? Math.min(...sizes) : 0;
  const maximum = sizes.length ? Math.max(...sizes) : 0;
  const average = sizes.length ? sizes.reduce((total, size) => total + size, 0) / sizes.length : 0;
  console.log(`Documents processed: ${(documents ?? []).length}`);
  console.log(`Chunks created: ${created}`);
  console.log(`Chunks skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Chunk size (tokens, approximate) - minimum: ${minimum}, maximum: ${maximum}, average: ${average.toFixed(1)}`);
}

main().catch((error: unknown) => {
  console.error(`Chunking failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});