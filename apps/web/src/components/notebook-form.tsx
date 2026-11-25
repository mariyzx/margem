"use client";

import { cn } from "@margem/config/cn";
import { createNotebookSchema, NOTEBOOK_COLORS, type NotebookColor } from "@margem/shared";
import { Button, Field } from "@margem/ui";
import * as React from "react";
import { messages } from "../messages/pt-br";

const COLOR_DOT_CLASSES: Record<NotebookColor, string> = {
  bic: "bg-bic",
  correct: "bg-correct",
  turma: "bg-turma",
  marker: "bg-marker",
  ink: "bg-ink",
};

interface NotebookFormProps {
  onSubmit: (values: { name: string; color: NotebookColor }) => Promise<void>;
  onCancel?: () => void;
}

export function NotebookForm({ onSubmit, onCancel }: NotebookFormProps) {
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState<NotebookColor>("bic");
  const [fieldError, setFieldError] = React.useState<string | undefined>();
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(undefined);

    const parsed = createNotebookSchema.safeParse({ name, color });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? messages.notebooks.nameRequiredError);
      return;
    }

    setLoading(true);
    try {
      await onSubmit(parsed.data);
      setName("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Field
        label={messages.notebooks.nameLabel}
        placeholder={messages.notebooks.namePlaceholder}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (fieldError) setFieldError(undefined);
        }}
        error={fieldError}
        autoFocus
      />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">{messages.notebooks.colorLabel}</span>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label={messages.notebooks.colorLabel}
        >
          {NOTEBOOK_COLORS.map((option) => {
            const selected = color === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={messages.notebooks.colors[option]}
                onClick={() => setColor(option)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors duration-fast ease-margem-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic",
                  selected
                    ? "border-bic bg-margin font-medium text-ink"
                    : "border-margin-rule bg-paper text-ink-muted hover:text-ink",
                )}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", COLOR_DOT_CLASSES[option])} />
                <span>{messages.notebooks.colors[option]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" loading={loading}>
          {loading ? messages.notebooks.creatingButton : messages.notebooks.createButton}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
            {messages.notebooks.cancelButton}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
