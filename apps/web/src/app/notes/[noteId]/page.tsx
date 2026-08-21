import type { Metadata } from "next";

import { isCategoryFilterKey } from "@/entities/note";
import { redirectAnonymousRequest } from "@/features/auth/index.server";
import { NoteEditorScreen } from "./_ui/NoteEditorScreen";

export const metadata: Metadata = { title: "Edit note" };

interface NoteEditorPageProps {
  params: Promise<{ noteId: string }>;
  searchParams: Promise<{ returnCategory?: string | string[] }>;
}

const NoteEditorPage = async ({
  params,
  searchParams,
}: NoteEditorPageProps) => {
  const initialSession = await redirectAnonymousRequest();
  const [{ noteId }, query] = await Promise.all([params, searchParams]);
  const requestedCategory = query.returnCategory;
  const returnCategory =
    typeof requestedCategory === "string" &&
    isCategoryFilterKey(requestedCategory)
      ? requestedCategory
      : "all";

  return (
    <NoteEditorScreen
      noteId={noteId}
      returnCategory={returnCategory}
      initialSession={initialSession}
    />
  );
};

export default NoteEditorPage;
