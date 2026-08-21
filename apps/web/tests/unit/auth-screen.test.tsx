import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthScreen } from "@/app/(auth)/_ui/AuthScreen";
import { CATEGORY_DEFINITIONS } from "@/entities/note/model/categories";
import { writeRecoverableDraft } from "@/features/note-autosave/model/recoverableDraft";
import {
  createNoteDetail,
  createTestQueryClient,
  TEST_OWNER_ID,
} from "./helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

describe("AuthScreen", () => {
  it("clears private recoverable drafts after the server validates a signed-out route", () => {
    const note = createNoteDetail({
      category: CATEGORY_DEFINITIONS.personal,
      content: "Do not retain this across accounts",
    });
    writeRecoverableDraft(TEST_OWNER_ID, note.id, note, note.revision);

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <AuthScreen mode="login" />
      </QueryClientProvider>,
    );

    expect(window.localStorage).toHaveLength(0);
  });
});
