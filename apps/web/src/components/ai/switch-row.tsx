import { cn } from "@margem/config/cn";
import * as React from "react";

export interface SwitchRowProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function SwitchRow({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: SwitchRowProps) {
  const id = React.useId();
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span id={labelId} className={cn("text-sm font-medium text-ink", disabled && "opacity-50")}>
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="text-xs text-ink-muted">
            {description}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-fast ease-margem-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "border-bic bg-bic" : "border-ink-muted bg-margin",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block size-4 rounded-full shadow-xs motion-safe:transition-transform motion-safe:duration-fast",
            checked ? "translate-x-6 bg-paper" : "translate-x-1 bg-ink-muted",
          )}
        />
      </button>
    </div>
  );
}
