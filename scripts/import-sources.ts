import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const csvPath = resolve(process.cwd(), 'data/M5_SBI_Mutual_Fund_Source_List.csv');
const requiredColumns = [
  'ID',
  'Source Name',
  'Scheme/Scope',
  'Information Covered',
  'Official URL',
  'Purpose',
] as const;
const schemeNames = new Set([
  'SBI Large Cap Fund',
  'SBI Flexicap Fund',
  'SBI Small Cap Fund',
  'SBI ELSS Tax Saver Fund',
]);
const allowedHosts = new Set(['sbimf.com', 'sebi.gov.in', 'amfiindia.com']);

type CsvRow = Record<(typeof requiredColumns)[number], string>;

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function readRows(): CsvRow[] {
  const parsed = parseCsv(readFileSync(csvPath, 'utf8'));
  const header = parsed.shift() ?? [];
  if (header.length !== requiredColumns.length || requiredColumns.some((column, index) => header[index] !== column)) {
    throw new Error('CSV header does not match the approved source registry format');
  }

  return parsed
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(requiredColumns.map((column, index) => [column, values[index] ?? ''])) as CsvRow);
}

function validateRow(row: CsvRow): string[] {
  const errors: string[] = [];
  if (!/^\d+$/.test(row.ID)) errors.push('ID must be an integer');
  for (const column of requiredColumns.slice(1)) {
    if (!row[column].trim()) errors.push(`${column} is required`);
  }
  try {
    const url = new URL(row['Official URL']);
    if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase().replace(/^www\./, ''))) {
      errors.push('URL is not an approved official domain');
    }
  } catch {
    errors.push('URL is invalid');
  }
  if (row['Scheme/Scope'] !== 'SBI Mutual Fund' && !schemeNames.has(row['Scheme/Scope'])) {
    errors.push('Scheme/Scope is not an approved scheme or general scope');
  }
  return errors;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Supabase server configuration is missing');

  const rows = readRows();
  const rejected = rows.map((row, index) => ({ row, errors: validateRow(row), index: index + 2 })).filter(({ errors }) => errors.length);
  const valid = rows.filter((row) => validateRow(row).length === 0);
  const supabase = createClient<Database>(url, serviceRoleKey);
  const { data: schemes, error: schemesError } = await supabase.from('schemes').select('id, name');
  if (schemesError) throw new Error(`Could not load schemes: ${schemesError.message}`);
  const schemeIds = new Map((schemes ?? []).map((scheme) => [scheme.name, scheme.id]));
  const missingScheme = valid.find((row) => row['Scheme/Scope'] !== 'SBI Mutual Fund' && !schemeIds.has(row['Scheme/Scope']));
  if (missingScheme) throw new Error(`Scheme is not seeded: ${missingScheme['Scheme/Scope']}`);

  const urls = valid.map((row) => row['Official URL']);
  const { data: existing, error: existingError } = await supabase.from('sources').select('url').in('url', urls);
  if (existingError) throw new Error(`Could not check existing sources: ${existingError.message}`);
  const existingUrls = new Set((existing ?? []).map((source) => source.url));
  const newRows = valid.filter((row) => !existingUrls.has(row['Official URL']));
  const sources = newRows.map((row) => {
    const host = new URL(row['Official URL']).hostname.toLowerCase().replace(/^www\./, '');
    return {
      registry_id: Number(row.ID),
      title: row['Source Name'],
      scope: row['Scheme/Scope'],
      information_covered: row['Information Covered'],
      purpose: row.Purpose,
      url: row['Official URL'],
      domain: host,
      source_type: row.Purpose,
      scheme_id: schemeIds.get(row['Scheme/Scope']) ?? null,
      status: 'approved',
    };
  });
  if (sources.length) {
    const { error: insertError } = await supabase.from('sources').insert(sources);
    if (insertError) throw new Error(`Could not insert sources: ${insertError.message}`);
  }

  console.log(`CSV rows found: ${rows.length}`);
  console.log(`Valid sources: ${valid.length}`);
  console.log(`Rejected sources: ${rejected.length}`);
  console.log(`Sources inserted: ${sources.length}`);
  console.log(`Duplicates skipped: ${valid.length - sources.length}`);
  if (rejected.length) console.log(`Errors: ${rejected.map(({ index, errors }) => `row ${index}: ${errors.join('; ')}`).join(' | ')}`);
  else console.log('Errors: none');
}

main().catch((error: unknown) => {
  console.error(`Import failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});