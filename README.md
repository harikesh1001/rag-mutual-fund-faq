# Mutual Fund Facts — RAG-based Mutual Fund FAQ Assistant

A facts-only mutual fund FAQ assistant that answers questions using information retrieved from official SBI Mutual Fund documents.

The prototype is designed to provide concise factual information about mutual fund schemes while avoiding personalized investment advice.

## Milestone

LIP Challenge — Milestone 4

### Product

Groww

### Corpus Scope

AMC: SBI Mutual Fund

The prototype focuses on selected SBI Mutual Fund schemes and their official public documents.

## What the Assistant Does

The assistant can answer factual questions such as:

- What is SBI Large Cap Fund?
- What is the investment objective?
- What is the benchmark?
- What is the risk level?
- What is the asset allocation?
- What is the exit load?
- What is the minimum SIP?
- What is the ELSS lock-in period?

The assistant uses retrieved official-source content to generate its answers.

It does not provide personalized investment advice or recommendations.

## How It Works

The application follows a Retrieval-Augmented Generation (RAG) workflow:

1. The user submits a question.
2. The latest question and recent conversation history are used to create a standalone retrieval query.
3. The query is converted into a 768-dimensional embedding.
4. Relevant document chunks are retrieved from Supabase using vector similarity search.
5. The retrieved official-source content is provided to Gemini.
6. Gemini generates a concise answer using only the retrieved source material.
7. The answer is displayed together with the official source links used for retrieval.

### Architecture

User
→ Next.js Chat UI
→ Query Rewriting
→ Embedding Server
→ Supabase Vector Search
→ Retrieved Official Documents
→ Gemini
→ Answer + Sources

## Technology Stack

- Next.js
- TypeScript
- React
- Tailwind CSS
- Next.js App Router
- Google Gemini API
- Supabase / PostgreSQL with vector search
- Python embedding server
- BAAI/bge-base-en-v1.5 embedding model

## Getting Started

### 1. Install dependencies

```bash
npm install