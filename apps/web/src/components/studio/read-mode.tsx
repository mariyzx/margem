"use client";

import { cn } from "@margem/config/cn";
import type {
  PracticeItemDto,
  PracticeKind,
  SourceChunkDto,
  StudioSourceDto,
} from "@margem/shared";
import { Button, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@margem/ui";
import { m, useReducedMotion } from "motion/react";
import * as React from "react";
import {
  approvePractice,
  discardPractice,
  fetchSourceChunks,
  fetchSourcePractice,
  generatePractice,
} from "../../lib/api";
import { messages } from "../../messages/pt-br";
import { unavailableText } from "./ai-unavailable";
import { AskAnswer, AskNotebook } from "./ask-notebook";
import { PracticeCard } from "./practice-card";
import { answerChunkId, practiceByChunk, splitBlanks } from "./read-rules";
import type { ReadEvent, ReadState } from "./read-state";
import type { SheetCache, SourceSheet } from "./source-sheet";

const text = messages.studio.read;
const KINDS: PracticeKind[] = ["quiz", "cloze", "flashcard", "why"];

type Feedback = { tone: "info" | "error"; text: string } | null;

interface ReadModeProps {
  notebookId: string;
  sources: StudioSourceDto[];
  state: ReadState;
  dispatch: (event: ReadEvent) => void;
  sheets: SheetCache;
  setSheets: React.Dispatch<React.SetStateAction<SheetCache>>;
  onPracticeChanged: () => void;
}

export function ReadMode({
  notebookId,
  sources,
  state,
  dispatch,
  sheets,
  setSheets,
  onPracticeChanged,
}: ReadModeProps) {
  const sourceId = state.sourceId ?? sources.find((source) => source.status === "ready")?.id;
  const source = sources.find((item) => item.id === sourceId);
  const sheet = sourceId ? sheets[sourceId] : undefined;
  const [generating, setGenerating] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<Feedback>(null);

  React.useEffect(() => {
    setFeedback(null);
  }, [sourceId, state.kind]);

  const loadSheet = React.useCallback(
    async (id: string) => {
      setSheets((prev) => ({ ...prev, [id]: { status: "loading" } }));
      try {
        const [chunks, practice] = await Promise.all([
          fetchSourceChunks(id),
          fetchSourcePractice(id),
        ]);
        setSheets((prev) => ({
          ...prev,
          [id]: { status: "ready", chunks: chunks.chunks, truncated: chunks.truncated, practice },
        }));
      } catch {
        setSheets((prev) => ({ ...prev, [id]: { status: "error" } }));
      }
    },
    [setSheets],
  );

  React.useEffect(() => {
    if (source?.status === "ready" && sheet === undefined) void loadSheet(source.id);
  }, [source, sheet, loadSheet]);

  const updatePractice = (id: string, change: (items: PracticeItemDto[]) => PracticeItemDto[]) =>
    setSheets((prev) => {
      const current = prev[id];
      if (current?.status !== "ready") return prev;
      return { ...prev, [id]: { ...current, practice: change(current.practice) } };
    });

  async function handleGenerate(id: string) {
    setGenerating(true);
    setFeedback(null);
    try {
      const created = await generatePractice(id, [state.kind]);
      updatePractice(id, (items) => [
        ...items.filter((item) => !(item.kind === state.kind && item.status === "pending")),
        ...created,
      ]);
      if (created.length === 0) setFeedback({ tone: "info", text: text.nothingGenerated });
    } catch (error) {
      setFeedback({ tone: "error", text: unavailableText(error) });
    } finally {
      setGenerating(false);
    }
  }

  async function handlePending(item: PracticeItemDto, action: "approve" | "discard") {
    setBusyId(item.id);
    setFeedback(null);
    try {
      if (action === "approve") {
        const approved = await approvePractice(item.id);
        updatePractice(item.sourceId, (items) =>
          items.map((current) => (current.id === approved.id ? approved : current)),
        );
        setFeedback({ tone: "info", text: text.approved });
        onPracticeChanged();
      } else {
        await discardPractice(item.id);
        updatePractice(item.sourceId, (items) => items.filter((current) => current.id !== item.id));
      }
    } catch {
      setFeedback({ tone: "error", text: text.actionError });
    } finally {
      setBusyId(null);
    }
  }

  if (sources.length === 0) {
    return <Notice>{text.noSources}</Notice>;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex max-w-2xl flex-col gap-1.5">
        <h1 className="font-serif text-3xl leading-tight font-semibold text-ink">{text.title}</h1>
        <p className="text-[15px] leading-relaxed text-ink-muted">{text.intro}</p>
      </div>

      <fieldset className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <legend className="sr-only">{text.kindsLabel}</legend>
        {KINDS.map((kind) => (
          <label
            key={kind}
            className="flex min-h-18 cursor-pointer flex-col gap-1 rounded-lg border border-margin-rule bg-paper px-3.5 py-3 transition-colors duration-fast ease-margem-out hover:border-bic/60 has-[:checked]:border-bic has-[:checked]:bg-margin has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-bic"
          >
            <input
              type="radio"
              name="studio-practice-kind"
              value={kind}
              checked={state.kind === kind}
              onChange={() => dispatch({ type: "pickKind", kind })}
              className="sr-only"
            />
            <span className="text-sm font-semibold text-ink">{text.kinds[kind].label}</span>
            <span className="text-xs leading-snug text-ink-muted">{text.kinds[kind].hint}</span>
          </label>
        ))}
      </fieldset>

      <Tabs
        value={sourceId ?? ""}
        onValueChange={(value) => dispatch({ type: "pickSource", sourceId: value })}
        className="flex flex-col"
      >
        <TabsList
          aria-label={text.sourcesLabel}
          className="flex w-full justify-start gap-1 overflow-x-auto rounded-b-none bg-transparent p-0"
        >
          {sources.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className="shrink-0 rounded-b-none border border-b-0 border-margin-rule bg-margin px-4 py-2 data-[state=active]:bg-paper data-[state=active]:font-semibold"
            >
              {item.title}
            </TabsTrigger>
          ))}
        </TabsList>

        {source ? (
          <TabsContent value={source.id} className="rounded-lg rounded-tl-none bg-paper shadow-xs">
            <SheetBody
              source={source}
              sheet={sheet}
              state={state}
              dispatch={dispatch}
              generating={generating}
              busyId={busyId}
              feedback={feedback}
              onRetry={() => void loadSheet(source.id)}
              onGenerate={() => void handleGenerate(source.id)}
              onPending={(item, action) => void handlePending(item, action)}
            />
            <AskNotebook
              notebookId={notebookId}
              question={state.question}
              asked={state.asked}
              showAnswerHere={
                sheet?.status !== "ready" ||
                answerChunkId(state.asked, new Set(sheet.chunks.map((chunk) => chunk.id))) === null
              }
              dispatch={dispatch}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

interface SheetBodyProps {
  source: StudioSourceDto;
  sheet: SourceSheet | undefined;
  state: ReadState;
  dispatch: (event: ReadEvent) => void;
  generating: boolean;
  busyId: string | null;
  feedback: Feedback;
  onRetry: () => void;
  onGenerate: () => void;
  onPending: (item: PracticeItemDto, action: "approve" | "discard") => void;
}

function SheetBody({
  source,
  sheet,
  state,
  dispatch,
  generating,
  busyId,
  feedback,
  onRetry,
  onGenerate,
  onPending,
}: SheetBodyProps) {
  const reduceMotion = useReducedMotion();

  if (source.status !== "ready") {
    return <SheetNotice>{source.status === "failed" ? text.failed : text.notReady}</SheetNotice>;
  }
  if (!sheet || sheet.status === "loading") {
    return (
      <div className="flex flex-col gap-4 p-6" aria-busy="true">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (sheet.status === "error") {
    return (
      <SheetNotice>
        {text.loadError}{" "}
        <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
          {messages.studio.retry}
        </Button>
      </SheetNotice>
    );
  }

  const chunkIds = new Set(sheet.chunks.map((chunk) => chunk.id));
  const placed = practiceByChunk(sheet.practice, state.kind, chunkIds);
  const kindCount = sheet.practice.filter((item) => item.kind === state.kind).length;
  const hasPending = sheet.practice.some(
    (item) => item.kind === state.kind && item.status === "pending",
  );
  const answerAt = answerChunkId(state.asked, chunkIds);
  const noun = text.kinds[state.kind].noun;

  return (
    <article aria-labelledby={`sheet-${source.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-margin-rule px-6 py-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">{messages.studio.sourceType[source.type]}</span>
          <h2 id={`sheet-${source.id}`} className="font-serif text-2xl font-semibold text-ink">
            {source.title}
          </h2>
          {state.kind === "cloze" ? (
            <p className="text-xs text-ink-muted">{text.clozesHint}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={kindCount === 0 ? "primary" : "secondary"}
            loading={generating}
            onClick={onGenerate}
          >
            {generating ? text.generating : hasPending ? text.generateAgain : text.generate(noun)}
          </Button>
          {hasPending ? (
            <span className="text-[11px] text-ink-muted">{text.generateHint}</span>
          ) : null}
        </div>
      </header>

      <div aria-live="polite" className="empty:hidden">
        {feedback ? (
          <p
            className={cn(
              "border-b border-margin-rule px-6 py-2.5 text-sm",
              feedback.tone === "error" ? "text-danger" : "text-ink-muted",
            )}
          >
            {feedback.text}
          </p>
        ) : null}
      </div>

      {kindCount === 0 && !generating ? (
        <p className="border-b border-margin-rule bg-margin px-6 py-3 text-sm text-ink-muted">
          {text.nothingYet(noun)}
        </p>
      ) : null}

      <ol className="flex flex-col">
        {sheet.chunks.map((chunk) => {
          const items = placed.byChunk.get(chunk.id) ?? [];
          const marginItems =
            state.kind === "cloze" ? items.filter((item) => item.status === "pending") : items;
          const blanks =
            state.kind === "cloze" ? items.filter((item) => item.status === "approved") : [];
          return (
            <li
              key={chunk.id}
              className="grid border-b border-ground last:border-b-0 md:grid-cols-[minmax(0,1fr)_19rem]"
            >
              <div className="px-6 py-5">
                <span className="mb-1.5 block text-[11px] text-ink-muted">
                  {text.excerptLabel(chunk.ord, chunk.page)}
                </span>
                <ChunkText
                  chunk={chunk}
                  blanks={blanks}
                  shown={state.shownBlanks}
                  onShow={(practiceId) => dispatch({ type: "showBlank", practiceId })}
                  highlighted={answerAt === chunk.id}
                />
              </div>
              <div className="flex flex-col gap-2.5 border-t border-margin-rule bg-margin px-4 py-4 max-md:empty:hidden md:border-t-0 md:border-l md:border-l-margin-rule">
                {generating && state.kind !== "cloze" ? <Skeleton className="h-20 w-full" /> : null}
                {marginItems.map((item, index) => (
                  <m.div
                    key={item.id}
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceMotion ? 0 : Math.min(index, 6) * 0.05 }}
                  >
                    <PracticeCard
                      item={item}
                      pending={{
                        busy: busyId === item.id,
                        disabled: busyId !== null && busyId !== item.id,
                        onApprove: () => onPending(item, "approve"),
                        onDiscard: () => onPending(item, "discard"),
                      }}
                      answer={state.answers[item.id] ?? ""}
                      revealed={Boolean(state.revealed[item.id])}
                      flipped={Boolean(state.flipped[item.id])}
                      result={state.results[item.id]}
                      onAnswer={(value) =>
                        dispatch({ type: "typeAnswer", practiceId: item.id, value })
                      }
                      onReveal={() => dispatch({ type: "reveal", practiceId: item.id })}
                      onFlip={() => dispatch({ type: "flip", practiceId: item.id })}
                      onRate={(result) => dispatch({ type: "rate", practiceId: item.id, result })}
                    />
                  </m.div>
                ))}
                {answerAt === chunk.id && state.asked ? <AskAnswer asked={state.asked} /> : null}
              </div>
            </li>
          );
        })}
      </ol>

      {sheet.truncated ? (
        <p className="border-t border-margin-rule px-6 py-3 text-xs text-ink-muted">
          {text.truncated(sheet.chunks.length)}
        </p>
      ) : null}
    </article>
  );
}

interface ChunkTextProps {
  chunk: SourceChunkDto;
  blanks: PracticeItemDto[];
  shown: Record<string, true>;
  onShow: (practiceId: string) => void;
  highlighted: boolean;
}

function ChunkText({ chunk, blanks, shown, onShow, highlighted }: ChunkTextProps) {
  const segments = splitBlanks(
    chunk.text,
    blanks.map((blank) => ({ id: blank.id, answer: blank.answer })),
  );
  return (
    <p
      className={cn(
        "max-w-[42rem] rounded-sm font-serif text-[17px] leading-[1.75] whitespace-pre-line text-ink transition-colors duration-base",
        highlighted && "bg-margin",
      )}
    >
      {segments.map((segment, index) =>
        "blankId" in segment ? (
          shown[segment.blankId] ? (
            <span
              key={index}
              className="rounded-[3px] border-b-2 border-correct bg-correct/10 px-0.5 text-ink transition-colors duration-base"
            >
              {segment.text}
            </span>
          ) : (
            <button
              key={index}
              type="button"
              aria-label={text.blankAria}
              onClick={() => onShow(segment.blankId)}
              className="inline rounded-[3px] border-b-2 border-dashed border-ink-muted bg-marker-soft px-0.5 font-serif text-transparent transition-colors duration-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic"
            >
              {segment.text}
            </button>
          )
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        ),
      )}
    </p>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl rounded-lg bg-paper p-8 text-sm text-ink-muted shadow-xs">
      {children}
    </div>
  );
}

function SheetNotice({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-8 text-sm text-ink-muted">{children}</div>;
}
