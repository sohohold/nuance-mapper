"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { Dictionary } from "./dictionaries/ja/common";
import { ja } from "./dictionaries/ja/common";
import { en } from "./dictionaries/en/common";

export type Locale = "ja" | "en";

const dictionaries: Record<Locale, Dictionary> = { ja, en };

interface I18nContextValue {
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "ja",
  t: ja,
  setLocale: () => {},
});

function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "ja";
  const lang = navigator.language.split("-")[0];
  return lang === "en" ? "en" : "ja";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    document.documentElement.lang = l;
  }, []);

  const value = useMemo(
    () => ({ locale, t: dictionaries[locale], setLocale }),
    [locale, setLocale],
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useDictionary() {
  return useContext(I18nContext);
}
