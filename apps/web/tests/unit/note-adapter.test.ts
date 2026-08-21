import { describe, expect, it } from "vitest";

import {
  adaptCategories,
  adaptNoteDetail,
  adaptNoteListPage,
} from "@/entities/note/api/adapter";

describe("notes API adapter", () => {
  it("maps generated note transport shapes into the UI domain", () => {
    const page = adaptNoteListPage({
      next: "http://api.test/api/v1/notes/?cursor=next-page",
      previous: null,
      results: [
        {
          id: "note-1",
          title: "Grocery List",
          content_preview: "Milk\nEggs",
          category_key: "random-thoughts",
          last_edited_at: "2004-08-17T12:00:00Z",
        },
      ],
    });

    expect(page.results[0]).toMatchObject({
      id: "note-1",
      contentPreview: "Milk\nEggs",
      category: { key: "random-thoughts" },
    });
    expect(page.next).toContain("cursor=next-page");

    expect(
      adaptCategories([
        { key: "random-thoughts", note_count: 3 },
        { key: "school", note_count: 2 },
        { key: "personal", note_count: 1 },
        { key: "drama", note_count: 4 },
      ]),
    ).toEqual([
      expect.objectContaining({
        key: "random-thoughts",
        noteCount: 3,
      }),
      expect.objectContaining({
        key: "school",
        noteCount: 2,
      }),
      expect.objectContaining({
        key: "personal",
        noteCount: 1,
      }),
      expect.objectContaining({
        key: "drama",
        noteCount: 4,
      }),
    ]);

    expect(
      adaptNoteDetail({
        id: "note-1",
        title: "Title",
        content: "Body",
        category_key: "school",
        revision: 1,
        created_at: "2004-08-17T12:00:00Z",
        last_edited_at: "2004-08-17T13:00:00Z",
      }),
    ).toEqual({
      id: "note-1",
      title: "Title",
      content: "Body",
      category: expect.objectContaining({ key: "school", name: "School" }),
      revision: 1,
      lastEditedAt: "2004-08-17T13:00:00Z",
    });
  });
});
