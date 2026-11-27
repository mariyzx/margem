"use client";

import { cn } from "@margem/config/cn";
import type { CreateQuestionInput, GradedAnswerDto, QuestionDto } from "@margem/shared";
import { Button, Field } from "@margem/ui";
import { Trash2 } from "lucide-react";
import * as React from "react";
import { gradeAnswers, isAiUnavailable } from "../../lib/api";
import { createErrorMessage } from "../../lib/errors";
import { buildHandoffPrompt } from "../../lib/prompt-handoff";
import { messages } from "../../messages/pt-br";
import { PromptHandoff } from "../ai/prompt-handoff";
import type { QuestionAnchorDraft } from "./selection-toolbar";
import { StudyQuestion } from "./study-question";

interface NoteMarginProps {
  mode?: "write" | "study";
  questions: QuestionDto[];
  draft: QuestionAnchorDraft | null;
  studyResults?: Record<string, "correct" | "missed">;
  onMarkStudyResult?: (questionId: string, result: "correct" | "missed") => void;
  onCancelDraft: () => void;
  onCreateQuestion: (input: CreateQuestionInput) => Promise<void>;
  onDeleteQuestion: (questionId: string) => Promise<void>;
  onHighlightBlock: (blockId: string) => void;
  aiReview?: React.ReactNode;
}

export function NoteMargin({
  mode = "write",
  questions,
  draft,
  studyResults = {},
  onMarkStudyResult,
  onCancelDraft,
  onCreateQuestion,
  onDeleteQuestion,
  onHighlightBlock,
  aiReview,
}: NoteMarginProps) {
  const [text, setText] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();
  const [saving, setSaving] = React.useState(false);
  const [revealedIds, setRevealedIds] = React.useState<Record<string, boolean>>({});
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [graded, setGraded] = React.useState<Record<string, GradedAnswerDto>>({});
  const [grading, setGrading] = React.useState(false);
  const [gradeError, setGradeError] = React.useState(false);
  const [gradeHandoff, setGradeHandoff] = React.useState<string | null>(null);

  const toGrade = questions.filter(
    (question) => !revealedIds[question.id] && (answers[question.id] ?? "").trim().length > 0,
  );

  async function handleGradeAll() {
    if (toGrade.length === 0) return;
    setGrading(true);
    setGradeError(false);
    setGradeHandoff(null);
    try {
      const results = await gradeAnswers(
        toGrade.map((question) => ({
          questionId: question.id,
          answer: (answers[question.id] ?? "").trim(),
        })),
      );
      setGraded((prev) => ({
        ...prev,
        ...Object.fromEntries(results.map((result) => [result.questionId, result])),
      }));
      setRevealedIds((prev) => ({
        ...prev,
        ...Object.fromEntries(results.map((result) => [result.questionId, true])),
      }));
    } catch (error) {
      setGradeError(true);
      if (isAiUnavailable(error)) {
        setGradeHandoff(
          buildHandoffPrompt({
            kind: "grade",
            items: toGrade.map((question) => ({
              question: question.text,
              expected: question.answer,
              answer: (answers[question.id] ?? "").trim(),
            })),
          }),
        );
      }
    } finally {
      setGrading(false);
    }
  }

  React.useEffect(() => {
    setText("");
    setAnswer("");
    setError(undefined);
  }, [draft]);

  React.useEffect(() => {
    setRevealedIds({});
    setAnswers({});
    setGraded({});
    setGradeError(false);
    setGradeHandoff(null);
  }, [mode]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!text.trim() || !answer.trim()) {
      setError("Preencha a pergunta e a resposta.");
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      await onCreateQuestion({
        text: text.trim(),
        answer: answer.trim(),
        anchor: draft,
      });
      setText("");
      setAnswer("");
    } catch (error) {
      setError(createErrorMessage(error, messages.margin.saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside
      aria-label={messages.margin.title}
      className="flex flex-col gap-4 rounded-lg border border-margin-rule bg-margin p-4"
    >
      <h2 className="text-xs font-medium tracking-wide text-ink-muted uppercase">
        {messages.margin.title}
      </h2>

      {mode === "write" ? aiReview : null}

      {mode === "study" && questions.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={grading}
            disabled={toGrade.length === 0}
            onClick={() => void handleGradeAll()}
          >
            {grading ? messages.study.grading : messages.study.gradeAll(toGrade.length)}
          </Button>
          <p
            aria-live="polite"
            className={gradeError ? "text-xs text-danger" : "text-xs text-ink-muted"}
          >
            {gradeError
              ? messages.study.gradeError
              : toGrade.length === 0
                ? messages.study.gradeHint
                : null}
          </p>
          {gradeHandoff ? <PromptHandoff prompt={gradeHandoff} /> : null}
        </div>
      ) : null}

      {draft ? (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-md border border-bic/40 bg-paper p-3 shadow-xs"
          noValidate
        >
          <blockquote className="border-l-2 border-bic pl-2.5 font-serif text-xs text-ink-muted italic">
            “{draft.quote}”
          </blockquote>

          <Field
            label={messages.margin.questionLabel}
            placeholder={messages.margin.questionPlaceholder}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(undefined);
            }}
            autoFocus
          />

          <Field
            label={messages.margin.answerLabel}
            placeholder={messages.margin.answerPlaceholder}
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value);
              if (error) setError(undefined);
            }}
            error={error}
          />

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" loading={saving}>
              {saving ? messages.margin.savingButton : messages.margin.saveButton}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onCancelDraft}>
              {messages.margin.cancelButton}
            </Button>
          </div>
        </form>
      ) : null}

      {questions.length === 0 && !draft ? (
        <p className="text-xs leading-relaxed text-ink-muted">{messages.margin.empty}</p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {questions.map((question) => {
          const isOrphaned = question.anchor?.status === "orphaned";
          const blockId = question.anchor?.blockId;
          return (
            <li
              key={question.id}
              className="group rounded-md border border-margin-rule bg-paper p-3 shadow-xs"
            >
              {question.anchor ? (
                <div className="mb-2 flex items-start justify-between gap-2">
                  <button
                    type="button"
                    disabled={isOrphaned || !blockId}
                    onClick={() => {
                      if (blockId && !isOrphaned) onHighlightBlock(blockId);
                    }}
                    className={cn(
                      "border-l-2 pl-2 text-left font-serif text-xs italic transition-colors duration-fast",
                      isOrphaned
                        ? "cursor-default border-margin-rule text-ink-muted/70"
                        : "border-bic text-ink-muted hover:text-ink",
                    )}
                  >
                    “{question.anchor.quote}”
                  </button>

                  {isOrphaned ? (
                    <span className="shrink-0 rounded-sm bg-margin px-1.5 py-0.5 text-[11px] text-ink-muted">
                      {messages.margin.orphanedBadge}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-ink">{question.text}</p>
                {mode === "write" ? (
                  <button
                    type="button"
                    aria-label={messages.margin.deleteAriaLabel}
                    onClick={() => void onDeleteQuestion(question.id)}
                    className="rounded-sm p-1 text-ink-muted opacity-70 transition-opacity duration-fast hover:text-danger group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                ) : null}
              </div>

              {mode === "study" ? (
                <StudyQuestion
                  question={question}
                  answer={answers[question.id] ?? ""}
                  onAnswerChange={(value) =>
                    setAnswers((prev) => ({ ...prev, [question.id]: value }))
                  }
                  revealed={Boolean(revealedIds[question.id])}
                  onReveal={() => setRevealedIds((prev) => ({ ...prev, [question.id]: true }))}
                  graded={graded[question.id]}
                  result={studyResults[question.id]}
                  onMarkResult={(result) => onMarkStudyResult?.(question.id, result)}
                  locked={grading}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
