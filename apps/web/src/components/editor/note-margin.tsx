"use client";

import { cn } from "@margem/config/cn";
import type { CreateQuestionInput, QuestionDto } from "@margem/shared";
import { Button, Field } from "@margem/ui";
import { Trash2 } from "lucide-react";
import * as React from "react";
import { messages } from "../../messages/pt-br";
import type { QuestionAnchorDraft } from "./selection-toolbar";

interface NoteMarginProps {
  questions: QuestionDto[];
  draft: QuestionAnchorDraft | null;
  onCancelDraft: () => void;
  onCreateQuestion: (input: CreateQuestionInput) => Promise<void>;
  onDeleteQuestion: (questionId: string) => Promise<void>;
  onHighlightBlock: (blockId: string) => void;
}

export function NoteMargin({
  questions,
  draft,
  onCancelDraft,
  onCreateQuestion,
  onDeleteQuestion,
  onHighlightBlock,
}: NoteMarginProps) {
  const [text, setText] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setText("");
    setAnswer("");
    setError(undefined);
  }, [draft]);

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
    } catch {
      setError(messages.margin.saveError);
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
                <button
                  type="button"
                  aria-label={messages.margin.deleteAriaLabel}
                  onClick={() => void onDeleteQuestion(question.id)}
                  className="rounded-sm p-1 text-ink-muted opacity-70 transition-opacity duration-fast hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
