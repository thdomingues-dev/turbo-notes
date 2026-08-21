import { Button } from "@/shared/ui/Button";

const asyncStateContainerStyles =
  "flex min-h-90 flex-col items-center justify-center gap-3 p-8 text-center";
const asyncStateCopyStyles = "max-w-130 text-(--color-ink-muted)";

interface LoadingStateProps {
  label?: string;
}

export const LoadingState = ({ label = "Loading" }: LoadingStateProps) => {
  return (
    <div className={asyncStateContainerStyles} role="status">
      <span
        className="size-7 animate-loading-spin rounded-full border-[3px] border-accent/20 border-t-accent motion-reduce:animate-none motion-reduce:border-t-current"
        aria-hidden="true"
      />
      <p className={asyncStateCopyStyles}>{label}…</p>
    </div>
  );
};

interface ErrorStateProps {
  title: string;
  error: Error;
  onRetry: () => void;
  headingLevel?: "h1" | "h2";
}

export const ErrorState = ({
  title,
  error,
  onRetry,
  headingLevel: Heading = "h1",
}: ErrorStateProps) => {
  return (
    <section className={asyncStateContainerStyles} role="alert">
      <Heading className="text-[1.75rem]">{title}</Heading>
      <p className={asyncStateCopyStyles}>{error.message}</p>
      <Button type="button" onClick={onRetry}>
        Try again
      </Button>
    </section>
  );
};

export const PageLoadingState = ({ label = "Loading" }: LoadingStateProps) => {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <LoadingState label={label} />
    </main>
  );
};
