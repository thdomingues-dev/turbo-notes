import Link from "next/link";

const NotFound = () => {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <section className="flex min-h-90 flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-[1.75rem]">This page wandered off.</h1>
        <p className="max-w-130 text-(--color-ink-muted)">
          The address may be incorrect, or the page may have moved.
        </p>
        <Link
          className="text-accessible-link underline underline-offset-[3px]"
          href="/"
        >
          Return home
        </Link>
      </section>
    </main>
  );
};

export default NotFound;
