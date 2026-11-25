"use client";

import { createTextSourceSchema, type SourceDto } from "@margem/shared";
import { Button, Field } from "@margem/ui";
import { BookOpenCheck, FilePlus2 } from "lucide-react";
import * as React from "react";
import { messages } from "../../messages/pt-br";

interface SourcePanelProps {
  notebookId: string;
  sourceId: string | null;
  source: SourceDto | null;
  materialOpened: boolean;
  onOpenMaterial: () => Promise<void>;
  onCreateNoteWithMaterial: (input: {
    notebookId: string;
    title: string;
    content: string;
  }) => Promise<void>;
}

export function SourcePanel({
  notebookId,
  sourceId,
  source,
  materialOpened,
  onOpenMaterial,
  onCreateNoteWithMaterial,
}: SourcePanelProps) {
  const [showForm, setShowForm] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);
  const [opening, setOpening] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    const parsed = createTextSourceSchema.safeParse({ notebookId, title, content });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }

    setSubmitting(true);
    try {
      await onCreateNoteWithMaterial(parsed.data);
      setTitle("");
      setContent("");
      setShowForm(false);
    } catch {
      setError(messages.source.loadError);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOpenClick() {
    setOpening(true);
    try {
      await onOpenMaterial();
    } finally {
      setOpening(false);
    }
  }

  if (!sourceId) {
    return (
      <section
        aria-label={messages.source.panelTitle}
        className="flex flex-col gap-3 rounded-lg border border-margin-rule bg-margin p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-medium tracking-wide text-ink-muted uppercase">
            {messages.source.panelTitle}
          </h2>
          {!showForm ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(true)}>
              <FilePlus2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>{messages.source.attachButton}</span>
            </Button>
          ) : null}
        </div>

        {showForm ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
            <Field
              label={messages.source.titleLabel}
              placeholder={messages.source.titlePlaceholder}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError(undefined);
              }}
              autoFocus
            />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="source-content" className="text-sm font-medium text-ink">
                {messages.source.contentLabel}
              </label>
              <textarea
                id="source-content"
                rows={4}
                placeholder={messages.source.contentPlaceholder}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  if (error) setError(undefined);
                }}
                className="w-full rounded-md border border-margin-rule bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-bic focus:outline-none"
              />
            </div>

            {error ? <p className="text-xs text-danger">{error}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" loading={submitting}>
                {messages.source.createNoteWithMaterial}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                {messages.source.cancel}
              </Button>
            </div>
          </form>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-label={messages.source.panelTitle}
      className="flex flex-col gap-3 rounded-lg border border-margin-rule bg-margin p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium tracking-wide text-ink-muted uppercase">
          {messages.source.panelTitle}
        </h2>
        <div className="flex items-center gap-2 text-[11px] text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-0.5 bg-margin-rule" aria-hidden="true" />
            {messages.source.memoryLegend}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-0.5 bg-bic" aria-hidden="true" />
            {messages.source.materialLegend}
          </span>
        </div>
      </div>

      {!materialOpened ? (
        <div className="flex flex-col gap-3 rounded-md border border-margin-rule bg-paper p-3">
          <p className="text-xs leading-relaxed text-ink-muted">{messages.source.closedHint}</p>
          <Button type="button" size="sm" loading={opening} onClick={() => void handleOpenClick()}>
            <BookOpenCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>{messages.source.openMaterial}</span>
          </Button>
        </div>
      ) : source ? (
        <div className="flex flex-col gap-2 rounded-md border border-bic/30 bg-paper p-3">
          <p className="text-xs font-semibold text-ink">{source.title}</p>
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">
            {source.content}
          </p>
        </div>
      ) : null}
    </section>
  );
}
