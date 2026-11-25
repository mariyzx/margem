"use client";

import { cn } from "@margem/config/cn";
import type { NotebookColor, NotebookDto, NoteDto, QuestionDto, SourceDto } from "@margem/shared";
import { Button, Skeleton } from "@margem/ui";
import * as React from "react";
import {
  createQuestion,
  createTextSource,
  deleteQuestion,
  enqueueStudyErrors,
  fetchQuestions,
  fetchSource,
} from "../lib/api";
import { messages } from "../messages/pt-br";
import { NoteEditor } from "./editor/note-editor";
import { NoteMargin } from "./editor/note-margin";
import type { QuestionAnchorDraft } from "./editor/selection-toolbar";
import { SourcePanel } from "./editor/source-panel";
import { NotebookForm } from "./notebook-form";

interface NoteWorkspaceProps {
  notebooks: NotebookDto[];
  selectedNotebook: NotebookDto | null;
  selectedNote: NoteDto | null;
  loadingNote: boolean;
  creatingNotebook: boolean;
  onCancelCreateNotebook: () => void;
  onCreateNotebook: (values: { name: string; color: NotebookColor }) => Promise<void>;
  onCreateNote: (notebookId: string, sourceId?: string) => Promise<void>;
  onSaveNote: (
    noteId: string,
    values: {
      title?: string;
      doc?: Record<string, unknown>;
      sourceId?: string;
      materialOpenedAt?: string;
    },
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
  const selectedNoteId = selectedNote?.id;

  const [title, setTitle] = React.useState(selectedNote?.title ?? "");
  const titleRef = React.useRef(title);
  titleRef.current = title;
  const [saving, setSaving] = React.useState(false);
  const [mode, setMode] = React.useState<"write" | "study">("write");
  const [clozeStats, setClozeStats] = React.useState({ revealed: 0, total: 0 });
  const [studyResults, setStudyResults] = React.useState<Record<string, "correct" | "missed">>({});
  const [sendingErrors, setSendingErrors] = React.useState(false);
  const [errorsSentNotice, setErrorsSentNotice] = React.useState(false);
  const [questions, setQuestions] = React.useState<QuestionDto[]>([]);
  const [questionDraft, setQuestionDraft] = React.useState<QuestionAnchorDraft | null>(null);
  const [materialOpened, setMaterialOpened] = React.useState(
    Boolean(selectedNote?.materialOpenedAt),
  );
  const [source, setSource] = React.useState<SourceDto | null>(null);

  const docRef = React.useRef<Record<string, unknown>>(selectedNote?.doc ?? {});
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = React.useRef<{
    noteId: string;
    title: string;
    doc: Record<string, unknown>;
  } | null>(null);
  const onSaveRef = React.useRef(onSaveNote);
  onSaveRef.current = onSaveNote;

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

  React.useEffect(() => {
    docRef.current = selectedNote?.doc ?? {};
    return () => {
      void flushPending();
    };
  }, [selectedNoteId, flushPending]);

  React.useEffect(() => {
    if (!selectedNoteId) return;
    let active = true;

    fetchQuestions(selectedNoteId)
      .then((result) => {
        if (active) setQuestions(result);
      })
      .catch(() => {
        if (active) setQuestions([]);
      });

    return () => {
      active = false;
    };
  }, [selectedNoteId]);

  const selectedSourceId = selectedNote?.sourceId ?? null;
  React.useEffect(() => {
    if (!selectedSourceId || !materialOpened) return;
    let active = true;

    fetchSource(selectedSourceId)
      .then((loaded) => {
        if (active) setSource(loaded);
      })
      .catch(() => {
        if (active) setSource(null);
      });

    return () => {
      active = false;
    };
  }, [selectedSourceId, materialOpened]);

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

  function handleHighlightBlock(blockId: string) {
    const el = document.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`);
    if (!(el instanceof HTMLElement)) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    el.classList.add("ring-2", "ring-bic/40", "rounded-sm");
    setTimeout(() => el.classList.remove("ring-2", "ring-bic/40", "rounded-sm"), 1200);
  }

  async function handleSwitchMode(nextMode: "write" | "study") {
    if (nextMode === mode) return;
    if (nextMode === "study") {
      await flushPending();
      setStudyResults({});
      setErrorsSentNotice(false);
      setQuestionDraft(null);
    }
    setMode(nextMode);
  }

  const wrongQuestionIds = Object.entries(studyResults)
    .filter(([, result]) => result === "missed")
    .map(([id]) => id);
  const answeredCount = Object.keys(studyResults).length;

  async function handleSendErrorsToReview() {
    if (!selectedNote || wrongQuestionIds.length === 0) return;
    setSendingErrors(true);
    try {
      await enqueueStudyErrors(selectedNote.id, wrongQuestionIds);
      setErrorsSentNotice(true);
    } catch {
      setErrorsSentNotice(false);
    } finally {
      setSendingErrors(false);
    }
  }

  async function handleOpenMaterial() {
    if (!selectedNote || !selectedNote.sourceId) return;
    await flushPending();
    await onSaveNote(selectedNote.id, {
      materialOpenedAt: new Date().toISOString(),
    });
    const loaded = await fetchSource(selectedNote.sourceId);
    setSource(loaded);
    setMaterialOpened(true);
  }

  async function handleCreateNoteWithMaterial(input: {
    notebookId: string;
    title: string;
    content: string;
  }) {
    if (!selectedNote) return;
    await flushPending();
    const createdSource = await createTextSource(input);
    await onSaveNote(selectedNote.id, {
      title: titleRef.current,
      doc: docRef.current,
      sourceId: createdSource.id,
    });
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

  if (loadingNote && !selectedNote) {
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
    <div className="mx-auto grid w-full max-w-[1040px] grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,680px)_320px]">
      <article className="flex flex-col rounded-lg border border-margin-rule bg-paper px-8 py-10 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-muted">
          <div className="flex items-center gap-3">
            <span>{selectedNotebook?.name}</span>
            <span>{saving ? messages.notes.saving : messages.notes.saved}</span>
          </div>

          <div
            role="group"
            aria-label={messages.study.studyMode}
            className="inline-flex rounded-md border border-margin-rule bg-margin p-0.5"
          >
            <button
              type="button"
              onClick={() => void handleSwitchMode("write")}
              className={cn(
                "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors duration-fast",
                mode === "write" ? "bg-paper text-ink shadow-xs" : "text-ink-muted hover:text-ink",
              )}
            >
              {messages.study.writeMode}
            </button>
            <button
              type="button"
              onClick={() => void handleSwitchMode("study")}
              className={cn(
                "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors duration-fast",
                mode === "study"
                  ? "bg-marker-soft text-ink shadow-xs"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {messages.study.studyMode}
            </button>
          </div>
        </div>

        {mode === "study" ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-marker bg-marker-soft/50 px-3 py-2 text-xs text-ink">
            <span>
              {clozeStats.revealed} de {clozeStats.total} {messages.study.progressClozes} ·{" "}
              {answeredCount} de {questions.length} {messages.study.progressQuestions}
            </span>
            {wrongQuestionIds.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={sendingErrors}
                onClick={() => void handleSendErrorsToReview()}
              >
                {errorsSentNotice
                  ? messages.study.errorsSentToast
                  : messages.study.sendErrorsButton}
              </Button>
            ) : null}
          </div>
        ) : null}

        <input
          type="text"
          aria-label={messages.notes.titlePlaceholder}
          placeholder={messages.notes.titlePlaceholder}
          value={title}
          readOnly={mode === "study"}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave(e.target.value, docRef.current);
          }}
          onBlur={() => flushTitle(title)}
          className="mb-4 w-full bg-transparent font-serif text-3xl font-semibold text-ink placeholder:text-ink-muted/50 focus:outline-none"
        />
        <NoteEditor
          mode={mode}
          initialDoc={selectedNote.doc}
          placeholder={messages.notes.bodyPlaceholder}
          currentOrigin={materialOpened ? "material" : "memory"}
          showOriginBars={Boolean(selectedNote.sourceId || materialOpened)}
          onChangeDoc={(nextDoc) => {
            docRef.current = nextDoc;
            scheduleSave(titleRef.current, nextDoc);
          }}
          onCreateQuestion={(draft) => setQuestionDraft(draft)}
          onClozeStatsChange={setClozeStats}
        />
      </article>
      <div className="flex flex-col gap-4">
        <SourcePanel
          notebookId={selectedNote.notebookId}
          sourceId={selectedNote.sourceId}
          source={source}
          materialOpened={materialOpened}
          onOpenMaterial={handleOpenMaterial}
          onCreateNoteWithMaterial={handleCreateNoteWithMaterial}
        />
        <NoteMargin
          mode={mode}
          questions={questions}
          draft={questionDraft}
          studyResults={studyResults}
          onMarkStudyResult={(id, result) => setStudyResults((prev) => ({ ...prev, [id]: result }))}
          onCancelDraft={() => setQuestionDraft(null)}
          onCreateQuestion={async (input) => {
            const created = await createQuestion(selectedNote.id, input);
            setQuestions((prev) => [...prev, created]);
            setQuestionDraft(null);
          }}
          onDeleteQuestion={async (id) => {
            await deleteQuestion(id);
            setQuestions((prev) => prev.filter((q) => q.id !== id));
          }}
          onHighlightBlock={handleHighlightBlock}
        />
      </div>
    </div>
  );
}
