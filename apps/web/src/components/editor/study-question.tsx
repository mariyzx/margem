"use client";

import { cn } from "@margem/config/cn";
import type { GradedAnswerDto, QuestionDto } from "@margem/shared";
import { Button } from "@margem/ui";
import * as React from "react";
import { explainAnswer } from "../../lib/api";
import { messages } from "../../messages/pt-br";

const VERDICT_STYLE: Record<GradedAnswerDto["verdict"], string> = {
  right: "border-correct/50 text-correct",
  partial: "border-marker text-ink",
  wrong: "border-danger/50 text-danger",
};

export interface StudyQuestionProps {
  question: QuestionDto;
  answer: string;
  onAnswerChange: (value: string) => void;
  revealed: boolean;
  onReveal: () => void;
  graded?: GradedAnswerDto;
  result?: "correct" | "missed";
  onMarkResult: (result: "correct" | "missed") => void;
  locked: boolean;
}

export function StudyQuestion({
  question,
  answer,
  onAnswerChange,
  revealed,
  onReveal,
  graded,
  result,
  onMarkResult,
  locked,
}: StudyQuestionProps) {
  const answerId = React.useId();
  const [explanation, setExplanation] = React.useState<string | null>(null);
  const [explaining, setExplaining] = React.useState(false);
  const [explainError, setExplainError] = React.useState(false);

  const attempt = answer.trim();
  const missed = result === "missed" || (graded !== undefined && graded.verdict !== "right");
  const canExplain = revealed && missed && attempt.length > 0 && explanation === null;

  async function handleExplain() {
    setExplaining(true);
    setExplainError(false);
    try {
      setExplanation(await explainAnswer(question.id, attempt));
    } catch {
      setExplainError(true);
    } finally {
      setExplaining(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-margin-rule pt-2.5">
      {!revealed ? (
        <>
          <label htmlFor={answerId} className="text-xs font-medium text-ink-muted">
            {messages.study.yourAnswerLabel}
          </label>
          <textarea
            id={answerId}
            rows={2}
            value={answer}
            disabled={locked}
            maxLength={2000}
            placeholder={messages.study.yourAnswerPlaceholder}
            onChange={(event) => onAnswerChange(event.target.value)}
            className="w-full resize-y rounded-md border border-margin-rule bg-paper px-2.5 py-2 font-sans text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic disabled:opacity-50"
          />
          <Button type="button" variant="secondary" size="sm" disabled={locked} onClick={onReveal}>
            {messages.study.showAnswer}
          </Button>
        </>
      ) : (
        <div aria-live="polite" className="flex flex-col gap-2">
          {graded ? (
            <div className="flex flex-col gap-1.5">
              <span
                className={cn(
                  "self-start rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold",
                  VERDICT_STYLE[graded.verdict],
                )}
              >
                {messages.study.verdicts[graded.verdict]}
              </span>
              {graded.missing.length > 0 ? (
                <div className="text-xs text-ink">
                  <span className="font-medium">{messages.study.missingTitle}:</span>
                  <ul className="mt-0.5 list-disc pl-4 text-ink-muted">
                    {graded.missing.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {attempt ? (
            <p className="text-xs text-ink-muted">
              <span className="font-medium text-ink">{messages.study.yourAnswer}: </span>
              {attempt}
            </p>
          ) : null}
          <p className="text-sm text-ink-muted">
            {attempt ? (
              <span className="font-medium text-ink">{messages.study.expectedAnswer}: </span>
            ) : null}
            {question.answer}
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant={result === "correct" ? "primary" : "secondary"}
              onClick={() => onMarkResult("correct")}
            >
              {messages.study.gotIt}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={result === "missed" ? "primary" : "ghost"}
              onClick={() => onMarkResult("missed")}
            >
              {messages.study.missed}
            </Button>
          </div>

          {canExplain ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              loading={explaining}
              onClick={() => void handleExplain()}
              className="self-start"
            >
              {explaining ? messages.study.explaining : messages.study.explain}
            </Button>
          ) : null}
          {explainError ? (
            <p className="text-xs text-danger">{messages.study.explainError}</p>
          ) : null}
          {explanation ? (
            <div className="rounded-md border border-bic/30 bg-margin p-2.5">
              <p className="mb-1 text-[11px] font-semibold text-bic">
                {messages.study.explanationTitle}
              </p>
              <p className="text-sm leading-relaxed whitespace-pre-line text-ink">{explanation}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
