import { Button } from "@/shared/ui/Button";

interface SessionRefreshWarningProps {
  onRetry: () => void;
}

export const SessionRefreshWarning = ({
  onRetry,
}: SessionRefreshWarningProps) => {
  return (
    <div
      className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-(--color-danger) bg-(--color-danger-surface) px-3 py-2 text-sm text-(--color-danger)"
      role="alert"
    >
      <p>We couldn’t refresh your session. You can keep working here.</p>
      <Button
        className="min-h-9 flex-none px-0 font-bold text-inherit"
        variant="text"
        size="sm"
        onClick={onRetry}
      >
        Retry session
      </Button>
    </div>
  );
};
