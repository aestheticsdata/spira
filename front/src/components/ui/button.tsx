import { cn } from "@lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

import type { VariantProps } from "class-variance-authority";

/** The three button treatments in the design system screen, and its control height. */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary-bg border border-primary-border text-primary-ink hover:bg-primary-bg-hover",
        secondary: "bg-surface border border-line text-ink-3 hover:border-line-hover",
        ghost: "text-ink-5 hover:bg-surface-hover hover:text-ink-2",
        outline: "border border-line text-ink-4 hover:border-line-hover",
      },
      size: {
        default: "h-[30px] rounded-lg px-[13px] text-125",
        sm: "h-[26px] rounded-md px-2.5 text-12",
        xs: "h-[27px] rounded-md px-[11px] text-12",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
