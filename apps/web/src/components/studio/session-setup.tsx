"use client";

import { type PracticeItemDto, sessionKindSchema, type StudioSourceDto } from "@margem/shared";
import { Button, Skeleton } from "@margem/ui";
import * as React from "react";
import {
  approvePractice,
  discardPractice,
  fetchSourceChunks,
  fetchSourcePractice,
  generatePractice,
  isAiUnavailable,
} from "../../lib/api";
import { buildHandoffPrompt } from "../../lib/prompt-handoff";
import { messages } from "../../messages/pt-br";
import { PromptHandoff } from "../ai/prompt-handoff";
import { unavailableText } from "./ai-unavailable";
import { PracticeCard } from "./practice-card";

const text = messages.studio.session;
const SESSION_KINDS = sessionKindSchema.options;

type Status = "loading" | "idle" | "generating";

interface SessionSetupProps {
  sources: StudioSourceDto[];
  onBuild: () => void;
  onGoToRead: () => void;
  onPracticeChanged: () => void;
}

function isSessionPending(item: PracticeItemDto): boolean {
  return item.status === "pending" && (SESSION_KINDS as readonly string[]).includes(item.kind);
}

export function SessionSetup({
  sources,
  onBuild,
  onGoToRead,
  onPracticeChanged,
}: SessionSetupProps) {
  const [status, setStatus] = React.useState<Status>("loading");
  const [pending, setPending] = React.useState<PracticeItemDto[]>([]);
  const [approved, setApproved] = React.useState(0);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [handoff, setHandoff] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setStatus("loading");
    setApproved(0);
    Promise.all(sources.map((source) => fetchSourcePractice(source.id)))
      .then((lists) => {
        if (active) setPending(lists.flat().filter(isSessionPending));
      })
      .catch(() => {
        if (active) setPending([]);
      })
      .finally(() => {
        if (active) setStatus("idle");
      });
    return () => {
      active = false;
    };
  }, [sources]);

  async function handleGenerate() {
    setStatus("generating");
    setError(null);
    setInfo(null);
    setHandoff(null);
    const created: PracticeItemDto[] = [];
    try {
      for (const source of sources) {
        created.push(...(await generatePractice(source.id, [...SESSION_KINDS])));
      }
      setPending(created.filter(isSessionPending));
      if (created.length === 0) setInfo(text.nothingGenerated);
    } catch (caught) {
      setError(unavailableText(caught));
      if (isAiUnavailable(caught)) void prepareHandoff();
    } finally {
      setStatus("idle");
    }
  }

  async function prepareHandoff() {
    const source = sources[0];
    if (!source) return;
    const chunks = await fetchSourceChunks(source.id)
      .then((result) => result.chunks.map((chunk) => chunk.text))
      .catch(() => []);
    setHandoff(
      buildHandoffPrompt({
        kind: "practice",
        practiceKind: "quiz",
        sourceTitle: source.title,
        source: chunks,
      }),
    );
  }

  async function handlePending(item: PracticeItemDto, action: "approve" | "discard") {
    setBusyId(item.id);
    setError(null);
    try {
      if (action === "approve") {
        await approvePractice(item.id);
        setApproved((count) => count + 1);
        onPracticeChanged();
      } else {
        await discardPractice(item.id);
      }
      setPending((items) => items.filter((current) => current.id !== item.id));
    } catch {
      setError(messages.studio.read.actionError);
    } finally {
      setBusyId(null);
    }
  }

  const titleById = new Map(sources.map((source) => [source.id, source.title]));

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-paper p-6 shadow-xs">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-serif text-xl font-semibold text-ink">{text.setupTitle}</h2>
        <p className="text-sm text-ink-muted">{text.setupIntro}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={pending.length > 0 || approved > 0 ? "secondary" : "primary"}
          loading={status === "generating"}
          disabled={status !== "idle"}
          onClick={() => void handleGenerate()}
        >
          {status === "generating" ? text.generating : text.generate}
        </Button>
        {approved > 0 ? (
          <Button type="button" onClick={onBuild}>
            {text.buildWithApproved(approved)}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onGoToRead}>
          {text.goToRead}
        </Button>
      </div>

      <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {info ? <p className="text-sm text-ink-muted">{info}</p> : null}
        {approved > 0 && pending.length === 0 ? (
          <p className="text-sm text-ink-muted">{text.allReviewed}</p>
        ) : null}
      </div>
      {handoff ? <PromptHandoff prompt={handoff} /> : null}

      {status === "loading" ? (
        <Skeleton className="h-24 w-full" />
      ) : pending.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-ink-muted">{text.pendingHint}</p>
          <ul className="grid gap-2.5 md:grid-cols-2">
            {pending.map((item) => (
              <li key={item.id} className="flex flex-col gap-1">
                <span className="text-[11px] text-ink-muted">{titleById.get(item.sourceId)}</span>
                <PracticeCard
                  item={item}
                  pending={{
                    busy: busyId === item.id,
                    disabled: busyId !== null && busyId !== item.id,
                    onApprove: () => void handlePending(item, "approve"),
                    onDiscard: () => void handlePending(item, "discard"),
                  }}
                  answer=""
                  revealed={false}
                  flipped={false}
                  result={undefined}
                  onAnswer={() => undefined}
                  onReveal={() => undefined}
                  onFlip={() => undefined}
                  onRate={() => undefined}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
