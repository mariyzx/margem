"use client";

import { cn } from "@margem/config/cn";
import type { PracticeItemDto } from "@margem/shared";
import { Button } from "@margem/ui";
import * as React from "react";
import { messages } from "../../messages/pt-br";
import type { PracticeResult } from "./read-state";

const text = messages.studio.read;

interface PendingActions {
  busy: boolean;
  disabled: boolean;
  onApprove: () => void;
  onDiscard: () => void;
}

interface PracticeCardProps {
  item: PracticeItemDto;
  pending: PendingActions;
  answer: string;
  revealed: boolean;
  flipped: boolean;
  result: PracticeResult | undefined;
  onAnswer: (value: string) => void;
  onReveal: () => void;
  onFlip: () => void;
  onRate: (result: PracticeResult) => void;
}

export function PracticeCard(props: PracticeCardProps) {
  if (props.item.status === "pending") return <PendingCard item={props.item} {...props.pending} />;
  if (props.item.kind === "flashcard") return <Flashcard {...props} />;
  return <WrittenPractice {...props} />;
}

function PendingCard({
  item,
  busy,
  disabled,
  onApprove,
  onDiscard,
}: PendingActions & {
  item: PracticeItemDto;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-bic/50 bg-paper p-3">
      <span className="text-[11px] font-medium text-ink-muted">
        {text.suggestion} · {text.kinds[item.kind].label}
      </span>
      <p className="text-sm font-medium text-ink">{item.prompt}</p>
      <p className="text-xs text-ink-muted">
        <span className="font-medium">{text.expected}: </span>
        {item.answer}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          loading={busy}
          disabled={disabled}
          aria-label={text.approveAria(item.prompt)}
          onClick={onApprove}
        >
          {text.approve}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || busy}
          aria-label={text.discardAria(item.prompt)}
          onClick={onDiscard}
        >
          {text.discard}
        </Button>
      </div>
    </div>
  );
}

function Flashcard({ item, flipped, onFlip }: PracticeCardProps) {
  return (
    <button
      type="button"
      onClick={onFlip}
      aria-pressed={flipped}
      className={cn(
        "flex min-h-24 w-full flex-col gap-1.5 rounded-md border border-margin-rule p-3 text-left transition-colors duration-base ease-margem-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic",
        flipped ? "bg-margin" : "bg-paper hover:bg-margin",
      )}
    >
      <span className="text-[11px] font-medium text-ink-muted">
        {flipped ? text.cardBack : text.cardFront}
      </span>
      <span className="text-sm text-ink">{flipped ? item.answer : item.prompt}</span>
    </button>
  );
}

function WrittenPractice({
  item,
  answer,
  revealed,
  result,
  onAnswer,
  onReveal,
  onRate,
}: PracticeCardProps) {
  const answerId = React.useId();
  const attempt = answer.trim();

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-margin-rule bg-paper p-3">
      <span className="text-[11px] font-medium text-ink-muted">{text.kinds[item.kind].label}</span>
      <p className="text-sm font-medium text-ink">{item.prompt}</p>

      {!revealed ? (
        <>
          <label htmlFor={answerId} className="text-xs text-ink-muted">
            {text.yourAnswer}
          </label>
          <textarea
            id={answerId}
            value={answer}
            onChange={(event) => onAnswer(event.target.value)}
            rows={3}
            placeholder={text.yourAnswerPlaceholder}
            className="w-full resize-y rounded-md border border-margin-rule bg-paper px-2.5 py-2 text-sm text-ink placeholder:text-ink-muted/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic"
          />
          <Button type="button" size="sm" variant="secondary" onClick={onReveal}>
            {text.showAnswer}
          </Button>
        </>
      ) : (
        <>
          {attempt ? (
            <p className="text-xs text-ink-muted">
              <span className="font-medium text-ink">{messages.study.yourAnswer}: </span>
              {attempt}
            </p>
          ) : null}
          <p className="text-xs text-ink-muted">
            <span className="font-medium text-ink">{text.expected}: </span>
            {item.answer}
          </p>
          {result ? (
            <p
              role="status"
              className={cn("text-xs", result === "right" ? "text-correct" : "text-ink-muted")}
            >
              {result === "right" ? text.resultRight : text.resultWrong}
            </p>
          ) : (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => onRate("right")}>
                {text.gotIt}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => onRate("wrong")}>
                {text.missed}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
