import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NoteCard } from "@/app/notes/_ui/NoteCard";
import { CATEGORY_DEFINITIONS } from "@/entities/note/model/categories";

const note = {
  id: "note with/slash",
  title: "Return context",
  contentPreview: "A preview",
  category: CATEGORY_DEFINITIONS.school,
  lastEditedAt: "2004-08-17T12:00:00Z",
};

describe("note navigation", () => {
  it("carries a filtered notes context into an existing-note link", () => {
    render(
      <NoteCard
        note={note}
        returnCategory="school"
        onRequestDelete={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("link", { name: /Return context/ }),
    ).toHaveAttribute(
      "href",
      "/notes/note%20with%2Fslash?returnCategory=school",
    );
  });

  it("uses a clean editor URL when returning to All Notes", () => {
    render(
      <NoteCard note={note} returnCategory="all" onRequestDelete={vi.fn()} />,
    );

    expect(
      screen.getByRole("link", { name: /Return context/ }),
    ).toHaveAttribute("href", "/notes/note%20with%2Fslash");
  });
});
