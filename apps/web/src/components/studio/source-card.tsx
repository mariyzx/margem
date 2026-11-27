import { cn } from "@margem/config/cn";
import type { PracticeKind, StudioSourceDto } from "@margem/shared";
import { Button } from "@margem/ui";
import { messages } from "../../messages/pt-br";
import { type MasteryLevel, masteryLevel } from "./studio-rules";

const text = messages.studio;

const BAR_COLOR: Record<MasteryLevel, string> = {
  none: "bg-margin-rule",
  weak: "bg-marker",
  growing: "bg-bic",
  strong: "bg-correct",
};

const VALUE_COLOR: Record<MasteryLevel, string> = {
  none: "text-ink-muted",
  weak: "text-ink",
  growing: "text-bic",
  strong: "text-correct",
};

const DECK_COLOR: Record<PracticeKind, string> = {
  quiz: "bg-bic",
  flashcard: "bg-turma",
  cloze: "bg-marker",
  why: "bg-correct",
};

const addedFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });

interface SourceCardProps {
  source: StudioSourceDto;
  onPractice: () => void;
  onOpenMaterial: () => void;
}

export function SourceCard({ source, onPractice, onOpenMaterial }: SourceCardProps) {
  const level = masteryLevel(source.mastery);
  const ready = source.status === "ready";
  const titleId = `studio-source-${source.id}`;

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col overflow-hidden rounded-lg bg-paper shadow-xs transition-[transform,box-shadow] duration-base ease-margem-out hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div
        aria-hidden="true"
        className="relative flex h-24 flex-col gap-2 overflow-hidden border-b border-margin-rule bg-margin px-5 py-4"
      >
        <span className="absolute inset-y-0 left-0 w-1 bg-margin-rule" />
        <span className="h-2 w-[70%] rounded-full bg-margin-rule" />
        <span className="h-2 w-[92%] rounded-full bg-ground" />
        <span
          className={cn("h-2 w-[40%] rounded-full", level === "weak" ? "bg-marker" : "bg-ground")}
        />
        <span className="h-2 w-[84%] rounded-full bg-ground" />
        <span className="absolute top-3 right-3 rounded-sm bg-paper px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
          {text.sourceType[source.type]}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-5 pt-4 pb-5">
        <div className="flex flex-col gap-0.5">
          <h2 id={titleId} className="font-serif text-xl leading-snug font-semibold text-ink">
            {source.title}
          </h2>
          <p className="text-xs text-ink-muted">
            {text.sourceType[source.type]},{" "}
            {text.added(addedFormat.format(new Date(source.createdAt)))}
          </p>
        </div>

        {ready ? (
          <>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-ink-muted">{text.mastery}</span>
                <span className={cn("font-semibold", VALUE_COLOR[level])}>
                  {source.mastery === null ? text.noMastery : `${source.mastery}%`}
                </span>
              </div>
              <span
                aria-hidden="true"
                className="block h-1.5 overflow-hidden rounded-full bg-ground"
              >
                <span
                  className={cn("block h-full rounded-full", BAR_COLOR[level])}
                  style={{ width: `${source.mastery ?? 0}%` }}
                />
              </span>
            </div>

            <ul
              className="flex flex-wrap gap-x-4 gap-y-2"
              aria-label={text.decksLabel(source.title)}
            >
              {source.decks.length === 0 ? (
                <li>
                  <DeckButton
                    color="bg-margin-rule"
                    label={text.generatePractice}
                    detail={text.nothingYet}
                    onClick={onOpenMaterial}
                  />
                </li>
              ) : (
                source.decks.map((deck) => (
                  <li key={deck.kind}>
                    <DeckButton
                      color={DECK_COLOR[deck.kind]}
                      label={text.decks[deck.kind].label}
                      detail={text.decks[deck.kind].unit(deck.count)}
                      onClick={onOpenMaterial}
                    />
                  </li>
                ))
              )}
            </ul>
          </>
        ) : (
          <p className="text-sm text-ink-muted" role="status">
            {source.status === "failed" ? text.failed : text.processing}
          </p>
        )}

        <div className="mt-auto flex gap-2 border-t border-ground pt-3">
          <Button type="button" size="sm" onClick={onPractice} disabled={!ready}>
            {text.practice}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onOpenMaterial}
            disabled={!ready}
          >
            {text.openMaterial}
          </Button>
        </div>
      </div>
    </article>
  );
}

interface DeckButtonProps {
  color: string;
  label: string;
  detail: string;
  onClick: () => void;
}

function DeckButton({ color, label, detail, onClick }: DeckButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-2.5 rounded-md text-left text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic"
    >
      <span aria-hidden="true" className="relative h-6 w-8 flex-none">
        <span className="absolute inset-0 translate-x-0.5 -translate-y-0.5 rounded-sm border border-margin-rule bg-paper" />
        <span
          className={cn(
            "absolute inset-0 rounded-sm opacity-90 transition-transform duration-base ease-margem-out group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:rotate-3 motion-reduce:transition-none",
            color,
          )}
        />
      </span>
      <span className="flex flex-col">
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="text-[11px] text-ink-muted">{detail}</span>
      </span>
    </button>
  );
}
