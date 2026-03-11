"use client";

import { type Locale, useDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const locales: { code: Locale; label: string }[] = [
  { code: "ja", label: "JP" },
  { code: "en", label: "EN" },
];

export function LanguageSwitcher() {
  const { locale, setLocale } = useDictionary();

  return (
    <div className="flex gap-1 bg-white/10 backdrop-blur-md rounded-full p-1 border border-white/20">
      {locales.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLocale(l.code)}
          className={cn(
            "px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer",
            locale === l.code
              ? "bg-white/20 text-white"
              : "text-white/50 hover:text-white/80",
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
