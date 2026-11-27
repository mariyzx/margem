"use client";

import type { AskCitationDto, AskNotebookResultDto } from "@margem/shared";
import { MAX_ASK_QUESTION_CHARS } from "@margem/shared";
import { Button } from "@margem/ui";
import * as React from "react";
import { askNotebook } from "../../lib/api";
import { messages } from "../../messages/pt-br";
import type { ReadEvent } from "./read-state";
import { unavailableText } from "./ai-unavailable";

const text = messages.studio.read;

interface AskNotebookProps {
  notebookId: string;
  question: string;
  asked: AskNotebookResultDto | null;
  showAnswerHere: boolean;
  dispatch: (event: ReadEvent) => void;
}

export function AskNotebook({
  notebookId,
  question,
  asked,
  showAnswerHere,
  dispatch,
}: AskNotebookProps) {
  const inputId = React.useId();
  const hintId = React.useId();
  const [asking, setAsking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const trimmed = question.trim();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed.length < 3 || asking) return;
    setAsking(true);
    setError(null);
    try {
      dispatch({ type: "answered", result: await askNotebook(notebookId, { question: trimmed }) });
    } catch (caught) {
      setError(unavailableText(caught));
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-margin-rule px-6 py-5">
      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-semibold text-ink">
          {text.askLabel}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            value={question}
            maxLength={MAX_ASK_QUESTION_CHARS}
            onChange={(event) => dispatch({ type: "typeQuestion", value: event.target.value })}
            placeholder={text.askPlaceholder}
            aria-describedby={hintId}
            className="h-10 w-full min-w-0 rounded-md sm:flex-1 border border-margin-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-muted/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic"
          />
          <Button type="submit" loading={asking} disabled={trimmed.length < 3}>
            {asking ? text.asking : text.askButton}
          </Button>
        </div>
        <p id={hintId} className="text-xs text-ink-muted">
          {text.askHint}
        </p>
      </form>
      <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {asked && showAnswerHere ? <AskAnswer asked={asked} /> : null}
      </div>
    </div>
  );
}

export function AskAnswer({ asked }: { asked: AskNotebookResultDto }) {
  if (!asked.found || !asked.answer) {
    return (
      <p className="rounded-md border border-margin-rule bg-paper p-3 text-sm text-ink-muted">
        {text.notFound}
      </p>
    );
  }
  return (
    <section
      aria-label={text.answerTitle}
      className="flex flex-col gap-2 rounded-md border border-bic/40 bg-paper p-3"
    >
      <span className="text-[11px] font-semibold text-bic">{text.answerTitle}</span>
      <p className="text-sm leading-relaxed text-ink">{asked.answer}</p>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-ink-muted">{text.answerFrom}</span>
        <ul className="flex flex-col gap-1.5">
          {asked.citations.map((citation) => (
            <li key={`${citation.kind}:${citation.id}`} className="text-xs text-ink-muted">
              <span className="font-medium text-ink">{citationTitle(citation)}</span>
              <span className="mt-0.5 block border-l-2 border-margin-rule pl-2 font-serif italic">
                “{citation.excerpt}”
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function citationTitle(citation: AskCitationDto): string {
  if (citation.kind === "note") return text.noteCitation(citation.title);
  const page = citation.page === null ? "" : `, p. ${citation.page}`;
  return `${citation.title}${page}`;
}
