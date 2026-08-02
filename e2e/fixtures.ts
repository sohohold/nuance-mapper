import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export interface Item {
  word: string;
  x: number;
  y: number;
  nuance: string;
}

/**
 * A realistic result: 20 entries covering all four quadrants and both
 * extremes of each axis, which is what the prompt asks the model for.
 */
export const SPREAD: Item[] = [
  { word: "壮麗", x: 9, y: 8, nuance: "華やかで重厚" },
  { word: "荘重", x: 7, y: 5, nuance: "重々しく厳か" },
  { word: "優美", x: 5, y: 9, nuance: "上品でやわらか" },
  { word: "端正", x: 3, y: 4, nuance: "整っている" },
  { word: "明朗", x: 2, y: 7, nuance: "明るく朗らか" },
  { word: "率直", x: 4, y: -3, nuance: "遠回しでない" },
  { word: "簡潔", x: 8, y: -6, nuance: "むだがない" },
  { word: "無骨", x: 6, y: -9, nuance: "洗練されない" },
  { word: "淡泊", x: 2, y: -5, nuance: "あっさりしている" },
  { word: "冷徹", x: 9, y: -2, nuance: "情に流されない" },
  { word: "柔和", x: -3, y: 6, nuance: "おだやか" },
  { word: "純朴", x: -6, y: 8, nuance: "素直で飾らない" },
  { word: "軽妙", x: -8, y: 3, nuance: "軽やかで巧み" },
  { word: "気安い", x: -5, y: 2, nuance: "距離が近い" },
  { word: "朗らか", x: -2, y: 9, nuance: "明るい" },
  { word: "雑駁", x: -4, y: -4, nuance: "まとまりがない" },
  { word: "粗野", x: -7, y: -7, nuance: "荒っぽい" },
  { word: "無愛想", x: -9, y: -3, nuance: "そっけない" },
  { word: "投げやり", x: -3, y: -9, nuance: "なげやり" },
  { word: "凡庸", x: 0, y: 0, nuance: "ありふれている" },
];

/** Serve a fixed result for the generation endpoint. */
export async function stubGenerate(
  page: Page,
  items: Item[] = SPREAD,
  meta?: Record<string, unknown>,
) {
  await page.route("**/api/generate", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill({ status: 200, body: "" });
      return;
    }
    const events = [
      ...(meta ? [JSON.stringify({ __meta: true, ...meta })] : []),
      ...items.map((i) => JSON.stringify(i)),
      "[DONE]",
    ];
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
      body: events.map((e) => `data: ${e}\n\n`).join(""),
    });
  });
}

/** Run a search and wait for the map to finish auto-framing. */
export async function search(page: Page, word = "すごい") {
  await page.getByRole("textbox").first().fill(word);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByTestId("map-container")).toBeVisible();
  await expect(
    page.locator(".react-flow__node-wordNode").first(),
  ).toBeVisible();
  // fitView settles 300 ms after the last item, then animates for 800 ms
  await page.waitForTimeout(1600);
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function box(locator: Locator): Promise<Box> {
  const value = await locator.boundingBox();
  if (!value) throw new Error("element has no bounding box");
  return value;
}

export function contains(outer: Box, inner: Box, tolerance = 0.5): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

/**
 * A box expressed relative to the canvas.
 *
 * Playwright scrolls elements into view before clicking or hovering them,
 * so viewport coordinates shift underfoot. Anything that compares layout
 * across an interaction has to be anchored to the canvas instead.
 */
export async function relativeBox(page: Page, locator: Locator): Promise<Box> {
  const container = await box(page.getByTestId("map-container"));
  const target = await box(locator);
  return {
    x: target.x - container.x,
    y: target.y - container.y,
    width: target.width,
    height: target.height,
  };
}

export function intersectionArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function area(b: Box): number {
  return b.width * b.height;
}

/** Current React Flow zoom, read from the viewport transform. */
export async function currentZoom(page: Page): Promise<number> {
  const transform = await page
    .locator(".react-flow__viewport")
    .evaluate((el) => getComputedStyle(el).transform);
  const match = /matrix\(([^,]+),/.exec(transform);
  return match ? Number(match[1]) : 1;
}

/** Click a zoom control until it is exhausted or `times` is reached. */
async function clickZoom(page: Page, control: string, times: number) {
  const button = page.locator(control);
  for (let i = 0; i < times; i++) {
    // React Flow disables the control at the limit, so stop rather than
    // waiting for a button that will never become clickable again
    if (await button.isDisabled()) return;
    await button.click();
    await page.waitForTimeout(350);
  }
}

export async function zoomIn(page: Page, times = 1) {
  await clickZoom(page, ".react-flow__controls-zoomin", times);
}

export async function zoomOut(page: Page, times = 1) {
  await clickZoom(page, ".react-flow__controls-zoomout", times);
}

/** Zoom all the way out, to whatever minZoom the viewport allows. */
export async function zoomToMinimum(page: Page) {
  await clickZoom(page, ".react-flow__controls-zoomout", 30);
}
