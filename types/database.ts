export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      schemes: {
        Row: {
          id: string;
          name: string;
          amc: string;
          aliases: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          amc: string;
          aliases?: string[];
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['schemes']['Insert']>;
        Relationships: [];
      };
      sources: {
        Row: {
          id: string;
          url: string;
          title: string;
          domain: string;
          source_type: string;
          scheme_id: string | null;
          publication_date: string | null;
          last_fetched_at: string | null;
          checksum: string | null;
          status: string;
          created_at: string;
          registry_id: number | null;
          scope: string;
          information_covered: string;
          purpose: string;
        };
        Insert: {
          id?: string;
          url: string;
          title: string;
          domain: string;
          source_type: string;
          scheme_id?: string | null;
          publication_date?: string | null;
          last_fetched_at?: string | null;
          checksum?: string | null;
          status: string;
          created_at?: string;
          registry_id?: number | null;
          scope?: string;
          information_covered?: string;
          purpose?: string;
        };
        Update: Partial<Database['public']['Tables']['sources']['Insert']>;
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          source_id: string;
          content: string;
          content_hash: string;
          version: number;
          fetched_at: string;
          created_at: string;
          document_type: string;
          http_status: number | null;
          extraction_status: string;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          source_id: string;
          content: string;
          content_hash: string;
          version: number;
          fetched_at: string;
          created_at?: string;
          document_type?: string;
          http_status?: number | null;
          extraction_status?: string;
          error_message?: string | null;
        };
        Update: Partial<Database['public']['Tables']['documents']['Insert']>;
        Relationships: [];
      };
      document_chunks: {
        Row: {
          id: string;
          document_id: string;
          chunk_index: number;
          content: string;
          scheme_id: string | null;
          topic: string | null;
          source_url: string;
          publication_date: string | null;
          embedding: number[] | string | null;
          created_at: string;
          source_id: string | null;
          source_title: string;
          amc: string;
          document_type: string;
          chunk_hash: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          chunk_index: number;
          content: string;
          scheme_id?: string | null;
          topic?: string | null;
          source_url: string;
          publication_date?: string | null;
          embedding?: number[] | string | null;
          created_at?: string;
          source_id?: string | null;
          source_title?: string;
          amc?: string;
          document_type?: string;
          chunk_hash?: string;
        };
        Update: Partial<Database['public']['Tables']['document_chunks']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};