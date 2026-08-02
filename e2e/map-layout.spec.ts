import { expect, test } from "@playwright/test";
import { MAP_CONFIG } from "../src/lib/config";
import {
  area,
  box,
  contains,
  currentZoom,
  intersectionArea,
  relativeBox,
  renderedFontPx,
  SPREAD,
  search,
  stubGenerate,
  zoomIn,
  zoomOut,
  zoomToMinimum,
} from "./fixtures";

test.beforeEach(async ({ page }) => {
  await stubGenerate(page);
  await page.goto("/");
});

// ── E. Axis labels ───────────────────────────────────────────────────

test.describe("axis labels", () => {
  test("Y label sits at the top centre of the canvas (E-01)", async ({
    page,
  }) => {
    await search(page);
    const container = await box(page.getByTestId("map-container"));
    const label = await box(page.getByTestId("y-axis-label"));

    expect(
      Math.abs(label.x + label.width / 2 - (container.x + container.width / 2)),
    ).toBeLessThanOrEqual(2);
    // near the top edge, not floating in the middle
    expect(label.y - container.y).toBeLessThan(container.height * 0.1);
  });

  test("X label sits at the right centre of the canvas (E-02)", async ({
    page,
  }) => {
    await search(page);
    const container = await box(page.getByTestId("map-container"));
    const label = await box(page.getByTestId("x-axis-label"));

    expect(
      Math.abs(
        label.y + label.height / 2 - (container.y + container.height / 2),
      ),
    ).toBeLessThanOrEqual(2);
    expect(
      container.x + container.width - (label.x + label.width),
    ).toBeLessThan(container.width * 0.1);
  });

  test("labels do not move when the canvas is panned (E-03)", async ({
    page,
  }) => {
    await search(page);
    const before = {
      y: await relativeBox(page, page.getByTestId("y-axis-label")),
      x: await relativeBox(page, page.getByTestId("x-axis-label")),
    };

    const container = await box(page.getByTestId("map-container"));
    await page.mouse.move(
      container.x + container.width / 2,
      container.y + container.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      container.x + container.width / 2 - 200,
      container.y + container.height / 2 - 120,
      { steps: 10 },
    );
    await page.mouse.up();
    await page.waitForTimeout(200);

    expect(await relativeBox(page, page.getByTestId("y-axis-label"))).toEqual(
      before.y,
    );
    expect(await relativeBox(page, page.getByTestId("x-axis-label"))).toEqual(
      before.x,
    );
  });

  test("labels do not move when the canvas is zoomed (E-04)", async ({
    page,
  }) => {
    await search(page);
    const before = {
      y: await relativeBox(page, page.getByTestId("y-axis-label")),
      x: await relativeBox(page, page.getByTestId("x-axis-label")),
    };

    const stillThere = async () => {
      const y = await relativeBox(page, page.getByTestId("y-axis-label"));
      const x = await relativeBox(page, page.getByTestId("x-axis-label"));
      expect(Math.abs(y.x - before.y.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(y.y - before.y.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(x.x - before.x.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(x.y - before.x.y)).toBeLessThanOrEqual(1);
    };

    await zoomIn(page, 2);
    await stillThere();

    await zoomOut(page, 4);
    await stillThere();
  });

  test("a 24-character label stays on one line (E-06)", async ({ page }) => {
    await page.getByRole("button", { name: "軸をカスタマイズ" }).click();
    const field = page.getByLabel("X軸ラベル (横軸)");
    await field.fill("あ".repeat(24));
    await search(page);

    const container = await box(page.getByTestId("map-container"));
    const label = await box(page.getByTestId("x-axis-label"));
    expect(label.width).toBeLessThanOrEqual(container.width * 0.7 + 1);
    // one line: the pill is nowhere near two rows tall
    expect(label.height).toBeLessThan(48);
  });

  test("labels do not overlap the controls or the minimap (E-07)", async ({
    page,
  }) => {
    await search(page);
    const labels = [
      await box(page.getByTestId("x-axis-label")),
      await box(page.getByTestId("y-axis-label")),
    ];
    const widgets = [
      await box(page.locator(".react-flow__controls")),
      await box(page.locator(".react-flow__minimap")),
    ];

    for (const label of labels) {
      for (const widget of widgets) {
        expect(intersectionArea(label, widget)).toBe(0);
      }
    }
  });
});

// ── F. Every coordinate visible ──────────────────────────────────────

test.describe("auto-framing", () => {
  /** Both the marker and its label must be inside the canvas. */
  async function assertAllNodesFramed(page: import("@playwright/test").Page) {
    const container = await box(page.getByTestId("map-container"));
    const nodes = page.locator(".react-flow__node-wordNode");
    const count = await nodes.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const node = nodes.nth(i);
      const word = await node.getByTestId("node-label").innerText();
      expect(contains(container, await box(node)), `marker ${word}`).toBe(true);
      expect(
        contains(container, await box(node.getByTestId("node-label"))),
        `label ${word}`,
      ).toBe(true);
    }
  }

  test("frames every marker and label after streaming (F-01, F-02)", async ({
    page,
  }) => {
    await search(page);
    await assertAllNodesFramed(page);
  });

  test("frames a single result without over-zooming (F-03)", async ({
    page,
  }) => {
    await stubGenerate(page, [SPREAD[0]]);
    await page.goto("/");
    await search(page);

    await assertAllNodesFramed(page);
    expect(await currentZoom(page)).toBeLessThanOrEqual(4);
  });

  test("frames the maximum result size (F-06)", async ({ page }) => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      word: `語${i}`,
      x: ((i % 9) - 4) * 2.5,
      y: (Math.floor(i / 9) - 2) * 4,
      nuance: "",
    }));
    await stubGenerate(page, many);
    await page.goto("/");
    await search(page);

    await assertAllNodesFramed(page);
  });

  test("frames coordinates at both extremes (F-07)", async ({ page }) => {
    await stubGenerate(page, [
      { word: "右上端", x: 10, y: 10, nuance: "" },
      { word: "左下端", x: -10, y: -10, nuance: "" },
      { word: "右下端", x: 10, y: -10, nuance: "" },
      { word: "左上端", x: -10, y: 10, nuance: "" },
    ]);
    await page.goto("/");
    await search(page);

    await assertAllNodesFramed(page);
  });
});

// ── G. Legibility ────────────────────────────────────────────────────

test.describe("legibility", () => {
  /** On-screen height of a node label, i.e. after zoom and counter-scale. */
  async function labelHeight(page: import("@playwright/test").Page) {
    return (await box(page.getByTestId("node-label").first())).height;
  }

  test("label size is constant at and above 1:1 (G-01)", async ({ page }) => {
    await search(page);
    await zoomIn(page, 6);
    expect(await currentZoom(page)).toBeGreaterThanOrEqual(1);

    const atOne = await labelHeight(page);
    await zoomIn(page, 2);
    expect(Math.abs((await labelHeight(page)) - atOne)).toBeLessThanOrEqual(1);

    await zoomIn(page, 2);
    expect(Math.abs((await labelHeight(page)) - atOne)).toBeLessThanOrEqual(1);
  });

  test("labels stay at least 8px tall at minimum zoom (G-02)", async ({
    page,
  }) => {
    await search(page);
    await zoomToMinimum(page);
    expect(await currentZoom(page)).toBeLessThan(1);

    expect(
      await renderedFontPx(page.getByTestId("node-label").first()),
    ).toBeGreaterThanOrEqual(MAP_CONFIG.legibility.minRenderedTextPx);
  });

  test("labels do not overlap each other (G-03)", async ({ page }) => {
    await search(page);
    const labels = page.getByTestId("node-label");
    const boxes = [];
    for (let i = 0; i < (await labels.count()); i++) {
      boxes.push(await box(labels.nth(i)));
    }

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const overlap = intersectionArea(boxes[i], boxes[j]);
        const smaller = Math.min(area(boxes[i]), area(boxes[j]));
        expect(
          overlap / smaller,
          `labels ${i} and ${j} overlap`,
        ).toBeLessThanOrEqual(0.1);
      }
    }
  });

  test("tick labels stay legible at minimum zoom (G-04)", async ({ page }) => {
    await search(page);
    await zoomToMinimum(page);

    const tick = page
      .locator(".react-flow__node-originNode .font-mono")
      .first();
    expect(await renderedFontPx(tick)).toBeGreaterThanOrEqual(
      MAP_CONFIG.legibility.minRenderedTextPx,
    );
  });

  test("axis lines stay at least a pixel wide at minimum zoom (G-05)", async ({
    page,
  }) => {
    await search(page);
    await zoomToMinimum(page);

    const line = page
      .locator(".react-flow__node-originNode .bg-white\\/40")
      .first();
    expect((await box(line)).width).toBeGreaterThanOrEqual(1);
  });
});

// ── H. Tooltip geometry ──────────────────────────────────────────────

test.describe("tooltip geometry", () => {
  test("closes as soon as a pan starts (H-06)", async ({ page }) => {
    await search(page);
    await page.locator(".react-flow__node-wordNode button").first().hover();
    await expect(page.getByTestId("word-tooltip")).toBeVisible();

    // Start the drag in the padding fitView leaves at the corner — the
    // centre of the canvas is where the (0, 0) marker sits, and grabbing it
    // would re-open the tooltip instead of panning
    const container = await box(page.getByTestId("map-container"));
    await page.mouse.move(container.x + 20, container.y + 20);
    await page.mouse.down();
    await page.mouse.move(container.x + 140, container.y + 90, { steps: 5 });
    await expect(page.getByTestId("word-tooltip")).toBeHidden();
    await page.mouse.up();
  });

  test("flips below the marker near the top edge (H-11)", async ({ page }) => {
    await stubGenerate(page, [
      { word: "最上部", x: 0, y: 10, nuance: "上端の語" },
      { word: "最下部", x: 0, y: -10, nuance: "下端の語" },
    ]);
    await page.goto("/");
    await search(page);

    const container = await box(page.getByTestId("map-container"));
    const nodes = page.locator(".react-flow__node-wordNode");
    const first = await box(nodes.nth(0));
    const second = await box(nodes.nth(1));
    const upper = first.y < second.y ? nodes.nth(0) : nodes.nth(1);
    const lower = first.y < second.y ? nodes.nth(1) : nodes.nth(0);

    await upper.locator("button").hover();
    await expect(page.getByTestId("word-tooltip")).toHaveAttribute(
      "data-below",
      "true",
    );
    expect(await box(page.getByTestId("word-tooltip"))).toBeTruthy();
    void container;

    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);

    await lower.locator("button").hover();
    await expect(page.getByTestId("word-tooltip")).toHaveAttribute(
      "data-below",
      "false",
    );
  });

  test("is never clipped by the canvas edge (H-12)", async ({ page }) => {
    await stubGenerate(page, [
      { word: "右端", x: 10, y: 0, nuance: "とても長い説明文をここに入れる" },
      { word: "左端", x: -10, y: 0, nuance: "とても長い説明文をここに入れる" },
      { word: "上端", x: 0, y: 10, nuance: "とても長い説明文をここに入れる" },
      { word: "下端", x: 0, y: -10, nuance: "とても長い説明文をここに入れる" },
    ]);
    await page.goto("/");
    await search(page);

    const nodes = page.locator(".react-flow__node-wordNode");

    for (let i = 0; i < (await nodes.count()); i++) {
      const word = await nodes.nth(i).getByTestId("node-label").innerText();
      await nodes.nth(i).locator("button").hover();
      const tooltip = page.getByTestId("word-tooltip");
      await expect(tooltip).toBeVisible();
      // the entry spring is still moving when it first becomes visible
      await page.waitForTimeout(600);

      // after hovering, because hovering may have scrolled the page
      const container = await box(page.getByTestId("map-container"));
      expect(contains(container, await box(tooltip)), word).toBe(true);

      await page.mouse.move(0, 0);
      await page.waitForTimeout(400);
    }
  });
});
