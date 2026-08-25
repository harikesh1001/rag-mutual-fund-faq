import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'cheerio';
import { PDFParse } from 'pdf-parse';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const requestTimeoutMs = 30_000;
const allowedHosts = new Set(['sbimf.com', 'sebi.gov.in', 'amfiindia.com']);

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

function validateOfficialUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (url.protocol !== 'https:' || !allowedHosts.has(host)) {
    throw new Error('URL is not an approved official HTTPS domain');
  }
  return url;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function cleanHtml(html: string): string {
  const document = load(html);
  document('script, style, noscript, template, nav, header, footer, aside, form, svg').remove();
  const blocks = document('body').find('h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote, pre')
    .map((_, element) => document(element).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter(Boolean);
  const text = blocks.length ? blocks.join('\n') : document('body').text();
  return text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

async function extractDocument(response: Response, sourceUrl: URL): Promise<{ type: 'html' | 'pdf'; content: string }> {
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const isPdf = contentType.includes('application/pdf') || sourceUrl.pathname.toLowerCase().endsWith('.pdf') || bytes.subarray(0, 4).toString() === '%PDF';
  if (isPdf) {
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText();
      return { type: 'pdf', content: result.text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim() };
    } finally {
      await parser.destroy();
    }
  }
  return { type: 'html', content: cleanHtml(bytes.toString('utf8')) };
}

async function fetchSource(source: Source): Promise<{ source: Source; content: string; type: 'html' | 'pdf'; status: number; hash: string }> {
  const sourceUrl = validateOfficialUrl(source.url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'text/html, application/pdf' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    validateOfficialUrl(response.url);
    const extracted = await extractDocument(response, sourceUrl);
    if (!extracted.content) throw new Error('No readable text extracted');
    return { source, content: extracted.content, type: extracted.type, status: response.status, hash: hashContent(extracted.content) };
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase server configuration is missing');
  const supabase = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sources, error: sourceError } = await supabase.from('sources').select('*').eq('status', 'approved').order('registry_id');
  if (sourceError) throw new Error(`Could not load approved sources: ${sourceError.message}`);
  const { error: schemaError } = await supabase.from('documents').select('document_type, http_status, extraction_status, error_message').limit(0);
  if (schemaError) throw new Error(`Documents schema is missing ingestion metadata; apply supabase/migrations/006_document_ingestion_metadata.sql first: ${schemaError.message}`);
  const { data: documents, error: documentError } = await supabase.from('documents').select('*').order('version', { ascending: false });
  if (documentError) throw new Error(`Could not load existing documents: ${documentError.message}`);

  const latest = new Map<string, Document>();
  for (const document of documents ?? []) {
    if (!latest.has(document.source_id)) latest.set(document.source_id, document);
  }
  let successful = 0;
  let failed = 0;
  let html = 0;
  let pdf = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const source of (sources ?? []) as Source[]) {
    let fetched: Awaited<ReturnType<typeof fetchSource>>;
    try {
      fetched = await fetchSource(source);
    } catch (error: unknown) {
      failed += 1;
      const message = error instanceof Error ? error.message : 'Unknown fetch or extraction error';
      failures.push(`${source.url}: ${message}`);
      const previous = latest.get(source.id);
      const failureDocument = {
        source_id: source.id,
        content: previous?.extraction_status === 'failed' ? previous.content : '',
        content_hash: previous?.extraction_status === 'failed' ? previous.content_hash : hashContent(''),
        version: previous?.extraction_status === 'failed' ? previous.version : 1,
        fetched_at: new Date().toISOString(),
        document_type: previous?.document_type ?? 'unknown',
        http_status: null,
        extraction_status: 'failed',
        error_message: message,
      };
      if (previous?.extraction_status === 'failed') {
        const { error: updateError } = await supabase.from('documents').update(failureDocument).eq('id', previous.id);
        if (updateError) failures.push(`${source.url}: ${updateError.message}`);
      } else {
        const { error: insertError } = await supabase.from('documents').insert(failureDocument);
        if (insertError) failures.push(`${source.url}: ${insertError.message}`);
      }
      continue;
    }

    const previous = latest.get(source.id);
    const { error: sourceUpdateError } = await supabase.from('sources').update({ last_fetched_at: new Date().toISOString(), checksum: fetched.hash }).eq('id', source.id);
    if (sourceUpdateError) {
      failed += 1;
      failures.push(`${source.url}: ${sourceUpdateError.message}`);
      continue;
    }
    if (previous?.extraction_status === 'success' && previous.content_hash === fetched.hash) {
      skipped += 1;
      continue;
    }
    const nextVersion = (previous?.version ?? 0) + 1;
    const { error: insertError } = await supabase.from('documents').insert({
      source_id: source.id,
      content: fetched.content,
      content_hash: fetched.hash,
      version: nextVersion,
      fetched_at: new Date().toISOString(),
      document_type: fetched.type,
      http_status: fetched.status,
      extraction_status: 'success',
      error_message: null,
    });
    if (insertError) {
      failed += 1;
      failures.push(`${source.url}: ${insertError.message}`);
      continue;
    }
    successful += 1;
    if (fetched.type === 'pdf') pdf += 1;
    else html += 1;
  }

  console.log('Source ingestion complete');
  console.log(`Total sources: ${(sources ?? []).length}`);
  console.log(`Fetched successfully: ${successful}`);
  console.log(`Failed: ${failed}`);
  console.log(`HTML: ${html}`);
  console.log(`PDF: ${pdf}`);
  console.log(`Skipped/unchanged: ${skipped}`);
  console.log(`Errors: ${failures.length ? failures.join(' | ') : 'none'}`);
}

main().catch((error: unknown) => {
  console.error(`Ingestion failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});