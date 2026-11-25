"use client";

import type { NotebookColor, NotebookDto, NoteDto } from "@margem/shared";
import { Button, Skeleton } from "@margem/ui";
import * as React from "react";
import { messages } from "../messages/pt-br";
import { NotebookForm } from "./notebook-form";

function docToPlainText(doc: Record<string, unknown>): string {
  const content = doc.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((node) => {
      if (!node || typeof node !== "object") return "";
      const children = (node as { content?: unknown }).content;
      if (!Array.isArray(children)) return "";
      return children
        .map((child) =>
          child &&
          typeof child === "object" &&
          typeof (child as { text?: unknown }).text === "string"
            ? (child as { text: string }).text
            : "",
        )
        .join("");
    })
    .join("\n");
}

function plainTextToDoc(text: string): Record<string, unknown> {
  const lines = text.split("\n");
  return {
    type: "doc",
    content: lines.map((line) =>
      line.length > 0
        ? { type: "paragraph", content: [{ type: "text", text: line }] }
        : { type: "paragraph" },
    ),
  };
}

interface NoteWorkspaceProps {
  notebooks: NotebookDto[];
  selectedNotebook: NotebookDto | null;
  selectedNote: NoteDto | null;
  loadingNote: boolean;
  creatingNotebook: boolean;
  onCancelCreateNotebook: () => void;
  onCreateNotebook: (values: { name: string; color: NotebookColor }) => Promise<void>;
  onCreateNote: (notebookId: string) => Promise<void>;
  onSaveNote: (
    noteId: string,
    values: { title: string; doc: Record<string, unknown> },
  ) => Promise<void>;
}

export function NoteWorkspace({
  notebooks,
  selectedNotebook,
  selectedNote,
  loadingNote,
  creatingNotebook,
  onCancelCreateNotebook,
  onCreateNotebook,
  onCreateNote,
  onSaveNote,
}: NoteWorkspaceProps) {
  const [title, setTitle] = React.useState(selectedNote?.title ?? "");
  const [body, setBody] = React.useState(() =>
    selectedNote ? docToPlainText(selectedNote.doc) : "",
  );
  const [saving, setSaving] = React.useState(false);

  async function persistCurrentNote(nextTitle: string, nextBody: string) {
    if (!selectedNote) return;
    if (nextTitle === selectedNote.title && nextBody === docToPlainText(selectedNote.doc)) {
      return;
    }
    setSaving(true);
    try {
      await onSaveNote(selectedNote.id, {
        title: nextTitle,
        doc: plainTextToDoc(nextBody),
      });
    } finally {
      setSaving(false);
    }
  }

  if (creatingNotebook || notebooks.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col justify-center py-12">
        <div className="rounded-lg border border-margin-rule bg-paper p-8 shadow-sm">
          <h1 className="font-serif text-2xl font-semibold text-ink">
            {messages.notebooks.emptyTitle}
          </h1>
          <p className="mt-2 mb-6 text-sm text-ink-muted">{messages.notebooks.emptyDescription}</p>
          <NotebookForm
            onSubmit={onCreateNotebook}
            onCancel={notebooks.length > 0 ? onCancelCreateNotebook : undefined}
          />
        </div>
      </div>
    );
  }

  if (loadingNote) {
    return (
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4 py-12">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-5/6" />
      </div>
    );
  }

  if (!selectedNote && selectedNotebook) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-start justify-center py-16">
        <div className="w-full rounded-lg border border-margin-rule bg-paper p-8 shadow-sm">
          <h1 className="font-serif text-2xl font-semibold text-ink">{selectedNotebook.name}</h1>
          <p className="mt-2 text-sm text-ink-muted">{messages.notebooks.emptyNotebookTitle}</p>
          <p className="mt-1 mb-6 text-sm text-ink-muted">
            {messages.notebooks.emptyNotebookDescription}
          </p>
          <Button type="button" onClick={() => onCreateNote(selectedNotebook.id)}>
            {messages.notebooks.writeFirstNote}
          </Button>
        </div>
      </div>
    );
  }

  if (!selectedNote) {
    return null;
  }

  return (
    <article className="mx-auto flex w-full max-w-[680px] flex-col rounded-lg border border-margin-rule bg-paper px-8 py-10 shadow-sm">
      <div className="mb-2 flex items-center justify-between text-xs text-ink-muted">
        <span>{selectedNotebook?.name}</span>
        <span>{saving ? messages.notes.saving : messages.notes.saved}</span>
      </div>

      <input
        type="text"
        aria-label={messages.notes.titlePlaceholder}
        placeholder={messages.notes.titlePlaceholder}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => void persistCurrentNote(title, body)}
        className="mb-4 w-full bg-transparent font-serif text-3xl font-semibold text-ink placeholder:text-ink-muted/50 focus:outline-none"
      />

      <textarea
        aria-label={messages.notes.bodyPlaceholder}
        placeholder={messages.notes.bodyPlaceholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => void persistCurrentNote(title, body)}
        rows={14}
        className="w-full resize-y bg-transparent font-serif text-[18px] leading-[1.75] text-ink placeholder:text-ink-muted/50 focus:outline-none"
      />
    </article>
  );
}
