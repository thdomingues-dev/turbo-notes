import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import AppError from "@/app/error";
import NotesError from "@/app/notes/error";

describe.each([
  ["app", AppError, "We couldn’t reach Turbo Notes."],
  ["notes", NotesError, "We couldn’t load your notes."],
] as const)("%s route error boundary", (_, ErrorBoundary, title) => {
  it("retries the failed route", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();

    render(
      <ErrorBoundary
        error={new Error("Temporary server failure")}
        retry={retry}
      />,
    );

    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.getByText("Temporary server failure")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
