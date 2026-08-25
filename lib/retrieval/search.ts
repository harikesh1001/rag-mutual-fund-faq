import { createClient } from "@supabase/supabase-js";

export type RetrievedChunk = {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  scheme_id: string | null;
  topic: string | null;
  source_url: string;
  publication_date: string | null;
  source_id: string | null;
  source_title: string;
  amc: string;
  document_type: string;
  chunk_hash: string;
  similarity: number;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
}

if (!supabaseServiceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
}

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

export async function searchDocumentChunks(
  queryEmbedding: number[],
  options?: {
    matchCount?: number;
    schemeId?: string | null;
  }
): Promise<RetrievedChunk[]> {
  if (queryEmbedding.length !== 768) {
    throw new Error(
      `Invalid query embedding dimension: expected 768, received ${queryEmbedding.length}`
    );
  }

  if (queryEmbedding.some((value) => !Number.isFinite(value))) {
    throw new Error("Query embedding contains invalid numeric values");
  }

  const matchCount = Math.min(
    Math.max(options?.matchCount ?? 5, 1),
    20
  );

  const { data, error } = await supabase.rpc(
    "match_document_chunks",
    {
      query_embedding: `[${queryEmbedding.join(",")}]`,
      p_match_count: matchCount,
      p_filter_scheme_id: options?.schemeId ?? null,
    }
  );

  if (error) {
    throw new Error(
      `Vector search failed: ${error.message}`
    );
  }

  return (data ?? []) as RetrievedChunk[];
}