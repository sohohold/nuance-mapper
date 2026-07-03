"use client";

import { RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { InputArea } from "@/components/InputArea";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { I18nProvider, useDictionary } from "@/lib/i18n";
import type { NuanceData } from "@/lib/types";

const NuanceMap = dynamic(
  () => import("@/components/NuanceMap").then((m) => m.NuanceMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full flex-1 min-h-0 sm:flex-none sm:h-[400px] flex items-center justify-center text-white/30 border-2 border-dashed border-white/10 rounded-3xl bg-white/5 backdrop-blur-sm">
        <p>Loading...</p>
      </div>
    ),
  },
);

function HomeContent() {
  const { t } = useDictionary();
  const [data, setData] = useState<NuanceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [lastQuery, setLastQuery] = useState<{
    word: string;
    xAxis: string;
    yAxis: string;
  } | null>(null);
  const [xAxisLabel, setXAxisLabel] = useState<string>(t.axisFormality);
  const [yAxisLabel, setYAxisLabel] = useState<string>(t.axisLiterary);

  // Warm up preflight cache on mount
  useEffect(() => {
    fetch("/api/generate", { method: "HEAD" }).catch(() => {});
  }, []);

  const fetchData = async (
    word: string,
    xAxis: string,
    yAxis: string,
    skipCache = false,
  ) => {
    setLoading(true);
    setXAxisLabel(xAxis);
    setYAxisLabel(yAxis);
    setData([]);
    setFromCache(false);
    setDegraded(false);
    setLastQuery({ word, xAxis, yAxis });

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, xAxis, yAxis, skipCache }),
      });

      if (!response.ok) {
        throw new Error(
          response.status === 429 ? "RATE_LIMIT" : "FETCH_FAILED",
        );
      }

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6);
            if (payload === "[DONE]") continue;
            try {
              const item = JSON.parse(payload);
              // Handle metadata events
              if (item.__meta) {
                if (item.fromCache) setFromCache(true);
                if (item.degraded) setDegraded(true);
                continue;
              }
              setData((prev) => [...prev, item]);
            } catch {
              // ignore parse errors
            }
          }
        }
      } else {
        const result = await response.json();
        if (Array.isArray(result)) {
          setData(result);
        } else if (result.error) {
          throw new Error(result.details || result.error);
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      alert(
        error instanceof Error && error.message === "RATE_LIMIT"
          ? t.errorRateLimit
          : t.errorGeneric,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (word: string, xAxis: string, yAxis: string) => {
    fetchData(word, xAxis, yAxis);
  };

  const handleRegenerate = () => {
    if (lastQuery) {
      fetchData(lastQuery.word, lastQuery.xAxis, lastQuery.yAxis, true);
    }
  };

  return (
    // h-dvh + overflow-hidden below sm: the whole app fits one mobile
    // viewport, so the page never scrolls and only the canvas pans
    <main className="h-dvh sm:h-auto sm:min-h-screen relative overflow-hidden bg-[#0f172a] text-white selection:bg-indigo-500/30">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-purple-600/30 blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/30 blur-[120px] animate-pulse delay-1000" />

      {/* overflow-y-auto: normally everything fits h-dvh and nothing
          scrolls, but if the axis settings panel (or a soft keyboard)
          outgrows a short viewport, the page can scroll instead of
          clipping the lower controls */}
      <div className="relative z-10 container mx-auto h-full sm:h-auto px-4 py-2 sm:py-8 md:py-16 flex flex-col items-center gap-2 sm:gap-8 md:gap-12 overflow-y-auto sm:overflow-visible">
        {/* Language Switcher — in-flow above the title on mobile so it can
            never overlap the centered heading on narrow screens */}
        <div className="w-full flex justify-end shrink-0 sm:absolute sm:top-4 sm:right-4 sm:w-auto">
          <LanguageSwitcher />
        </div>

        {/* Header */}
        <div className="text-center shrink-0">
          <h1 className="text-2xl sm:text-4xl md:text-6xl font-bold tracking-tighter bg-clip-text text-transparent bg-linear-to-r from-white via-white to-white/50">
            {t.title}
          </h1>
        </div>

        {/* Input Section */}
        <div className="w-full shrink-0">
          <InputArea onSearch={handleSearch} isLoading={loading} />
        </div>

        {/* Visualization Section — on mobile it takes all remaining
            viewport height so the canvas bottom edge is always on screen */}
        <div className="w-full max-w-4xl flex-1 min-h-[280px] sm:min-h-0 flex flex-col sm:flex-none sm:block animate-in fade-in slide-in-from-bottom-8 duration-700">
          <NuanceMap
            data={data}
            xAxisLabel={xAxisLabel}
            yAxisLabel={yAxisLabel}
            isLoading={loading}
          />
          {(fromCache || degraded) && !loading && data.length > 0 && (
            <div className="mt-2 sm:mt-3 shrink-0 flex items-center justify-center gap-2 animate-in fade-in duration-300">
              <span
                className={
                  degraded
                    ? "text-xs text-amber-300/80"
                    : "text-xs text-white/40"
                }
              >
                {degraded ? t.degradedResult : t.cachedResult}
              </span>
              <button
                type="button"
                onClick={handleRegenerate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 border border-amber-400/30 rounded-full bg-amber-400/10 hover:bg-amber-400/20 hover:border-amber-400/50 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                {t.regenerate}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="w-full text-center text-white/20 text-[10px] sm:text-sm mt-0 sm:mt-8 shrink-0">
          <p>{t.copyright}</p>
        </footer>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <I18nProvider>
      <HomeContent />
    </I18nProvider>
  );
}
