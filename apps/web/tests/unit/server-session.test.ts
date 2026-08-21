import { headers } from "next/headers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isRequestAuthenticated,
  redirectAuthenticatedRequest,
} from "@/features/auth/server/session";

vi.mock("next/headers", () => ({ headers: vi.fn() }));

const mockedHeaders = vi.mocked(headers);

describe("server session check", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    mockedHeaders.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards request cookies and recognizes an authenticated session", async () => {
    vi.stubEnv("API_SERVER_BASE_URL", "http://api.internal/");
    mockedHeaders.mockResolvedValue(
      new Headers({ cookie: "sessionid=session-123; csrftoken=csrf-123" }),
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          user: { id: "user-1", email: "friend@example.com" },
          csrf_token: "csrf-123",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(isRequestAuthenticated()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.internal/api/v1/auth/session/",
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Cookie: "sessionid=session-123; csrftoken=csrf-123",
        },
      },
    );
  });

  it("renders auth pages without calling the API when no session cookie exists", async () => {
    mockedHeaders.mockResolvedValue(new Headers());
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(redirectAuthenticatedRequest()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders auth pages when a stale cookie cannot be verified", async () => {
    mockedHeaders.mockResolvedValue(
      new Headers({ cookie: "sessionid=stale-session" }),
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("API offline")));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(redirectAuthenticatedRequest()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "Unable to verify the session for an auth page.",
      expect.any(Error),
    );
  });

  it("only trusts a verified session response", async () => {
    mockedHeaders.mockResolvedValue(new Headers());
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ authenticated: false, user: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ detail: "Unavailable" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ authenticated: true, user: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
    );

    await expect(isRequestAuthenticated()).resolves.toBe(false);
    await expect(isRequestAuthenticated()).rejects.toThrow(
      "Unable to verify the current session (status 503).",
    );
    await expect(isRequestAuthenticated()).rejects.toThrow(
      "The session endpoint returned an invalid response.",
    );
  });
});
