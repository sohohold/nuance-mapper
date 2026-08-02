/**
 * Axis presets.
 *
 * Each entry carries a stable `id` and dictionary *keys* rather than
 * translated strings. Selection state is tracked by id, so switching
 * language re-reads the labels instead of leaving the selection pointing
 * at text that no longer exists in the active dictionary.
 */

import type { Dictionary } from "@/lib/dictionaries/ja/common";

export interface PresetDefinition {
  id: string;
  nameKey: keyof Dictionary;
  xKey: keyof Dictionary;
  yKey: keyof Dictionary;
}

export interface Preset {
  id: string;
  name: string;
  x: string;
  y: string;
}

export const PRESETS = [
  {
    id: "creative",
    nameKey: "presetCreative",
    xKey: "axisMetaphor",
    yKey: "axisSentiment",
  },
  {
    id: "style",
    nameKey: "presetStyle",
    xKey: "axisFormality",
    yKey: "axisLiterary",
  },
  {
    id: "business",
    nameKey: "presetBusiness",
    xKey: "axisLogic",
    yKey: "axisEnthusiasm",
  },
  {
    id: "ideas",
    nameKey: "presetIdeas",
    xKey: "axisNovelty",
    yKey: "axisPracticality",
  },
  {
    id: "humanity",
    nameKey: "presetHumanity",
    xKey: "axisFriendliness",
    yKey: "axisIntellect",
  },
  {
    id: "atmosphere",
    nameKey: "presetAtmosphere",
    xKey: "axisBrightness",
    yKey: "axisIntensity",
  },
] as const satisfies readonly PresetDefinition[];

export const DEFAULT_PRESET = PRESETS[0];

/** Resolve every preset against the active dictionary. */
export function resolvePresets(t: Dictionary): Preset[] {
  return PRESETS.map((p) => ({
    id: p.id,
    name: t[p.nameKey],
    x: t[p.xKey],
    y: t[p.yKey],
  }));
}

export function findPreset(id: string | null): PresetDefinition | undefined {
  return PRESETS.find((p) => p.id === id);
}
