"use client";

import type { AiUnavailableReason, QuestionDto } from "@margem/shared";
import { Button } from "@margem/ui";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import {
  ApiError,
  approveQuestion,
  discardQuestion,
  isAiUnavailable,
  suggestQuestions,
} from "../../lib/api";
import { buildHandoffPrompt } from "../../lib/prompt-handoff";
import { PromptHandoff } from "../ai/prompt-handoff";
import { createErrorMessage } from "../../lib/errors";
import { messages } from "../../messages/pt-br";

const SETTINGS_REASONS: AiUnavailableReason[] = ["disabled", "feature_disabled"];

interface ClozeSuggestion {
  blockId: string;
  quote: string;
}

interface AiReviewPanelProps {
  noteId: string;
  pendingQuestions: QuestionDto[];
  onPendingReplaced: (pending: QuestionDto[]) => void;
  onQuestionApproved: (question: QuestionDto) => void;
  onQuestionDiscarded: (questionId: string) => void;
  onApplyCloze: (blockId: string, quote: string) => boolean;
  onHighlightBlock: (blockId: string) => void;
  getNoteText: () => string[];
}

type Feedback = { tone: "info" | "error"; text: string; settingsLink?: boolean } | null;

export function AiReviewPanel({
  noteId,
  pendingQuestions,
  onPendingReplaced,
  onQuestionApproved,
  onQuestionDiscarded,
  onApplyCloze,
  onHighlightBlock,
  getNoteText,
}: AiReviewPanelProps) {
  const [clozes, setClozes] = React.useState<ClozeSuggestion[]>([]);
  const [suggesting, setSuggesting] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [asked, setAsked] = React.useState(false);
  const [handoff, setHandoff] = React.useState<string | null>(null);

  React.useEffect(() => {
    setClozes([]);
    setFeedback(null);
    setAsked(false);
    setHandoff(null);
  }, [noteId]);

  async function handleSuggest() {
    setSuggesting(true);
    setFeedback(null);
    setHandoff(null);
    try {
      const result = await suggestQuestions(noteId);
      setClozes(result.clozes);
      onPendingReplaced(result.questions);
      setAsked(true);
      if (result.clozes.length === 0 && result.questions.length === 0) {
        setFeedback({ tone: "info", text: messages.aiReview.nothingFound });
      }
    } catch (error) {
      setFeedback(unavailableFeedback(error));
      if (isAiUnavailable(error)) {
        setHandoff(buildHandoffPrompt({ kind: "suggest", note: getNoteText() }));
      }
    } finally {
      setSuggesting(false);
    }
  }

  function handleApproveCloze(cloze: ClozeSuggestion) {
    const applied = onApplyCloze(cloze.blockId, cloze.quote);
    setClozes((prev) => prev.filter((item) => item !== cloze));
    setFeedback({
      tone: applied ? "info" : "error",
      text: applied ? messages.aiReview.clozeApplied : messages.aiReview.clozeMissing,
    });
  }

  async function handleQuestion(question: QuestionDto, action: "approve" | "discard") {
    setBusyId(question.id);
    setFeedback(null);
    try {
      if (action === "approve") {
        onQuestionApproved(await approveQuestion(question.id));
        setFeedback({ tone: "info", text: messages.aiReview.questionApproved });
      } else {
        await discardQuestion(question.id);
        onQuestionDiscarded(question.id);
      }
    } catch {
      setFeedback({ tone: "error", text: messages.aiReview.actionError });
    } finally {
      setBusyId(null);
    }
  }

  const hasSuggestions = clozes.length > 0 || pendingQuestions.length > 0;

  return (
    <section
      aria-labelledby="ai-review-title"
      className="flex flex-col gap-3 rounded-md border border-bic/30 bg-paper p-3 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="ai-review-title" className="shrink-0 text-xs font-semibold text-bic">
          {messages.aiReview.title}
        </h3>
        <Button
          type="button"
          size="sm"
          variant={hasSuggestions ? "ghost" : "secondary"}
          loading={suggesting}
          onClick={() => void handleSuggest()}
        >
          {suggesting ? null : (
            <Sparkles className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          )}
          {suggesting
            ? messages.aiReview.suggesting
            : asked || hasSuggestions
              ? messages.aiReview.suggestAgain
              : messages.aiReview.suggest}
        </Button>
      </div>

      {!hasSuggestions && !feedback ? (
        <p className="text-xs leading-relaxed text-ink-muted">{messages.aiReview.intro}</p>
      ) : null}

      <div aria-live="polite" className="empty:hidden">
        {feedback ? (
          <p
            className={feedback.tone === "error" ? "text-xs text-danger" : "text-xs text-ink-muted"}
          >
            {feedback.text}{" "}
            {feedback.settingsLink ? (
              <Link
                href="/configuracoes/ia"
                className="font-medium text-bic underline-offset-4 hover:underline"
              >
                {messages.aiReview.openSettings}
              </Link>
            ) : null}
          </p>
        ) : null}
      </div>
      {handoff ? <PromptHandoff prompt={handoff} /> : null}

      {hasSuggestions ? (
        <ul className="flex flex-col gap-2">
          {clozes.map((cloze) => (
            <li
              key={`${cloze.blockId}:${cloze.quote}`}
              className="flex flex-col gap-2 rounded-md border border-dashed border-marker bg-marker-soft/30 p-2.5"
            >
              <span className="text-[11px] font-medium text-ink-muted">
                {messages.aiReview.clozeLabel}
              </span>
              <button
                type="button"
                onClick={() => onHighlightBlock(cloze.blockId)}
                className="text-left font-serif text-sm text-ink hover:underline"
              >
                “{cloze.quote}”
              </button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  aria-label={messages.aiReview.approveClozeAria(cloze.quote)}
                  onClick={() => handleApproveCloze(cloze)}
                >
                  {messages.aiReview.approve}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={messages.aiReview.discardClozeAria(cloze.quote)}
                  onClick={() => setClozes((prev) => prev.filter((item) => item !== cloze))}
                >
                  {messages.aiReview.discard}
                </Button>
              </div>
            </li>
          ))}

          {pendingQuestions.map((question) => (
            <li
              key={question.id}
              className="flex flex-col gap-2 rounded-md border border-dashed border-bic/50 p-2.5"
            >
              <span className="text-[11px] font-medium text-ink-muted">
                {messages.aiReview.questionLabel}
              </span>
              {question.anchor ? (
                <button
                  type="button"
                  onClick={() => question.anchor && onHighlightBlock(question.anchor.blockId)}
                  className="border-l-2 border-bic pl-2 text-left font-serif text-xs text-ink-muted italic hover:text-ink"
                >
                  “{question.anchor.quote}”
                </button>
              ) : null}
              <p className="text-sm font-medium text-ink">{question.text}</p>
              <p className="text-xs text-ink-muted">{question.answer}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  loading={busyId === question.id}
                  disabled={busyId !== null && busyId !== question.id}
                  aria-label={messages.aiReview.approveQuestionAria(question.text)}
                  onClick={() => void handleQuestion(question, "approve")}
                >
                  {messages.aiReview.approve}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busyId !== null}
                  aria-label={messages.aiReview.discardQuestionAria(question.text)}
                  onClick={() => void handleQuestion(question, "discard")}
                >
                  {messages.aiReview.discard}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function unavailableFeedback(error: unknown): Feedback {
  const reason = error instanceof ApiError ? error.aiUnavailable : undefined;
  if (!reason) {
    return { tone: "error", text: createErrorMessage(error, messages.aiReview.genericError) };
  }
  return {
    tone: "error",
    text: messages.aiReview.unavailable[reason],
    settingsLink: SETTINGS_REASONS.includes(reason),
  };
}
