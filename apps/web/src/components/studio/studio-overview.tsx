import type { PracticeKind, StudioSourceDto } from "@margem/shared";
import { Button } from "@margem/ui";
import { messages } from "../../messages/pt-br";
import { SourceCard } from "./source-card";
import type { SessionMinutes } from "./studio-state";
import { weakestSource } from "./studio-rules";

const text = messages.studio;

interface StudioOverviewProps {
  sources: StudioSourceDto[];
  onPractice: (sourceIds: string[], minutes?: SessionMinutes) => void;
  onOpenMaterial: (sourceId: string, kind?: PracticeKind) => void;
}

export function StudioOverview({ sources, onPractice, onOpenMaterial }: StudioOverviewProps) {
  const weakest = weakestSource(sources);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-3xl leading-tight font-semibold text-ink md:text-4xl">
            {text.overviewTitle}
          </h1>
          {sources.length > 0 ? (
            <p className="text-[15px] text-ink-muted">{text.overviewSubtitle(sources.length)}</p>
          ) : null}
        </div>
        {weakest ? (
          <Button type="button" onClick={() => onPractice([weakest.id], 20)}>
            {text.studyWeakest}
          </Button>
        ) : null}
      </div>

      {sources.length === 0 ? (
        <div className="rounded-lg bg-paper p-8 shadow-xs">
          <h2 className="font-serif text-xl font-semibold text-ink">{text.emptyTitle}</h2>
          <p className="mt-2 max-w-prose text-sm text-ink-muted">{text.emptyDescription}</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(17.5rem,1fr))] gap-5">
          {sources.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              onPractice={() => onPractice([source.id])}
              onOpenMaterial={(kind) => onOpenMaterial(source.id, kind)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
