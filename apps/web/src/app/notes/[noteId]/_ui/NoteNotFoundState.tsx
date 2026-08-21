import Link from "next/link";

export const NoteNotFoundState = () => {
  return (
    <section className="flex min-h-90 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-[1.75rem]">That note wandered off.</h1>
      <p className="max-w-130 text-(--color-ink-muted)">
        It may have been deleted, or the link may be incorrect.
      </p>
      <Link
        className="text-accessible-link underline underline-offset-[3px]"
        href="/notes"
      >
        Return to your notes
      </Link>
    </section>
  );
};
