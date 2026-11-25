import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@margem/config/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-sans text-sm font-medium transition-colors duration-fast ease-margem-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-bic text-paper hover:bg-bic/90",
        secondary: "border border-margin-rule bg-paper text-ink hover:bg-margin",
        ghost: "text-ink-muted hover:bg-margin hover:text-ink",
        danger: "bg-danger text-paper hover:bg-danger/90",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot
        className={cn(buttonVariants({ variant, size }), className)}
        aria-busy={loading || undefined}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
