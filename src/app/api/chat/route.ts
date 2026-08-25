import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { searchDocumentChunks } from "../../../../lib/retrieval/search";

type EmbeddingResponse = {
  embedding: number[];
  dimensions: number;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

async function generateQueryEmbedding(question: string): Promise<number[]> {
  const embeddingServerUrl =
    process.env.EMBEDDING_SERVER_URL || "http://127.0.0.1:8001";

  const response = await fetch(`${embeddingServerUrl}/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: question,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Embedding server failed with HTTP ${response.status}: ${errorText}`
    );
  }

  const data = (await response.json()) as EmbeddingResponse;

  if (!Array.isArray(data.embedding)) {
    throw new Error("Embedding server did not return an embedding.");
  }

  if (data.embedding.length !== 768) {
    throw new Error(
      `Invalid embedding dimension: expected 768, received ${data.embedding.length}`
    );
  }

  return data.embedding;
}

export async function POST(request: NextRequest) {
  try {
const body = await request.json();
const question = body?.question?.trim();
const messages: ChatMessage[] = Array.isArray(body?.messages)
  ? body.messages
  : [];

    if (!question) {
      return NextResponse.json(
        { error: "Question is required." },
        { status: 400 }
      );
    }

    console.log("Question:", question);

// --------------------------------------------------
// STEP 1: Build a standalone retrieval query
// --------------------------------------------------

const recentConversation = messages
  .slice(-6)
  .map(
    (message) =>
      `${message.role.toUpperCase()}: ${message.content}`
  )
  .join("\n");

const retrievalPrompt = `
Rewrite the user's latest question into a standalone search query.

Use the conversation history to resolve references such as:
- its
- their
- this fund
- that scheme
- the benchmark
- the objective
- the risk
- the allocation

Rules:
- Preserve the user's intent.
- Include the specific mutual fund name when it is known from the conversation.
- Do not answer the question.
- Return ONLY the rewritten search query.

CONVERSATION HISTORY:
${recentConversation}

LATEST USER QUESTION:
${question}
`;

const queryApiKey = process.env.GEMINI_API_KEY;

if (!queryApiKey) {
  throw new Error("GEMINI_API_KEY is not configured.");
}

const queryAi = new GoogleGenAI({
  apiKey: queryApiKey,
});

const retrievalResponse = await queryAi.models.generateContent({
  model: "gemini-3.6-flash",
  contents: retrievalPrompt,
});

const retrievalQuery =
  retrievalResponse.text?.trim() || question;

console.log("Retrieval query:", retrievalQuery);

// --------------------------------------------------
// STEP 2: Generate 768-dimensional query embedding
// --------------------------------------------------

console.log("Generating query embedding...");

const queryEmbedding =
  await generateQueryEmbedding(retrievalQuery);

    console.log(
      "Query embedding generated:",
      queryEmbedding.length,
      "dimensions"
    );

    // --------------------------------------------------
    // STEP 2: Search Supabase using the embedding
    // --------------------------------------------------

    console.log("Searching Supabase...");

    const results = await searchDocumentChunks(queryEmbedding, {
      matchCount: 5,
    });

    console.log("Retrieved chunks:", results.length);

    if (!results.length) {
      return NextResponse.json({
        answer:
          "I couldn't find relevant information in the available official sources.",
        sources: [],
      });
    }

    // --------------------------------------------------
    // STEP 3: Build context for Gemini
    // --------------------------------------------------

    const context = results
      .map(
        (result, index) =>
          `[SOURCE ${index + 1}]
Title: ${result.source_title}
URL: ${result.source_url}
Content:
${result.content}`
      )
      .join("\n\n");

    // --------------------------------------------------
    // STEP 4: Ask Gemini to answer using retrieved data
    // --------------------------------------------------

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    const ai = new GoogleGenAI({
      apiKey,
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `
You are a factual mutual-fund information assistant.

Answer the user's question using ONLY the provided source material.

Rules:
- Do not invent facts.
- Do not use outside knowledge.
- If the sources do not contain enough information, clearly say so.
- Give a concise, useful answer.
- When appropriate, mention the relevant fund name, investment objective, benchmark, risk, or other information found in the sources.
- Do not provide personalized investment advice.
- Do not claim that a fund is suitable for the user personally.
- If multiple sources contain relevant information, combine them carefully.
- Prefer information directly related to the user's question.
CONVERSATION HISTORY:
${messages
  .slice(-6)
  .map(
    (message) =>
      `${message.role.toUpperCase()}: ${message.content}`
  )
  .join("\n")}

USER QUESTION:
${question}

SOURCE MATERIAL:
${context}
      `,
    });

    const answer = response.text?.trim();

    // --------------------------------------------------
    // STEP 5: Return answer + sources
    // --------------------------------------------------

    return NextResponse.json({
      answer:
        answer ||
        "I couldn't generate an answer from the available source material.",
      sources: results.map((result) => ({
        title: result.source_title,
        url: result.source_url,
        similarity: result.similarity,
      })),
    });
  } catch (error) {
    console.error("Chat API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      },
      { status: 500 }
    );
  }
}