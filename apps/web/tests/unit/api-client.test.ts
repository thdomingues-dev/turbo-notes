import { afterEach, describe, expect, it, vi } from "vitest";

import { logOut, signUp } from "@/features/auth/api/auth";
import {
  createNote,
  deleteNote,
  getNotes,
  updateNote,
} from "@/entities/note/api/notes";
import {
  ApiError,
  isNotAuthenticatedError,
  resetApiClientForTests,
} from "@/shared/api/client";

describe("API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetApiClientForTests();
    document.cookie = "csrftoken=; Max-Age=0; Path=/";
  });

  it("centralizes credentials, CSRF, and generated routes for mutations", async () => {
    document.cookie = "csrftoken=test-token; Path=/";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await logOut();

    const [request] = fetchMock.mock.calls[0] ?? [];
    expect(request).toBeInstanceOf(Request);
    expect((request as Request).url).toContain("/api/v1/auth/logout/");
    expect((request as Request).credentials).toBe("include");
    expect((request as Request).headers.get("X-CSRFToken")).toBe("test-token");

    await deleteNote("00000000-0000-4000-8000-000000000001");

    const [deleteRequest] = fetchMock.mock.calls[1] ?? [];
    expect(deleteRequest).toBeInstanceOf(Request);
    expect((deleteRequest as Request).method).toBe("DELETE");
    expect((deleteRequest as Request).url).toContain(
      "/api/v1/notes/00000000-0000-4000-8000-000000000001/",
    );
    expect((deleteRequest as Request).headers.get("X-CSRFToken")).toBe(
      "test-token",
    );
  });

  it("sends the caller's idempotency key when creating a note", async () => {
    document.cookie = "csrftoken=test-token; Path=/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000001",
          category_key: "school",
          title: "",
          content: "",
          revision: 0,
          created_at: "2004-08-17T12:00:00Z",
          last_edited_at: "2004-08-17T12:00:00Z",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );

    await createNote("school", "00000000-0000-4000-8000-000000000099");

    const [request] = fetchMock.mock.calls[0] ?? [];
    expect(request).toBeInstanceOf(Request);
    expect((request as Request).method).toBe("POST");
    expect((request as Request).headers.get("Idempotency-Key")).toBe(
      "00000000-0000-4000-8000-000000000099",
    );
    await expect((request as Request).clone().json()).resolves.toEqual({
      category_key: "school",
    });
  });

  it("accepts only one opaque cursor when loading a filtered page", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ next: null, previous: null, results: [] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    await getNotes({
      category: "school",
      pageUrl:
        "https://untrusted.invalid/api/v1/notes/?category=personal&cursor=cD0y%3D",
    });

    const [request] = fetchMock.mock.calls[0] ?? [];
    const url = new URL((request as Request).url);
    expect(url.pathname).toBe("/api/v1/notes/");
    expect(url.searchParams.get("category")).toBe("school");
    expect(url.searchParams.get("cursor")).toBe("cD0y=");
    expect(url.searchParams.has("offset")).toBe(false);

    await expect(
      getNotes({
        category: "all",
        pageUrl: "https://api.test/api/v1/notes/?offset=9",
      }),
    ).rejects.toThrow("contain one cursor");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("adapts structured API failures into actionable domain errors", async () => {
    document.cookie = "csrftoken=test-token; Path=/";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "revision_conflict",
            detail: "Revision is stale.",
            current: {
              id: "00000000-0000-4000-8000-000000000001",
              revision: 3,
              last_edited_at: "2004-08-17T12:00:00Z",
            },
          }),
          {
            status: 409,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "validation_error",
            detail: "Request validation failed.",
            errors: { email: ["Enter a valid email address."] },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      );

    await expect(
      updateNote("00000000-0000-4000-8000-000000000001", {
        revision: 2,
        title: "Stale title",
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 409,
        message: "Revision is stale.",
        payload: expect.objectContaining({ code: "revision_conflict" }),
      }),
    );
    await expect(
      signUp({ email: "not-an-email", password: "password" }),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 400,
        message: "Enter a valid email address.",
        payload: expect.objectContaining({
          code: "validation_error",
          errors: { email: ["Enter a valid email address."] },
        }),
      }),
    );
  });

  it("distinguishes an expired session from other 403 failures", () => {
    expect(
      isNotAuthenticatedError(
        new ApiError(403, "Authentication credentials were not provided.", {
          code: "not_authenticated",
          detail: "Authentication credentials were not provided.",
        }),
      ),
    ).toBe(true);
    expect(
      isNotAuthenticatedError(
        new ApiError(403, "CSRF verification failed.", {
          code: "csrf_failed",
          detail: "CSRF verification failed.",
        }),
      ),
    ).toBe(false);
  });
});
