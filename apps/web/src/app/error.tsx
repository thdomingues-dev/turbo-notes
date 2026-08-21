"use client";

import { ErrorState } from "@/shared/ui/AsyncState";

const AppError = ({ error, retry }: { error: Error; retry: () => void }) => {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <ErrorState
        title="We couldn’t reach Turbo Notes."
        error={error}
        onRetry={retry}
      />
    </main>
  );
};

export default AppError;
