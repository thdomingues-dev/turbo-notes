import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithRef } from "react";

import { cn } from "@/shared/lib/classNames";

const inputStyles = cva(
  "h-12 w-full rounded-control border border-accent bg-transparent px-3.5 font-sans text-base leading-none text-note-ink placeholder:text-note-ink placeholder:opacity-100 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-65 md:h-9.75 md:text-xs",
  {
    variants: {
      adornment: {
        none: "",
        end: "pr-12",
      },
    },
    defaultVariants: {
      adornment: "none",
    },
  },
);

type InputProps = ComponentPropsWithRef<"input"> &
  VariantProps<typeof inputStyles>;

export const Input = ({ className, adornment, ...props }: InputProps) => {
  return (
    <input className={cn(inputStyles({ adornment }), className)} {...props} />
  );
};
