import { expect, test, type Page } from "@playwright/test";

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("CorrectHorseBatteryStaple!42");
  await page.getByRole("button", { name: "Sign Up" }).click();
  await expect(page).toHaveURL(/\/notes$/);
}

function successfulPatchFor(page: Page, noteId: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      new URL(response.url()).pathname === `/api/v1/notes/${noteId}/` &&
      response.status() === 200,
  );
}

test("anonymous users cannot open private note routes", async ({ page }) => {
  const proxyResponse = await page.goto("/notes");
  expect(proxyResponse?.status()).toBe(200);
  await expect(page).toHaveURL(/\/login$/);

  await page.context().addCookies([
    {
      name: "sessionid",
      value: "expired-session",
      url: "http://127.0.0.1:3200",
    },
  ]);
  const pageGuardResponse = await page.goto(
    "/notes/00000000-0000-4000-8000-000000000001",
  );
  expect(pageGuardResponse?.status()).toBe(200);
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Yay, You're Back!" }),
  ).toBeVisible();
  await expect(page.getByText("Loading notes...")).toHaveCount(0);
});

test("authenticated users cannot open login or signup", async ({ page }) => {
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await signUp(page, `auth-guard-${runId}@example.com`);

  for (const authPath of ["/login", "/signup"]) {
    const response = await page.goto(authPath);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.getByLabel("Email address")).toHaveCount(0);
  }
});

test("a note persists through Next, Django, and PostgreSQL", async ({
  page,
}) => {
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await signUp(page, `fullstack-${runId}@example.com`);
  await expect(
    page.getByRole("heading", {
      name: "I’m just here waiting for your charming notes...",
    }),
  ).toBeVisible();

  const createResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/notes/" &&
      response.status() === 201,
  );
  await page.getByRole("button", { name: "New Note" }).click();
  await createResponse;
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+$/);

  const noteId = page.url().split("/").at(-1)!;
  const title = page.getByLabel("Note title");
  const content = page.getByLabel("Note content");

  const titleSaved = successfulPatchFor(page, noteId);
  await title.fill("Real PostgreSQL note");
  await titleSaved;
  await expect(page.getByRole("status")).toContainText("Saved");

  const contentSaved = successfulPatchFor(page, noteId);
  await content.fill(
    "Saved through Next.js, Django REST Framework, and PostgreSQL.",
  );
  await contentSaved;
  await expect(page.getByRole("status")).toContainText("Saved");

  const categorySaved = successfulPatchFor(page, noteId);
  await page.getByRole("button", { name: "Random Thoughts" }).click();
  await page.getByRole("menuitem", { name: "School" }).click();
  await categorySaved;
  await expect(page.getByRole("status")).toContainText("Saved");

  await page.getByRole("button", { name: "Close note" }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await page.getByRole("button", { name: "School, 1 note" }).click();
  const noteLink = page.getByRole("link", { name: /Real PostgreSQL note/ });
  await expect(noteLink).toBeVisible();
  await noteLink.click();
  await expect(title).toBeVisible();

  await page.reload();
  await expect(title).toHaveValue("Real PostgreSQL note");
  await expect(content).toHaveValue(
    "Saved through Next.js, Django REST Framework, and PostgreSQL.",
  );
  await expect(page.getByRole("button", { name: "School" })).toBeVisible();

  await page.getByRole("button", { name: "Close note" }).click();
  const deleteResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      new URL(response.url()).pathname === `/api/v1/notes/${noteId}/` &&
      response.status() === 204,
  );
  await page
    .getByRole("button", { name: "Delete Real PostgreSQL note" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Delete note?" }),
  ).toContainText("Real PostgreSQL note");
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await deleteResponse;
  await expect(noteLink).toBeHidden();
  await expect(
    page.getByRole("button", { name: "School, 0 notes" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
