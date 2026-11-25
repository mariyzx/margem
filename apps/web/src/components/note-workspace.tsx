"use client";

import type { NotebookColor, NotebookDto, NoteDto } from "@margem/shared";
import { Button, Skeleton } from "@margem/ui";
import * as React from "react";
import { messages } from "../messages/pt-br";
import { NotebookForm } from "./notebook-form";
import { NoteEditor } from "./editor/note-editor";

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
  const [saving, setSaving] = React.useState(false);
  const docRef = React.useRef<Record<string, unknown>>(selectedNote?.doc ?? {});
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = React.useRef<{
    noteId: string;
    title: string;
    doc: Record<string, unknown>;
  } | null>(null);
  const onSaveRef = React.useRef(onSaveNote);
  onSaveRef.current = onSaveNote;
  const [questionHint, setQuestionHint] = React.useState<string | null>(null);

  const flushPending = React.useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    setSaving(true);
    try {
      await onSaveRef.current(pending.noteId, { title: pending.title, doc: pending.doc });
    } finally {
      setSaving(false);
    }
  }, []);

  const selectedNoteId = selectedNote?.id;
  React.useEffect(() => {
    docRef.current = selectedNote?.doc ?? {};
    return () => {
      void flushPending();
    };
  }, [selectedNoteId, flushPending]);

  function scheduleSave(nextTitle: string, nextDoc: Record<string, unknown>) {
    if (!selectedNote) return;
    pendingRef.current = { noteId: selectedNote.id, title: nextTitle, doc: nextDoc };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushPending(), 800);
  }

  function flushTitle(nextTitle: string) {
    if (!selectedNote || nextTitle === selectedNote.title) return;
    pendingRef.current = { noteId: selectedNote.id, title: nextTitle, doc: docRef.current };
    void flushPending();
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
        onChange={(e) => {
          setTitle(e.target.value);
          scheduleSave(e.target.value, docRef.current);
        }}
        onBlur={() => flushTitle(title)}
        className="mb-4 w-full bg-transparent font-serif text-3xl font-semibold text-ink placeholder:text-ink-muted/50 focus:outline-none"
      />

      <NoteEditor
        initialDoc={selectedNote.doc}
        placeholder={messages.notes.bodyPlaceholder}
        onChangeDoc={(nextDoc) => {
          docRef.current = nextDoc;
          scheduleSave(title, nextDoc);
        }}
        onCreateQuestion={(quote) => {
          setQuestionHint(
            `Trecho selecionado para pergunta: "${quote}" (margem entra na próxima etapa)`,
          );
        }}
      />

      {questionHint ? <p className="mt-4 text-xs text-ink-muted">{questionHint}</p> : null}
    </article>
  );
}
