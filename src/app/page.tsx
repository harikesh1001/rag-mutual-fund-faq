"use client";

import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  const suggestions = [
    "What is SBI Large Cap Fund?",
    "What is its benchmark?",
    "What is the investment objective?",
  ];

  return (
    <main className="min-h-screen bg-[#f3f5f4] text-[#17191a] flex items-center justify-center px-4 py-8">

      {/* MOBILE APP FRAME */}
      <div className="flex h-[780px] w-[390px] flex-col overflow-hidden rounded-[38px] border-[6px] border-[#17191a] bg-white shadow-[0_25px_70px_rgba(0,0,0,0.18)]">
        {/* HEADER */}
        <header className="flex items-center justify-between border-b border-[#eeeeee] bg-white px-5 py-4">

          <div className="flex items-center gap-3">

            {/* Groww-style G mark */}
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00b386] text-sm font-bold text-white">
              G
            </div>

            <div>
              <h1 className="text-[15px] font-semibold tracking-[-0.01em]">
                Groww Facts
              </h1>

              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#00b386]" />

                <span className="text-[10px] text-[#8a8f8d]">
                  Official-source assistant
                </span>
              </div>
            </div>

          </div>

          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f4f6f5] text-[#737875]"
            aria-label="Search"
          >
            ⌕
          </button>

        </header>

        {/* CONTENT */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">

          {/* HERO */}
          <section className="pt-4">

            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#dfe9e5] bg-[#f5fbf8] px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00b386]" />

              <span className="text-[10px] font-medium text-[#52615c]">
                Official-source financial information
              </span>
            </div>

            <h2 className="max-w-[330px] text-[32px] font-semibold leading-[1.08] tracking-[-0.04em]">
              Mutual fund facts,
              <br />
              without the noise.
            </h2>

            <p className="mt-4 max-w-[330px] text-[14px] leading-6 text-[#737a77]">
              Ask about schemes, benchmarks, risk, expense ratios,
              exit loads and more using official public documents.
            </p>

          </section>

          {/* PRIMARY ACTION */}
          <button
            type="button"
            onClick={() => router.push("/chat")}
            className="mt-6 flex w-full items-center justify-between rounded-2xl bg-[#17191a] px-5 py-4 text-left text-white transition hover:bg-[#252827]"
          >
            <div>
              <p className="text-[13px] font-semibold">
                Ask Groww Facts
              </p>

              <p className="mt-1 text-[10px] text-[#aeb3b1]">
                Get answers from official fund documents
              </p>
            </div>

            <span className="text-lg">
              →
            </span>
          </button>

          {/* TRUST ROW */}
          <div className="mt-5 grid grid-cols-2 gap-3">

            <div className="rounded-2xl bg-[#f7f8f8] px-4 py-3">
              <p className="text-[11px] font-semibold text-[#303432]">
                Official sources
              </p>

              <p className="mt-1 text-[10px] text-[#8a908d]">
                Fund documents
              </p>
            </div>

            <div className="rounded-2xl bg-[#f7f8f8] px-4 py-3">
              <p className="text-[11px] font-semibold text-[#303432]">
                RAG powered
              </p>

              <p className="mt-1 text-[10px] text-[#8a908d]">
                Source-grounded answers
              </p>
            </div>

          </div>

          {/* AI CARD */}
          <section className="mt-7">

            <div className="rounded-[22px] bg-[#17191a] p-5 text-white">

              <div className="flex items-center gap-2">

                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#00b386] text-[10px] font-bold">
                  G
                </div>

                <span className="text-[11px] font-medium text-[#d8dddb]">
                  Groww Facts
                </span>

              </div>

              <h3 className="mt-5 text-[19px] font-semibold tracking-[-0.02em]">
                Have a question?
              </h3>

              <p className="mt-2 text-[11px] leading-5 text-[#aeb3b1]">
                Ask about a fund, benchmark, risk or objective.
              </p>

              <button
                type="button"
                onClick={() => router.push("/chat")}
                className="mt-4 flex w-full items-center justify-between rounded-xl bg-[#303332] px-3.5 py-3 text-left"
              >
                <span className="truncate text-[11px] text-[#c6cbc9]">
                  What is SBI Large Cap Fund?
                </span>

                <span className="ml-2 text-[#00b386]">
                  →
                </span>
              </button>

            </div>

          </section>

          {/* SUGGESTIONS */}
          <section className="mt-7">

            <div className="mb-3 flex items-center justify-between">

              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#919794]">
                Try asking
              </p>

              <span className="text-[10px] text-[#a0a5a2]">
                3 examples
              </span>

            </div>

            <div className="space-y-2.5">

              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => router.push("/chat")}
                  className="flex w-full items-center justify-between rounded-2xl border border-[#e8ecea] bg-white px-4 py-3.5 text-left shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition hover:bg-[#f8faf9]"
                >

                  <span className="pr-3 text-[12px] leading-5 text-[#454b48]">
                    {suggestion}
                  </span>

                  <span className="text-[#00b386]">
                    →
                  </span>

                </button>
              ))}

            </div>

          </section>

          {/* DISCLAIMER */}
          <p className="mt-7 text-center text-[9px] leading-4 text-[#9ca19f]">
            Facts only · No investment advice
          </p>

        </div>

        {/* BOTTOM NAV */}
        <nav className="shrink-0 border-t border-[#eeeeee] bg-white px-4 pb-4 pt-3">

          <div className="grid grid-cols-4">

            <button
              type="button"
              className="flex flex-col items-center gap-1 text-[#00b386]"
            >
              <span className="text-sm">⌂</span>
              <span className="text-[9px] font-medium">
                Home
              </span>
            </button>

            <button
              type="button"
              className="flex flex-col items-center gap-1 text-[#a0a5a2]"
            >
              <span className="text-sm">⌕</span>
              <span className="text-[9px]">
                Explore
              </span>
            </button>

            <button
              type="button"
              onClick={() => router.push("/chat")}
              className="flex flex-col items-center gap-1 text-[#a0a5a2]"
            >
              <span className="text-sm">✦</span>
              <span className="text-[9px]">
                Ask AI
              </span>
            </button>

            <button
              type="button"
              className="flex flex-col items-center gap-1 text-[#a0a5a2]"
            >
              <span className="text-sm">◯</span>
              <span className="text-[9px]">
                Profile
              </span>
            </button>

          </div>

        </nav>

      </div>

    </main>
  );
}