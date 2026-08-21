import Image from "next/image";

export const EmptyState = () => {
  return (
    <section
      className="flex min-h-[min(58dvh,520px)] flex-col items-center justify-center px-4 py-8 text-center lg:relative lg:min-h-130 lg:px-0 lg:py-0"
      aria-labelledby="empty-state-title"
    >
      <Image
        src="/artwork/boba-note.png"
        alt="A cheerful cup of bubble tea waiting patiently"
        width={297}
        height={296}
        className="h-auto w-[clamp(144px,42vw,192px)] lg:absolute lg:top-24 lg:left-1/2 lg:h-empty-art-height lg:w-empty-art-width lg:-translate-x-[calc(50%+13px)]"
        preload
      />
      <h2
        className="mt-4 max-w-155 font-empty-state text-[clamp(1.35rem,5vw,1.75rem)] leading-tight font-normal text-(--color-empty-state) lg:absolute lg:top-98 lg:left-1/2 lg:mt-0 lg:h-empty-heading-height lg:w-empty-heading-width lg:max-w-none lg:-translate-x-[calc(50%+13px)] lg:text-(length:--text-empty-state) lg:leading-none lg:whitespace-nowrap"
        id="empty-state-title"
      >
        I’m just here waiting for your charming notes...
      </h2>
    </section>
  );
};
