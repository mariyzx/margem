import * as Label from "@radix-ui/react-label";
import * as React from "react";
import { cn } from "@margem/config/cn";

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, id, className, ...props }: FieldProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label.Root htmlFor={inputId} className="font-sans text-sm font-medium text-ink">
        {label}
      </Label.Root>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "h-10 w-full rounded-md border bg-paper px-3 font-sans text-sm text-ink transition-colors duration-fast ease-margem-out placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-danger focus-visible:outline-danger" : "border-margin-rule",
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="font-sans text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="font-sans text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
