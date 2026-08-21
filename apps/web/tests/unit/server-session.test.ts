import { headers } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isRequestAuthenticated } from "@/features/auth/server/session";

vi.mock("next/headers", () => ({ headers: vi.fn() }));

const mockedHeaders = vi.mocked(headers);

describe("server session check", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    mockedHeaders.mockReset();
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
