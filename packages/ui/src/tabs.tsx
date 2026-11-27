import { cn } from "@margem/config/cn";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("inline-flex items-stretch gap-1 rounded-lg bg-ground p-1", className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative rounded-md px-3 py-1.5 text-left font-sans text-sm text-ink-muted transition-colors duration-fast ease-margem-out hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic data-[state=active]:text-ink disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("outline-none focus-visible:outline-2 focus-visible:outline-bic", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
