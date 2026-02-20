"use client";

import { Loader2, Search } from "lucide-react";
import { useState } from "react";
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
        <div className="relative overflow-hidden flex items-center gap-2 p-2 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-xl transition-all duration-300 focus-within:bg-white/20 focus-within:border-white/40 focus-within:ring-2 focus-within:ring-white/20">
          {isLoading && (
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-linear-to-r from-transparent via-white/10 to-transparent skew-x-[-20deg]" />
          )}
          <input
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            maxLength={24}
            placeholder="言葉を入力してください (例: すごい)"
            className="flex-1 relative z-10 bg-transparent px-4 py-3 text-lg text-white placeholder:text-white/50 focus:outline-none"
            disabled={isLoading}
          />
          {isLoading && (
            <div className="absolute bottom-full right-0 mb-4 w-48 z-50 animate-in fade-in zoom-in slide-in-from-bottom-2 duration-300">
              <div className="relative bg-[#FFD700] text-indigo-900 text-xs font-bold px-3 py-2 rounded-xl shadow-lg border-2 border-white transform rotate-1">
                <p>10秒以上かかる場合があります 🐢</p>
                {/* Arrow */}
                <div className="absolute -bottom-2 right-4 w-4 h-4 bg-[#FFD700] border-b-2 border-r-2 border-white transform rotate-45"></div>
              </div>
            </div>
          )}
          <button
            type="submit"
            disabled={isLoading || !word.trim()}
            className={cn(
              "p-3 rounded-xl transition-all duration-300 cursor-pointer relative z-10",
              isLoading || !word.trim()
                ? "bg-white/5 text-white/30 cursor-not-allowed"
                : "bg-white text-indigo-900 hover:bg-white/90 hover:scale-105 active:scale-95 shadow-lg",
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
          className="text-xs text-white/60 hover:text-white transition-colors underline decoration-dotted cursor-pointer"
        >
          {showAxisSettings ? "軸設定を閉じる" : "軸をカスタマイズ"}
        </button>
      </div>

      {showAxisSettings && (
        <div className="space-y-4 p-4 rounded-xl bg-black/20 backdrop-blur-sm border border-white/10 text-sm animate-in fade-in slide-in-from-top-2">
          {/* Presets List */}
          <div className="space-y-2">
            <label
              htmlFor="preset-select"
              className="block text-white/60 text-xs"
            >
              プリセットから選択
            </label>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
              {[
                { name: "文体", x: "フォーマル度", y: "情緒的・文学的" },
                { name: "創作", x: "比喩度", y: "正負の感情度" },
                { name: "ビジネス", x: "論理・客観性", y: "熱意・エネルギー" },
                { name: "アイデア", x: "斬新さ・意外性", y: "実用性・実現性" },
                { name: "人間性", x: "親しみやすさ", y: "知性・冷静さ" },
                { name: "雰囲気", x: "明るさ・陽気", y: "激しさ・力強さ" },
              ].map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setXAxis(preset.x);
                    setYAxis(preset.y);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs border whitespace-nowrap transition-all cursor-pointer",
                    xAxis === preset.x && yAxis === preset.y
                      ? "bg-white/20 border-white/40 text-white font-medium"
                      : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/10">
            <div className="space-y-2">
              <label htmlFor="x-axis-label" className="block text-white/80">
                X軸ラベル (横軸)
              </label>
              <input
                id="x-axis-label"
                type="text"
                value={xAxis}
                onChange={(e) => setXAxis(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/50 transition-colors"
              />
              <p className="text-xs text-white/40">
                -10 <span className="mx-1">↔</span> +10
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="y-axis-label" className="block text-white/80">
                Y軸ラベル (縦軸)
              </label>
              <input
                id="y-axis-label"
                type="text"
                value={yAxis}
                onChange={(e) => setYAxis(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/50 transition-colors"
              />
              <p className="text-xs text-white/40">
                -10 <span className="mx-1">↔</span> +10
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
