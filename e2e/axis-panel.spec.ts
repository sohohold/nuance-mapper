import { expect, test } from "@playwright/test";
import { box, search, stubGenerate } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await stubGenerate(page);
  await page.goto("/");
});

test.describe("axis customization", () => {
  test("the preset row scrolls horizontally (I-06)", async ({ page }) => {
    // A narrow viewport guarantees the row is wider than its container
    await page.setViewportSize({ width: 390, height: 780 });
    await page.getByRole("button", { name: "軸をカスタマイズ" }).click();

    const list = page.getByTestId("preset-list");
    await expect(list).toBeVisible();

    const overflowing = await list.evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    expect(overflowing).toBe(true);

    await list.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    expect(await list.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  });

  test("preset chips stay on a single row", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.getByRole("button", { name: "軸をカスタマイズ" }).click();

    const chips = page.getByTestId("preset-list").getByRole("button");
    const first = await box(chips.first());
    const last = await box(chips.last());
    expect(Math.abs(last.y - first.y)).toBeLessThanOrEqual(1);
  });

  test("an edited label reaches the request and the map (I-08, I-09)", async ({
    page,
  }) => {
    const bodies: string[] = [];
    page.on("request", (request) => {
      if (
        request.url().includes("/api/generate") &&
        request.method() === "POST"
      ) {
        bodies.push(request.postData() ?? "");
      }
    });

    await page.getByRole("button", { name: "軸をカスタマイズ" }).click();
    await page.getByLabel("X軸ラベル (横軸)").fill("抽象度");
    await page.getByLabel("Y軸ラベル (縦軸)").fill("緊張感");
    await search(page);

    expect(JSON.parse(bodies.at(-1) ?? "{}")).toMatchObject({
      xAxis: "抽象度",
      yAxis: "緊張感",
    });
    await expect(page.getByTestId("x-axis-label")).toHaveText("→ 抽象度 (+X)");
    await expect(page.getByTestId("y-axis-label")).toHaveText("↑ 緊張感 (+Y)");
  });

  test("an over-long label blocks submission (I-10)", async ({ page }) => {
    await page.getByRole("textbox").first().fill("すごい");
    await page.getByRole("button", { name: "軸をカスタマイズ" }).click();
    await page.getByLabel("X軸ラベル (横軸)").fill("あ".repeat(25));

    await expect(page.locator('form button[type="submit"]')).toBeDisabled();
    await expect(page.getByTestId("x-axis-error")).toHaveText(
      "文字数が上限を超えています（25/24）",
    );
  });

  test("an empty label blocks submission (I-11)", async ({ page }) => {
    await page.getByRole("textbox").first().fill("すごい");
    await page.getByRole("button", { name: "軸をカスタマイズ" }).click();
    await page.getByLabel("Y軸ラベル (縦軸)").fill("");

    await expect(page.locator('form button[type="submit"]')).toBeDisabled();
    await expect(page.getByTestId("y-axis-error")).toHaveText(
      "軸ラベルを入力してください",
    );
  });
});

test.describe("word input", () => {
  test("an over-long word is explained and blocks submission (A-02)", async ({
    page,
  }) => {
    await page.getByRole("textbox").first().fill("あ".repeat(25));

    await expect(page.getByTestId("word-error")).toHaveText(
      "文字数が上限を超えています（25/24）",
    );
    await expect(page.locator('form button[type="submit"]')).toBeDisabled();
    await expect(page.getByTestId("char-counter")).toHaveText("25/24");
  });

  test("the counter appears only from 20 characters (A-14)", async ({
    page,
  }) => {
    const field = page.getByRole("textbox").first();
    await field.fill("あ".repeat(19));
    await expect(page.getByTestId("char-counter")).toBeHidden();

    await field.fill("あ".repeat(20));
    await expect(page.getByTestId("char-counter")).toHaveText("20/24");
  });

  test("the API rejects an over-long word that bypasses the UI (A-12)", async ({
    page,
    request,
  }) => {
    await page.unrouteAll();
    const response = await request.post("/api/generate", {
      data: { word: "あ".repeat(25), xAxis: "X", yAxis: "Y" },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ code: "too_long", max: 24 });
  });
});

test.describe("slow request warning (C-01, C-08)", () => {
  test("appears above the submit button after five seconds", async ({
    page,
  }) => {
    await page.route("**/api/generate", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fulfill({ status: 200, body: "" });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 8000));
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: 'data: {"word":"遅い","x":0,"y":0,"nuance":""}\n\ndata: [DONE]\n\n',
      });
    });
    await page.goto("/");

    await page.getByRole("textbox").first().fill("すごい");
    const submit = page.locator('form button[type="submit"]');
    const submitBox = await box(submit);
    await submit.click();

    await expect(page.getByTestId("slow-warning")).toBeHidden();
    await expect(page.getByTestId("slow-warning")).toBeVisible({
      timeout: 7000,
    });

    // sits above the button, and is not clipped away
    const warning = await box(page.getByTestId("slow-warning"));
    expect(warning.y + warning.height).toBeLessThanOrEqual(submitBox.y);
    expect(warning.x + warning.width).toBeGreaterThanOrEqual(submitBox.x);
    expect(warning.height).toBeGreaterThan(0);
  });
});
