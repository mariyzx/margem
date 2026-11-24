import * as React from "react";
import { cn } from "@margem/config/cn";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-md bg-margin-rule/60 motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}
