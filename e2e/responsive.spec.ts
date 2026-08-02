import { expect, test } from "@playwright/test";
import { MAP_CONFIG } from "../src/lib/config";
import {
  box,
  renderedFontPx,
  SPREAD,
  search,
  stubGenerate,
  zoomToMinimum,
} from "./fixtures";

const MOBILE = { width: 390, height: 780 };
const DESKTOP = { width: 1280, height: 900 };

/**
 * The canvas pixels the component assigns to one coordinate unit.
 *
 * Read from the node transforms rather than from anything on screen, so
 * the value is independent of the current zoom: React Flow positions
 * nodes in flow coordinates and scales the whole viewport afterwards.
 */
async function coordinateScale(page: import("@playwright/test").Page) {
  const positions = await page
    .locator(".react-flow__node-wordNode")
    .evaluateAll((els) =>
      els.map((el) => {
        const match = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(
          (el as HTMLElement).style.transform,
        );
        return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
      }),
    );

  // Nodes keep the order of the streamed items, so these are SPREAD[0]
  // (x = 9) and SPREAD[19] (x = 0).
  const first = positions[0];
  const origin = positions[positions.length - 1];
  if (!first || !origin) throw new Error("could not read node positions");
  return (first.x - origin.x) / (SPREAD[0].x - SPREAD[SPREAD.length - 1].x);
}

test.describe("mobile", () => {
  test.use({ viewport: MOBILE });

  test.beforeEach(async ({ page }) => {
    await stubGenerate(page);
    await page.goto("/");
  });

  test("uses the compact coordinate scale (J-01)", async ({ page }) => {
    await search(page);
    expect(await coordinateScale(page)).toBeCloseTo(MAP_CONFIG.scale.mobile, 0);
  });

  test("hides the minimap (J-03)", async ({ page }) => {
    await search(page);
    await expect(page.locator(".react-flow__minimap")).toBeHidden();
  });

  test("hides the pointer hint (J-04)", async ({ page }) => {
    await search(page);
    await expect(page.getByText("Drag to pan, Scroll to zoom")).toBeHidden();
  });

  test("allows zooming further out (J-05)", async ({ page }) => {
    await search(page);
    await zoomToMinimum(page);

    const zoom = await page.locator(".react-flow__viewport").evaluate((el) => {
      const match = /matrix\(([^,]+),/.exec(getComputedStyle(el).transform);
      return match ? Number(match[1]) : 1;
    });
    expect(zoom).toBeLessThan(MAP_CONFIG.zoom.desktopMin);
    expect(zoom).toBeGreaterThanOrEqual(MAP_CONFIG.zoom.mobileMin - 0.01);
  });

  test("keeps the whole app inside one viewport (J-06)", async ({ page }) => {
    await search(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("scrolls when the axis panel needs the room (J-07)", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "軸をカスタマイズ" }).click();
    const field = page.getByLabel("Y軸ラベル (縦軸)");
    await expect(field).toBeVisible();
    await field.scrollIntoViewIfNeeded();

    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport");
    const fieldBox = await box(field);
    expect(fieldBox.y).toBeGreaterThanOrEqual(0);
    expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(
      viewport.height + 1,
    );
  });
});

test.describe("desktop", () => {
  test.use({ viewport: DESKTOP });

  test.beforeEach(async ({ page }) => {
    await stubGenerate(page);
    await page.goto("/");
  });

  test("uses the full coordinate scale (J-02)", async ({ page }) => {
    await search(page);
    expect(await coordinateScale(page)).toBeCloseTo(
      MAP_CONFIG.scale.desktop,
      0,
    );
  });

  test("shows the minimap and the pointer hint", async ({ page }) => {
    await search(page);
    await expect(page.locator(".react-flow__minimap")).toBeVisible();
    await expect(page.getByText("Drag to pan, Scroll to zoom")).toBeVisible();
  });
});

/**
 * The breakpoint width itself.
 *
 * Tailwind's `sm:` is a min-width query, so at exactly this width the
 * stylesheet already applies the wider layout. If the component's own media
 * query disagreed, it would size the map for one breakpoint while the text
 * rendered at the other — and the legibility floor, which is derived from
 * the smallest font at the current breakpoint, would be computed against a
 * font size that is not on screen.
 */
test.describe("at the breakpoint width (J-09)", () => {
  test.use({ viewport: { width: 640, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await stubGenerate(page);
    await page.goto("/");
  });

  test("takes the same side of the boundary as the stylesheet", async ({
    page,
  }) => {
    await search(page);
    expect(await coordinateScale(page)).toBeCloseTo(
      MAP_CONFIG.scale.desktop,
      0,
    );
    await expect(page.locator(".react-flow__minimap")).toBeVisible();
  });

  test("keeps tick labels above the legibility floor at minimum zoom", async ({
    page,
  }) => {
    await search(page);
    await zoomToMinimum(page);

    const tick = page
      .locator(".react-flow__node-originNode .font-mono")
      .first();
    expect(await renderedFontPx(tick)).toBeGreaterThanOrEqual(
      MAP_CONFIG.legibility.minRenderedTextPx,
    );
  });
});

test.describe("one pixel below the breakpoint (J-10)", () => {
  test.use({ viewport: { width: 639, height: 800 } });

  test("uses the compact geometry", async ({ page }) => {
    await stubGenerate(page);
    await page.goto("/");
    await search(page);

    expect(await coordinateScale(page)).toBeCloseTo(MAP_CONFIG.scale.mobile, 0);
    await expect(page.locator(".react-flow__minimap")).toBeHidden();
  });
});

test.describe("crossing the breakpoint (J-08)", () => {
  test("re-lays out when the viewport is resized", async ({ page }) => {
    await stubGenerate(page);
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await search(page);
    await expect(page.locator(".react-flow__minimap")).toBeVisible();

    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(600);
    await expect(page.locator(".react-flow__minimap")).toBeHidden();
    expect(await coordinateScale(page)).toBeCloseTo(MAP_CONFIG.scale.mobile, 0);

    await page.setViewportSize(DESKTOP);
    await page.waitForTimeout(600);
    await expect(page.locator(".react-flow__minimap")).toBeVisible();
    expect(await coordinateScale(page)).toBeCloseTo(
      MAP_CONFIG.scale.desktop,
      0,
    );
  });
});
