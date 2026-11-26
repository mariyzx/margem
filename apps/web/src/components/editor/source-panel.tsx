"use client";

import { createLinkSourceSchema, createTextSourceSchema, type SourceDto } from "@margem/shared";
import { Button, Field } from "@margem/ui";
import { BookOpenCheck, ExternalLink, FilePlus2, FileUp, Link2, Trash2 } from "lucide-react";
import * as React from "react";
import { fetchSourceFileUrl } from "../../lib/api";
import { createErrorMessage } from "../../lib/errors";
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
  onAttachPdfSource: (input: { notebookId: string; file: File }) => Promise<void>;
  onAttachLinkSource: (input: { notebookId: string; url: string; title?: string }) => Promise<void>;
  onRemoveSource?: (sourceId: string) => Promise<void>;
}

export function SourcePanel({
  notebookId,
  sourceId,
  source,
  materialOpened,
  onOpenMaterial,
  onCreateNoteWithMaterial,
  onAttachPdfSource,
  onAttachLinkSource,
  onRemoveSource,
}: SourcePanelProps) {
  const [formMode, setFormMode] = React.useState<"closed" | "text" | "link">("closed");
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [linkUrl, setLinkUrl] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);
  const [opening, setOpening] = React.useState(false);
  const [uploadingPdf, setUploadingPdf] = React.useState(false);
  const [openingPdf, setOpeningPdf] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

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
      setFormMode("closed");
    } catch (error) {
      setError(createErrorMessage(error, messages.source.loadError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLinkSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    const parsed = createLinkSourceSchema.safeParse({
      notebookId,
      url: linkUrl,
      ...(title.trim() ? { title: title.trim() } : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }

    setSubmitting(true);
    try {
      await onAttachLinkSource(parsed.data);
      setTitle("");
      setLinkUrl("");
      setFormMode("closed");
    } catch (err) {
      setError(createErrorMessage(err, messages.source.loadError));
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

  async function handlePdfChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(undefined);

    const maxBytes = 25 * 1024 * 1024;
    if (file.size === 0 || file.size > maxBytes) {
      setError(messages.source.invalidPdfError);
      return;
    }

    setUploadingPdf(true);
    try {
      await onAttachPdfSource({ notebookId, file });
    } catch (err) {
      setError(createErrorMessage(err, messages.source.loadError));
    } finally {
      setUploadingPdf(false);
    }
  }

  async function handleOpenPdfClick() {
    if (!source) return;
    setOpeningPdf(true);
    setError(undefined);
    try {
      const url = await fetchSourceFileUrl(source.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(createErrorMessage(err, messages.source.loadError));
    } finally {
      setOpeningPdf(false);
    }
  }

  async function handleRemoveClick() {
    if (!sourceId || !onRemoveSource) return;
    setRemoving(true);
    setError(undefined);
    try {
      await onRemoveSource(sourceId);
    } catch (err) {
      setError(createErrorMessage(err, messages.source.loadError));
    } finally {
      setRemoving(false);
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
          {formMode === "closed" ? (
            <div className="flex flex-wrap items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => void handlePdfChange(e)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={uploadingPdf}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>{messages.source.uploadPdfButton}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setError(undefined);
                  setFormMode("link");
                }}
              >
                <Link2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>{messages.source.attachLinkButton}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setError(undefined);
                  setFormMode("text");
                }}
              >
                <FilePlus2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>{messages.source.attachButton}</span>
              </Button>
            </div>
          ) : null}
        </div>

        {formMode === "closed" && error ? <p className="text-xs text-danger">{error}</p> : null}

        {formMode === "link" ? (
          <form onSubmit={handleLinkSubmit} className="flex flex-col gap-3" noValidate>
            <Field
              label={messages.source.linkLabel}
              placeholder={messages.source.linkPlaceholder}
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value);
                if (error) setError(undefined);
              }}
              autoFocus
            />
            <Field
              label={messages.source.titleLabel}
              placeholder={messages.source.titlePlaceholder}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError(undefined);
              }}
            />

            {error ? <p className="text-xs text-danger">{error}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" loading={submitting}>
                {messages.source.createNoteWithLink}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setFormMode("closed")}>
                {messages.source.cancel}
              </Button>
            </div>
          </form>
        ) : null}

        {formMode === "text" ? (
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
              <Button type="button" variant="ghost" size="sm" onClick={() => setFormMode("closed")}>
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
          {onRemoveSource ? (
            <button
              type="button"
              disabled={removing}
              aria-label={messages.source.removeSource}
              title={messages.source.removeSource}
              onClick={() => void handleRemoveClick()}
              className="rounded p-1 text-ink-muted transition-colors hover:bg-paper hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          ) : null}
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
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink">{source.title}</p>
            {source.type === "file" || source.type === "link" ? (
              <span className="rounded bg-margin px-1.5 py-0.5 text-[11px] text-ink-muted">
                {source.status === "queued"
                  ? messages.source.statusQueued
                  : source.status === "processing"
                    ? messages.source.statusProcessing
                    : source.status === "failed"
                      ? messages.source.statusFailed
                      : messages.source.statusReady}
              </span>
            ) : null}
          </div>
          {source.type === "file" ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={openingPdf}
              onClick={() => void handleOpenPdfClick()}
            >
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>{messages.source.openPdf}</span>
            </Button>
          ) : source.type === "link" && source.url ? (
            <Button asChild variant="secondary" size="sm">
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>{messages.source.openLink}</span>
              </a>
            </Button>
          ) : (
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">
              {source.content}
            </p>
          )}
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
