"use client";

import { ErrorState } from "@/shared/ui/AsyncState";

const NotesError = ({ error, retry }: { error: Error; retry: () => void }) => {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <ErrorState
        title="We couldn’t load your notes."
        error={error}
        onRetry={retry}
      />
    </main>
  );
};

export default NotesError;
