import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const categories = [
  { key: "random-thoughts", note_count: 3 },
  { key: "school", note_count: 3 },
  { key: "personal", note_count: 1 },
  { key: "drama", note_count: 0 },
] as const;

const longTitle =
  "A Deep and Contemplative Personal Reflection on the Multifaceted and Ever-Evolving Journey of Life";
const unbrokenTitle = "o".repeat(200);
const unbrokenPreview = "d".repeat(500);

const notes = [
  {
    id: "note-1",
    title: "Grocery List",
    content_preview: "• Milk\n• Eggs\n• Bread\n• Bananas\n• Spinach",
    category_key: "random-thoughts",
    last_edited_at: "2000-11-23T12:00:00-03:00",
  },
  {
    id: "note-2",
    title: "Meeting with Team",
    content_preview:
      "Discuss project timeline and milestones.\nReview budget and resource allocation.",
    category_key: "school",
    last_edited_at: "2000-11-22T12:00:00-03:00",
  },
  {
    id: "note-3",
    title: "Note Title",
    content_preview: "Note content...",
    category_key: "school",
    last_edited_at: "2000-10-16T12:00:00-03:00",
  },
  {
    id: "note-4",
    title: "Vacation Ideas",
    content_preview: "Visit Bali, Rome, the Swiss Alps, and Iceland.",
    category_key: "random-thoughts",
    last_edited_at: "2000-09-05T12:00:00-03:00",
  },
  {
    id: "note-5",
    title: "Reading List",
    content_preview: "The Alchemist, Educated, and Becoming.",
    category_key: "personal",
    last_edited_at: "2000-07-28T12:00:00-03:00",
  },
  {
    id: "note-6",
    title: longTitle,
    content_preview:
      "Life has been a whirlwind of events and emotions lately. I’ve been juggling work, personal projects, and relationships, often wondering what the next chapter might bring.",
    category_key: "random-thoughts",
    last_edited_at: "2000-04-11T12:00:00-03:00",
  },
  {
    id: "note-7",
    title: unbrokenTitle,
    content_preview: unbrokenPreview,
    category_key: "school",
    last_edited_at: "2000-01-09T12:00:00-03:00",
  },
] as const;

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockNotesPage(page: Page) {
  await page.context().addCookies([
    {
      name: "sessionid",
      value: "responsive-e2e-session",
      url: "http://127.0.0.1:3100",
    },
  ]);
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/categories/")) return json(route, categories);
    if (path.endsWith("/notes/note-1/") && request.method() === "GET") {
      return json(route, {
        id: notes[0].id,
        title: "Retried and persisted",
        content: notes[0].content_preview,
        category_key: notes[0].category_key,
        revision: 1,
        last_edited_at: notes[0].last_edited_at,
      });
    }
    if (path.endsWith("/notes/") && request.method() === "GET") {
      return json(route, {
        next: null,
        previous: null,
        results: notes,
      });
    }
    if (path.endsWith("/auth/session/")) {
      return json(route, {
        authenticated: true,
        user: { id: "user-1", email: "friend@example.com" },
        csrf_token: "e2e-csrf",
      });
    }

    return json(
      route,
      {
        code: "test_unhandled",
        detail: `Unhandled test route: ${request.method()} ${path}`,
      },
      500,
    );
  });
}

test("notes reflow without overflow across the supported viewports", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2000-11-23T15:00:00.000Z"));
  await mockNotesPage(page);
  const response = await page.goto("/notes");

  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");

  const firstCard = page.getByRole("link", { name: /Grocery List/ });
  await expect(firstCard).toBeVisible();
  const viewport = page.viewportSize()!;
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport);

  const cards = await Promise.all(
    notes.slice(0, 3).map((note) =>
      page
        .getByRole("link", { name: new RegExp(note.title) })
        .first()
        .boundingBox(),
    ),
  );
  const categoryButtons = await Promise.all(
    [
      "All Categories",
      "Random Thoughts, 3 notes",
      "School, 3 notes",
      "Personal, 1 note",
      "Drama, 0 notes",
    ].map((name) => page.getByRole("button", { name }).boundingBox()),
  );
  expect(cards.every(Boolean)).toBe(true);
  expect(categoryButtons.every(Boolean)).toBe(true);

  if (viewport.width >= 1024) {
    expect(new Set(cards.map((box) => Math.round(box!.y))).size).toBe(1);
  } else if (viewport.width >= 600) {
    expect(categoryButtons.every((box) => box!.height >= 44)).toBe(true);
    expect(Math.round(cards[0]!.y)).toBe(Math.round(cards[1]!.y));
    expect(Math.round(cards[2]!.y)).toBeGreaterThan(Math.round(cards[0]!.y));
  } else {
    expect(categoryButtons.every((box) => box!.height >= 44)).toBe(true);
    expect(new Set(cards.map((box) => Math.round(box!.y))).size).toBe(3);
    expect(new Set(categoryButtons.map((box) => Math.round(box!.y))).size).toBe(
      1,
    );
  }

  const longTitleElement = page.getByRole("heading", {
    name: longTitle,
    exact: true,
  });
  const unbrokenTitleElement = page.getByRole("heading", {
    name: unbrokenTitle,
    exact: true,
  });
  const unbrokenCard = page.locator("[data-note-card]").filter({
    has: unbrokenTitleElement,
  });
  const measureTextBox = (element: Element) => ({
    clientHeight: (element as HTMLElement).clientHeight,
    clientWidth: (element as HTMLElement).clientWidth,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
    scrollHeight: (element as HTMLElement).scrollHeight,
    scrollWidth: (element as HTMLElement).scrollWidth,
    webkitLineClamp:
      getComputedStyle(element).getPropertyValue("-webkit-line-clamp"),
  });
  const [longTitleMetrics, unbrokenTitleMetrics, unbrokenCopyMetrics] =
    await Promise.all([
      longTitleElement.evaluate(measureTextBox),
      unbrokenTitleElement.evaluate(measureTextBox),
      unbrokenCard.locator("p").evaluate(measureTextBox),
    ]);

  expect(longTitleMetrics.clientHeight).toBeLessThanOrEqual(
    longTitleMetrics.lineHeight * 5 + 1,
  );
  expect(unbrokenTitleMetrics.clientHeight).toBeLessThanOrEqual(
    unbrokenTitleMetrics.lineHeight * 5 + 1,
  );
  expect(unbrokenTitleMetrics.scrollWidth).toBeLessThanOrEqual(
    unbrokenTitleMetrics.clientWidth,
  );
  expect(unbrokenCopyMetrics.scrollWidth).toBeLessThanOrEqual(
    unbrokenCopyMetrics.clientWidth,
  );
  expect(unbrokenCopyMetrics.scrollHeight).toBeGreaterThan(
    unbrokenCopyMetrics.clientHeight,
  );
  expect(unbrokenCopyMetrics.webkitLineClamp).toBe("10");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  if (process.env.GENERATE_EVIDENCE && viewport.width === 1280) {
    await page.screenshot({
      path: "../../docs/evidence/web-notes-1280x832.png",
    });
  }
});

test("a long note title stays contained in the delete dialog", async ({
  page,
}) => {
  await mockNotesPage(page);
  await page.goto("/notes");

  const unbrokenTitleElement = page.getByRole("heading", {
    name: unbrokenTitle,
    exact: true,
  });
  const unbrokenCard = page.locator("[data-note-card]").filter({
    has: unbrokenTitleElement,
  });
  await unbrokenCard
    .getByRole("button", { name: `Delete ${unbrokenTitle}`, exact: true })
    .click();

  const dialog = page.getByRole("dialog", { name: "Delete note?" });
  await expect(dialog).toBeVisible();
  const description = page.locator("#delete-note-description");
  const [dialogBox, descriptionBox, containment] = await Promise.all([
    dialog.boundingBox(),
    description.boundingBox(),
    description.evaluate((element) => ({
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
    })),
  ]);
  expect(containment.scrollWidth).toBeLessThanOrEqual(containment.clientWidth);
  expect(containment.scrollHeight).toBeLessThanOrEqual(
    containment.clientHeight,
  );
  expect(descriptionBox!.x).toBeGreaterThanOrEqual(dialogBox!.x);
  expect(descriptionBox!.x + descriptionBox!.width).toBeLessThanOrEqual(
    dialogBox!.x + dialogBox!.width,
  );
  await expect(description).toContainText(unbrokenTitle);
});

test("the editor remains accessible and contained on narrow screens", async ({
  page,
}) => {
  await mockNotesPage(page);
  await page.goto("/notes/note-1");

  const title = page.getByLabel("Note title");
  await expect(title).toHaveValue("Retried and persisted");

  const viewport = page.viewportSize()!;
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport);

  const headerControls = await Promise.all(
    [
      page.getByRole("button", { name: "Random Thoughts" }),
      page.locator('[data-state="saved"]'),
      page.getByRole("button", { name: "Close note" }),
    ].map((control) => control.boundingBox()),
  );
  expect(headerControls.every(Boolean)).toBe(true);
  for (const control of headerControls) {
    expect(control!.x).toBeGreaterThanOrEqual(0);
    expect(control!.x + control!.width).toBeLessThanOrEqual(viewport.width);
  }

  for (let tabPresses = 0; tabPresses < 8; tabPresses += 1) {
    if (await title.evaluate((element) => document.activeElement === element))
      break;
    await page.keyboard.press("Tab");
  }
  await expect(title).toBeFocused();

  const content = page.getByLabel("Note content");
  await page.keyboard.press("Tab");
  await expect(content).toBeFocused();

  if (viewport.width === 320) {
    await expect
      .poll(() =>
        title.evaluate(
          (element) =>
            element.clientHeight > 37 &&
            element.clientHeight >= element.scrollHeight,
        ),
      )
      .toBe(true);
  }

  if (viewport.width >= 768) {
    const editor = page.getByRole("region", { name: "Note editor" });
    const [editorBox, contentBox, editorBottomInset] = await Promise.all([
      editor.boundingBox(),
      content.boundingBox(),
      editor.evaluate((element) => {
        const styles = getComputedStyle(element);
        return (
          Number.parseFloat(styles.paddingBottom) +
          Number.parseFloat(styles.borderBottomWidth)
        );
      }),
    ]);
    expect(contentBox!.y + contentBox!.height).toBeCloseTo(
      editorBox!.y + editorBox!.height - editorBottomInset,
      0,
    );
  }

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  if (process.env.GENERATE_EVIDENCE && viewport.width === 1280) {
    await page.screenshot({
      path: "../../docs/evidence/web-note-editor-1280x832.png",
    });
  }
});
