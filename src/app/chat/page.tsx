"use client";

import { useState } from "react";

type Source = {
  title: string;
  url: string;
  similarity: number;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

export default function ChatPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I’m Groww Facts. Ask me about mutual funds, benchmarks, risk, expense ratios, exit loads, or other facts available in official documents.",
    },
  ]);

  async function askQuestion(text: string) {
    const value = text.trim();

    if (!value || loading) {
      return;
    }

    setQuestion("");

    setMessages((previous) => [
      ...previous,
      {
        role: "user",
        content: value,
      },
    ]);

    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: value,
          messages: messages,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to get an answer.");
      }

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: data.answer,
          sources: data.sources,
        },
      ]);
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (question.trim()) {
      askQuestion(question);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f5f5] text-[#17191c] md:flex md:items-center md:justify-center md:p-8">
      {/* MOBILE APP FRAME */}
      <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#f7f8f8] md:h-[844px] md:w-[390px] md:rounded-[34px] md:border-[7px] md:border-[#17191c] md:shadow-[0_30px_80px_rgba(0,0,0,0.15)]">
        {/* HEADER */}
        <header className="z-20 flex shrink-0 items-center border-b border-[#e8e9e9] bg-white px-4 py-3">
          <a
            href="/"
            aria-label="Go back"
            className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f2f3f3] text-lg text-[#55585c]"
          >
            ←
          </a>

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#00b386] text-sm font-bold text-white">
            G
          </div>

          <div className="ml-3 min-w-0">
            <h1 className="truncate text-sm font-semibold text-[#17191c]">
              Groww Facts
            </h1>

            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00b386]" />

              <span className="text-[10px] text-[#85898d]">
                Official-source assistant
              </span>
            </div>
          </div>
        </header>

        {/* CHAT CONTENT */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-4 pb-32 pt-6">
            {/* EMPTY STATE */}
            {messages.length === 1 && !loading && (
              <section className="mb-7 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e1f7f0] text-lg font-bold text-[#00a87d]">
                  G
                </div>

                <h2 className="mt-5 text-[23px] font-semibold leading-[1.15] tracking-[-0.6px] text-[#17191c]">
                  Mutual fund facts,
                  <br />
                  without the noise.
                </h2>

                <p className="mx-auto mt-3 max-w-[300px] text-xs leading-5 text-[#85898d]">
                  Ask about schemes, benchmarks, risk, expense ratios and more
                  using official public documents.
                </p>
              </section>
            )}

            {/* MESSAGES */}
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={
                    message.role === "user"
                      ? "flex justify-end"
                      : "flex justify-start"
                  }
                >
                  {message.role === "user" ? (
                    <div className="max-w-[82%] rounded-[18px] rounded-br-md bg-[#17191c] px-4 py-3 text-[13px] leading-5 text-white">
                      {message.content}
                    </div>
                  ) : (
                    <div className="w-full max-w-[94%] rounded-[20px] border border-[#e8e9e9] bg-white px-4 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                      {/* ASSISTANT HEADER */}
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e1f7f0] text-[10px] font-bold text-[#00a87d]">
                          G
                        </div>

                        <div>
                          <p className="text-[11px] font-semibold text-[#35383c]">
                            Groww Facts
                          </p>

                          {index === 0 && (
                            <p className="text-[9px] text-[#9a9da1]">
                              Just now
                            </p>
                          )}
                        </div>
                      </div>

                      {/* ANSWER */}
                      <div className="whitespace-pre-wrap text-[13px] leading-[1.65] text-[#303338]">
                        {message.content}
                      </div>

                      {/* SOURCES */}
                      {message.sources &&
                        message.sources.length > 0 && (
                          <div className="mt-4 border-t border-[#eeeeef] pt-3">
                            <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#9a9da1]">
                              Official sources
                            </p>

                            <div className="space-y-2">
                              {message.sources.map(
                                (source, sourceIndex) => (
                                  <a
                                    key={sourceIndex}
                                    href={source.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block rounded-xl border border-[#eceeee] bg-[#f7f8f8] px-3 py-2.5 transition hover:bg-[#f0f2f2]"
                                  >
                                    <p className="truncate text-[10px] font-medium text-[#303338]">
                                      {source.title}
                                    </p>

                                    <p className="mt-1 text-[9px] text-[#92969a]">
                                      Official source ·{" "}
                                      {(source.similarity * 100).toFixed(1)}
                                      % match
                                    </p>
                                  </a>
                                )
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* SUGGESTIONS */}
            {messages.length === 1 && !loading && (
              <section className="mt-7">
                <p className="mb-2 px-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#999da1]">
                  Try asking
                </p>

                <div className="space-y-2">
                  {[
                    "What is SBI Large Cap Fund?",
                    "What is its benchmark?",
                    "What is the investment objective?",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => askQuestion(suggestion)}
                      className="flex w-full items-center justify-between rounded-[16px] border border-[#e5e7e7] bg-white px-4 py-3.5 text-left text-[12px] text-[#4c5054] shadow-[0_1px_5px_rgba(0,0,0,0.025)] transition hover:bg-[#fafbfb]"
                    >
                      <span>{suggestion}</span>

                      <span className="ml-3 text-base text-[#00b386]">
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* LOADING */}
            {loading && (
              <div className="mt-4 flex justify-start">
                <div className="rounded-[20px] rounded-bl-md border border-[#e8e9e9] bg-white px-4 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e1f7f0] text-[10px] font-bold text-[#00a87d]">
                      G
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9da2a3]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9da2a3] [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9da2a3] [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM INPUT */}
        <div className="absolute bottom-0 left-0 right-0 z-30 border-t border-[#e5e7e7] bg-white/95 px-3 pb-3 pt-2 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 rounded-[18px] border border-[#e2e5e4] bg-[#f4f6f5] p-1.5"
          >
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about a mutual fund..."
              rows={1}
              className="min-h-[40px] flex-1 resize-none bg-transparent px-2.5 py-2.5 text-[12px] text-[#292c30] outline-none placeholder:text-[#9b9fa2]"
            />

            <button
              type="submit"
              disabled={!question.trim() || loading}
              aria-label="Send question"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#00b386] text-lg font-medium text-white transition hover:bg-[#00a77d] disabled:opacity-30"
            >
              ↑
            </button>
          </form>

          <p className="pt-1.5 text-center text-[8px] text-[#a0a4a7]">
            Facts only · No investment advice
          </p>
        </div>
      </div>
    </main>
  );
}