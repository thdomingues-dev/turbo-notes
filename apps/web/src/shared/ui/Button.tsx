import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithRef } from "react";

import { cn } from "@/shared/lib/classNames";

const buttonStyles = cva(
  "inline-flex cursor-pointer items-center justify-center bg-transparent font-sans disabled:cursor-not-allowed disabled:opacity-65",
  {
    variants: {
      variant: {
        primary:
          "border border-accent text-accessible-link enabled:hover:bg-(--color-accent-interaction)",
        secondary: "border border-accent text-(--color-ink)",
        danger:
          "border border-(--color-danger) bg-(--color-danger) text-canvas enabled:hover:bg-[color-mix(in_srgb,var(--color-danger)_88%,var(--color-note-ink))]",
        text: "border-0 text-accessible-link underline underline-offset-[3px]",
      },
      size: {
        sm: "min-h-9 rounded-control px-3 text-sm",
        md: "min-h-11 rounded-full px-5",
        icon: "size-11 rounded-full p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

const iconButtonStyles = cva(
  "grid cursor-pointer place-items-center border-0 bg-transparent font-sans disabled:cursor-not-allowed disabled:opacity-65",
  {
    variants: {
      variant: {
        secondary: "text-(--color-ink)",
        text: "text-accessible-link",
      },
      size: {
        sm: "size-9 rounded-control",
        md: "size-11 rounded-full",
        icon: "size-11 rounded-full",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "icon",
    },
  },
);

type ButtonProps = ComponentPropsWithRef<"button"> &
  VariantProps<typeof buttonStyles>;

export const Button = ({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) => {
  return (
    <button
      className={cn(buttonStyles({ variant, size }), className)}
      type={type}
      {...props}
    />
  );
};

type AccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-label"?: never; "aria-labelledby": string };

type IconButtonProps = Omit<
  ComponentPropsWithRef<"button">,
  "aria-label" | "aria-labelledby"
> &
  VariantProps<typeof iconButtonStyles> &
  AccessibleName;

export const IconButton = ({
  className,
  variant,
  size,
  type = "button",
  ...props
}: IconButtonProps) => {
  return (
    <button
      className={cn(iconButtonStyles({ variant, size }), className)}
      type={type}
      {...props}
    />
  );
};
