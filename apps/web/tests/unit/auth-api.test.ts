import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  adaptAuthSubmissionError,
  getSession,
  logIn,
  signUp,
} from "@/features/auth/api/auth";
import type { SessionUser } from "@/features/auth/model/types";
import { ApiError, resetApiClientForTests } from "@/shared/api/client";

describe("authentication API contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetApiClientForTests();
    document.cookie = "csrftoken=; Max-Age=0; Path=/";
  });

  it("returns generated-contract user objects from signup and login", async () => {
    for (const [authenticate, status] of [
      [signUp, 201],
      [logIn, 200],
    ] as const) {
      document.cookie = "csrftoken=test-token; Path=/";
      const user = { id: "user-1", email: "friend@example.com" };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(user), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );

      const result = authenticate({
        email: user.email,
        password: "kind-notes-123",
      });
      expectTypeOf(result).toEqualTypeOf<Promise<SessionUser>>();
      await expect(result).resolves.toEqual(user);
    }
  });

  it("maps valid sessions and rejects inconsistent generated responses", async () => {
    const response = {
      authenticated: true,
      csrf_token: "session-csrf-token",
      user: { id: "user-1", email: "friend@example.com" },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(getSession()).resolves.toEqual({
      authenticated: true,
      user: { id: "user-1", email: "friend@example.com" },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          csrf_token: "session-csrf-token",
          user: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(getSession()).rejects.toThrow(
      "The server returned an invalid session response.",
    );
  });

  it("adapts backend authentication errors into a UI-facing contract", () => {
    const error = new ApiError(400, "Enter a valid email address.", {
      code: "validation_error",
      detail: "Request validation failed.",
      errors: {
        email: ["Enter a valid email address."],
        password: ["This password is too common."],
      },
    });

    expect(adaptAuthSubmissionError(error)).toEqual({
      email: "Enter a valid email address.",
      password: "This password is too common.",
      form: null,
    });
  });
});
