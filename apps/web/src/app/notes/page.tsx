import type { Metadata } from "next";
import { Suspense } from "react";

import { redirectAnonymousRequest } from "@/features/auth/index.server";
import { PageLoadingState } from "@/shared/ui/AsyncState";
import { NotesScreen } from "./_ui/NotesScreen";

export const metadata: Metadata = { title: "Your notes" };

const NotesPage = async () => {
  const initialSession = await redirectAnonymousRequest();
  return (
    <Suspense fallback={<PageLoadingState label="Loading notes" />}>
      <NotesScreen initialSession={initialSession} />
    </Suspense>
  );
};

export default NotesPage;
