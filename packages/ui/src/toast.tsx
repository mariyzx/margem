import * as ToastPrimitive from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@margem/config/cn";

export const ToastProvider = ToastPrimitive.Provider;

export function ToastViewport({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        "fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2 outline-none",
        className,
      )}
      {...props}
    />
  );
}

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start justify-between gap-3 rounded-md border bg-paper p-4 shadow-sm transition-all duration-slow ease-margem-out",
  {
    variants: {
      variant: {
        default: "border-margin-rule text-ink",
        success: "border-correct/40 text-ink",
        danger: "border-danger/40 text-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface ToastProps
  extends
    React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root>,
    VariantProps<typeof toastVariants> {}

export function Toast({ className, variant, ...props }: ToastProps) {
  return <ToastPrimitive.Root className={cn(toastVariants({ variant }), className)} {...props} />;
}

export function ToastTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>) {
  return (
    <ToastPrimitive.Title className={cn("font-sans text-sm font-medium", className)} {...props} />
  );
}

export function ToastDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>) {
  return (
    <ToastPrimitive.Description
      className={cn("font-sans text-xs text-ink-muted", className)}
      {...props}
    />
  );
}

export function ToastClose({
  className,
  "aria-label": ariaLabel = "Fechar aviso",
  ...props
}: React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>) {
  return (
    <ToastPrimitive.Close
      aria-label={ariaLabel}
      className={cn(
        "rounded p-1 text-ink-muted transition-colors duration-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-bic",
        className,
      )}
      {...props}
    >
      <X className="size-4" aria-hidden="true" />
    </ToastPrimitive.Close>
  );
}
