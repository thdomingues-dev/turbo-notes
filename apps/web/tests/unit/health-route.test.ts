import { describe, expect, it, vi } from "vitest";

import { GET } from "@/app/health/route";

describe("web health route", () => {
  it("reports process health without calling the API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
