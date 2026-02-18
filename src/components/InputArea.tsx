"use client";

import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputAreaProps {
  onSearch: (word: string, xAxis: string, yAxis: string) => void;
  isLoading: boolean;
}

export function InputArea({ onSearch, isLoading }: InputAreaProps) {
  const [word, setWord] = useState("");
  const [xAxis, setXAxis] = useState("フォーマル度");
  const [yAxis, setYAxis] = useState("文学的・情緒度");
  const [showAxisSettings, setShowAxisSettings] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (word.trim()) {
      onSearch(word, xAxis, yAxis);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <form onSubmit={handleSubmit} className="relative group">
        <div className="flex items-center gap-2 p-2 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-xl transition-all duration-300 focus-within:bg-white/20 focus-within:border-white/40 focus-within:ring-2 focus-within:ring-white/20">
          <input
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="言葉を入力してください (例: すごい)"
            className="flex-1 bg-transparent px-4 py-3 text-lg text-white placeholder:text-white/50 focus:outline-none"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !word.trim()}
            className={cn(
              "p-3 rounded-xl transition-all duration-300",
              isLoading || !word.trim()
                ? "bg-white/5 text-white/30 cursor-not-allowed"
                : "bg-white text-indigo-900 hover:bg-white/90 hover:scale-105 active:scale-95 shadow-lg"
            )}
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Search className="w-6 h-6" />
            )}
          </button>
        </div>
      </form>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowAxisSettings(!showAxisSettings)}
          className="text-xs text-white/60 hover:text-white transition-colors underline decoration-dotted"
        >
          {showAxisSettings ? "軸設定を閉じる" : "軸をカスタマイズ"}
        </button>
      </div>

      {showAxisSettings && ( // Simple conditional rendering for now, can animate later
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-black/20 backdrop-blur-sm border border-white/10 text-sm animate-in fade-in slide-in-from-top-2">
          <div className="space-y-2">
            <label className="block text-white/80">X軸ラベル (横軸)</label>
            <input
              type="text"
              value={xAxis}
              onChange={(e) => setXAxis(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/50 transition-colors"
            />
             <p className="text-xs text-white/40">-10 <span className="mx-1">↔</span> +10</p>
          </div>
          <div className="space-y-2">
            <label className="block text-white/80">Y軸ラベル (縦軸)</label>
            <input
              type="text"
              value={yAxis}
              onChange={(e) => setYAxis(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/50 transition-colors"
            />
            <p className="text-xs text-white/40">-10 <span className="mx-1">↔</span> +10</p>
          </div>
        </div>
      )}
    </div>
  );
}
