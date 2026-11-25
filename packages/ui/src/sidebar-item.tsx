import { cn } from "@margem/config/cn";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const sidebarItemVariants = cva(
  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors duration-fast ease-margem-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      active: {
        true: "bg-paper font-medium text-ink shadow-xs",
        false: "text-ink-muted hover:bg-paper/70 hover:text-ink",
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);

export interface SidebarItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof sidebarItemVariants> {}

export const SidebarItem = React.forwardRef<HTMLButtonElement, SidebarItemProps>(
  ({ className, active, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        aria-current={active ? "page" : undefined}
        className={cn(sidebarItemVariants({ active }), className)}
        {...props}
      />
    );
  },
);

SidebarItem.displayName = "SidebarItem";
