"use client";

import { Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { INPUT_UI_CONFIG } from "@/lib/config";
import { useDictionary } from "@/lib/i18n";
import { DEFAULT_PRESET, findPreset, resolvePresets } from "@/lib/presets";
import { cn, formatMessage } from "@/lib/utils";
import {
  countChars,
  INPUT_LIMITS,
  validateAxisLabel,
  validateWord,
} from "@/lib/validation";

interface InputAreaProps {
  onSearch: (word: string, xAxis: string, yAxis: string) => void;
  isLoading: boolean;
}

export function InputArea({ onSearch, isLoading }: InputAreaProps) {
  const { t, locale } = useDictionary();
  const presets = resolvePresets(t);

  const [word, setWord] = useState("");
  // Selection is held by id, not by label text, so the highlight survives
  // a language switch (the labels below follow it)
  const [presetId, setPresetId] = useState<string | null>(DEFAULT_PRESET.id);
  const [xAxis, setXAxis] = useState<string>(t[DEFAULT_PRESET.xKey]);
  const [yAxis, setYAxis] = useState<string>(t[DEFAULT_PRESET.yKey]);
  const [showAxisSettings, setShowAxisSettings] = useState(false);
  const [showSlowWarning, setShowSlowWarning] = useState(false);

  // Re-read the selected preset's labels from the new dictionary. Edited
  // labels clear presetId, so a user's own wording is never overwritten.
  // biome-ignore lint/correctness/useExhaustiveDependencies: t is derived from locale
  useEffect(() => {
    const preset = findPreset(presetId);
    if (!preset) return;
    setXAxis(t[preset.xKey]);
    setYAxis(t[preset.yKey]);
  }, [locale, presetId]);

  // Only warn once the wait is actually long. Restarting on every request
  // means a fast second search does not inherit the first one's warning.
  useEffect(() => {
    if (!isLoading) {
      setShowSlowWarning(false);
      return;
    }
    const timer = setTimeout(
      () => setShowSlowWarning(true),
      INPUT_UI_CONFIG.slowWarningDelayMs,
    );
    return () => clearTimeout(timer);
  }, [isLoading]);

  // The same validators the API route runs — see src/lib/validation.ts
  const wordCheck = validateWord(word);
  const xCheck = validateAxisLabel(xAxis);
  const yCheck = validateAxisLabel(yAxis);
  const canSubmit = wordCheck.ok && xCheck.ok && yCheck.ok && !isLoading;

  const wordCount = countChars(word.trim());
  const showCounter = wordCount >= INPUT_UI_CONFIG.counterThresholdChars;

  const limitMessage = (count: number) =>
    formatMessage(t.charLimitExceeded, { count, max: INPUT_LIMITS.word });

  const selectPreset = (id: string) => {
    const preset = findPreset(id);
    if (!preset) return;
    setPresetId(id);
    setXAxis(t[preset.xKey]);
    setYAxis(t[preset.yKey]);
  };

  const editAxis = (axis: "x" | "y", value: string) => {
    setPresetId(null);
    if (axis === "x") setXAxis(value);
    else setYAxis(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSearch(word.trim(), xAxis.trim(), yAxis.trim());
  };

  const axisFieldError = (check: typeof xCheck) => {
    if (check.ok) return null;
    return check.code === "too_long"
      ? limitMessage(check.length)
      : t.axisLabelRequired;
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-1.5 sm:space-y-4">
      {/* relative, but NOT overflow-hidden: the slow-request bubble sits
          above the field and would be clipped by the shimmer container */}
      <form onSubmit={handleSubmit} className="relative group">
        <div className="relative overflow-hidden flex items-center gap-2 p-1.5 sm:p-2 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-xl transition-all duration-300 focus-within:bg-white/20 focus-within:border-white/40 focus-within:ring-2 focus-within:ring-white/20">
          {isLoading && (
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-linear-to-r from-transparent via-white/10 to-transparent skew-x-[-20deg]" />
          )}
          <input
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder={t.inputPlaceholder}
            aria-label={t.inputPlaceholder}
            aria-invalid={wordCheck.code === "too_long"}
            className="flex-1 relative z-10 bg-transparent px-3 py-2 text-base sm:px-4 sm:py-3 sm:text-lg text-white placeholder:text-white/50 focus:outline-none"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              "p-2.5 sm:p-3 rounded-xl transition-all duration-300 cursor-pointer relative z-10",
              !canSubmit
                ? "bg-white/5 text-white/30 cursor-not-allowed"
                : "bg-white text-indigo-900 hover:bg-white/90 hover:scale-105 active:scale-95 shadow-lg",
            )}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
            ) : (
              <Search className="w-5 h-5 sm:w-6 sm:h-6" />
            )}
          </button>
        </div>

        {/* Anchored to the form's right edge, i.e. directly above the
            submit button, and outside the clipping container */}
        {showSlowWarning && (
          <div
            data-testid="slow-warning"
            role="status"
            className="absolute bottom-full right-1.5 sm:right-2 mb-3 w-48 z-50 animate-in fade-in zoom-in slide-in-from-bottom-2 duration-300"
          >
            <div className="relative bg-[#FFD700] text-indigo-900 text-xs font-bold px-3 py-2 rounded-xl shadow-lg border-2 border-white transform rotate-1">
              <p>{t.slowWarning}</p>
              <div className="absolute -bottom-2 right-4 w-4 h-4 bg-[#FFD700] border-b-2 border-r-2 border-white transform rotate-45" />
            </div>
          </div>
        )}
      </form>

      <div className="flex items-start justify-between gap-3 min-h-4">
        <p
          role="alert"
          className="text-xs text-amber-300 empty:hidden"
          data-testid="word-error"
        >
          {wordCheck.code === "too_long" ? limitMessage(wordCheck.length) : ""}
        </p>
        {showCounter && (
          <span
            data-testid="char-counter"
            className={cn(
              "shrink-0 text-xs tabular-nums",
              wordCheck.code === "too_long"
                ? "text-amber-300"
                : "text-white/50",
            )}
          >
            {formatMessage(t.charCounter, {
              count: wordCount,
              max: INPUT_LIMITS.word,
            })}
          </span>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowAxisSettings(!showAxisSettings)}
          className="text-xs text-white/60 hover:text-white transition-colors underline decoration-dotted cursor-pointer"
        >
          {showAxisSettings ? t.closeAxisSettings : t.customizeAxis}
        </button>
      </div>

      {showAxisSettings && (
        <div className="space-y-4 p-4 rounded-xl bg-black/20 backdrop-blur-sm border border-white/10 text-sm animate-in fade-in slide-in-from-top-2">
          {/* Presets List */}
          <div className="space-y-2">
            <p className="block text-white/60 text-xs">{t.presetLabel}</p>
            <div
              data-testid="preset-list"
              className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
            >
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={presetId === preset.id}
                  onClick={() => selectPreset(preset.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs border whitespace-nowrap transition-all cursor-pointer",
                    presetId === preset.id
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
                {t.xAxisLabel}
              </label>
              <input
                id="x-axis-label"
                type="text"
                value={xAxis}
                aria-invalid={!xCheck.ok}
                onChange={(e) => editAxis("x", e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/50 transition-colors"
              />
              <p
                role="alert"
                data-testid="x-axis-error"
                className="text-xs text-amber-300 empty:hidden"
              >
                {axisFieldError(xCheck) ?? ""}
              </p>
              <p className="text-xs text-white/40">
                -10 <span className="mx-1">&harr;</span> +10
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="y-axis-label" className="block text-white/80">
                {t.yAxisLabel}
              </label>
              <input
                id="y-axis-label"
                type="text"
                value={yAxis}
                aria-invalid={!yCheck.ok}
                onChange={(e) => editAxis("y", e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/50 transition-colors"
              />
              <p
                role="alert"
                data-testid="y-axis-error"
                className="text-xs text-amber-300 empty:hidden"
              >
                {axisFieldError(yCheck) ?? ""}
              </p>
              <p className="text-xs text-white/40">
                -10 <span className="mx-1">&harr;</span> +10
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
