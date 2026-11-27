"use client";

import { cn } from "@margem/config/cn";
import {
  type ReviewRating,
  SESSION_MINUTES,
  type SessionActivityDto,
  type StudioSourceDto,
} from "@margem/shared";
import { Button, Skeleton } from "@margem/ui";
import { Check } from "lucide-react";
import * as React from "react";
import { buildStudioSession, submitReview } from "../../lib/api";
import { messages } from "../../messages/pt-br";
import { splitBlanks } from "./read-rules";
import {
  currentActivity,
  kindCounts,
  outcomeCounts,
  planKey,
  remainingMinutes,
  type SessionEvent,
  type SessionState,
  sessionStarted,
} from "./session-state";

const text = messages.studio.session;
const RATINGS: ReviewRating[] = ["again", "hard", "easy"];

const KIND_TAG: Record<SessionActivityDto["kind"], string> = {
  cloze: "bg-marker-soft text-ink",
  quiz: "bg-bic/10 text-bic",
  why: "bg-correct/10 text-correct",
};

type BuildStatus = "idle" | "loading" | "error";

interface SessionModeProps {
  notebookId: string;
  sources: StudioSourceDto[];
  state: SessionState;
  dispatch: (event: SessionEvent) => void;
  onGoToRead: () => void;
  onRated: () => void;
}

export function SessionMode({
  notebookId,
  sources,
  state,
  dispatch,
  onGoToRead,
  onRated,
}: SessionModeProps) {
  const ready = React.useMemo(
    () => sources.filter((source) => source.status === "ready"),
    [sources],
  );
  const chosen = React.useMemo(() => {
    const readyIds = new Set(ready.map((source) => source.id));
    return state.sourceIds.filter((id) => readyIds.has(id));
  }, [ready, state.sourceIds]);
  const key = planKey(chosen, state.minutes);
  const stale = state.plan?.key !== key;
  const [status, setStatus] = React.useState<BuildStatus>("idle");
  const requestRef = React.useRef(0);

  const build = React.useCallback(async () => {
    const requestId = ++requestRef.current;
    setStatus("loading");
    try {
      const session = await buildStudioSession(notebookId, {
        sourceIds: chosen,
        minutes: state.minutes,
      });
      if (requestRef.current !== requestId) return;
      dispatch({ type: "planned", plan: { key, activities: session.activities } });
      setStatus("idle");
    } catch {
      if (requestRef.current === requestId) setStatus("error");
    }
  }, [notebookId, chosen, state.minutes, key, dispatch]);

  const started = sessionStarted(state);
  React.useEffect(() => {
    if (chosen.length > 0 && stale && !started && status === "idle") void build();
  }, [chosen.length, stale, started, status, build]);

  React.useEffect(
    () => () => {
      requestRef.current++;
    },
    [],
  );

  if (ready.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-lg bg-paper p-8 text-sm text-ink-muted shadow-xs">
        {text.noSources}
      </div>
    );
  }

  const activities = state.plan?.activities ?? [];

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-5 self-start rounded-lg bg-paper p-5 shadow-xs max-lg:order-last">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-2xl leading-tight font-semibold text-ink">{text.title}</h1>
          <p className="text-sm leading-relaxed text-ink-muted">{text.intro}</p>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-semibold text-ink-muted">
            {text.sourcesLabel}
          </legend>
          {ready.map((source) => (
            <label
              key={source.id}
              className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm text-ink hover:bg-margin has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-bic"
            >
              <input
                type="checkbox"
                checked={state.sourceIds.includes(source.id)}
                onChange={() => dispatch({ type: "toggleSource", sourceId: source.id })}
                className="size-4 accent-bic"
              />
              {source.title}
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-semibold text-ink-muted">
            {text.minutesLabel}
          </legend>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-ground p-1">
            {SESSION_MINUTES.map((minutes) => (
              <label
                key={minutes}
                className="flex min-h-10 cursor-pointer items-center justify-center rounded-md text-sm font-medium text-ink-muted transition-colors duration-fast has-[:checked]:bg-paper has-[:checked]:text-ink has-[:checked]:shadow-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-bic"
              >
                <input
                  type="radio"
                  name="studio-session-minutes"
                  checked={state.minutes === minutes}
                  onChange={() => dispatch({ type: "pickMinutes", minutes })}
                  className="sr-only"
                />
                {text.minutes(minutes)}
              </label>
            ))}
          </div>
        </fieldset>

        {stale && started ? (
          <div className="flex flex-col gap-1.5">
            <Button type="button" variant="secondary" size="sm" onClick={() => void build()}>
              {text.restart}
            </Button>
            <span className="text-xs text-ink-muted">{text.restartHint}</span>
          </div>
        ) : null}

        {activities.length > 0 ? (
          <>
            <div className="flex flex-col gap-1 rounded-md bg-margin p-3">
              <span className="text-xs font-semibold text-ink-muted">{text.mixTitle}</span>
              <span className="text-sm text-ink">{text.mix(kindCounts(activities))}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-muted">{text.planTitle}</span>
              <ol className="flex flex-col gap-1">
                {activities.map((activity, index) => (
                  <PlanStep
                    key={activity.reviewItemId}
                    activity={activity}
                    done={index < state.index}
                    current={index === state.index}
                  />
                ))}
              </ol>
            </div>
          </>
        ) : null}
      </aside>

      <main className="flex min-w-0 flex-col gap-4">
        {chosen.length === 0 ? (
          <Panel>{text.chooseSources}</Panel>
        ) : status === "loading" ? (
          <div className="flex flex-col gap-4" aria-busy="true">
            <span className="sr-only">{text.building}</span>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : status === "error" ? (
          <Panel>
            <p>{text.buildError}</p>
            <Button type="button" size="sm" onClick={() => void build()}>
              {messages.studio.retry}
            </Button>
          </Panel>
        ) : stale && !started ? null : activities.length === 0 ? (
          <Panel>
            <p>{text.empty}</p>
            <Button type="button" size="sm" onClick={onGoToRead}>
              {text.goToRead}
            </Button>
          </Panel>
        ) : state.index >= activities.length ? (
          <Panel>
            <h2 className="font-serif text-2xl font-semibold text-ink">{text.doneTitle}</h2>
            <p className="text-sm text-ink">{text.doneSummary(outcomeCounts(state.outcomes))}</p>
            <p>{text.doneHint}</p>
            <Button type="button" size="sm" onClick={() => void build()}>
              {text.again}
            </Button>
          </Panel>
        ) : (
          <ActivityView state={state} dispatch={dispatch} onRated={onRated} />
        )}
      </main>
    </div>
  );
}

function PlanStep({
  activity,
  done,
  current,
}: {
  activity: SessionActivityDto;
  done: boolean;
  current: boolean;
}) {
  return (
    <li
      aria-current={current ? "step" : undefined}
      className={cn(
        "flex items-start gap-2 text-xs",
        done ? "text-ink-muted" : "text-ink",
        current && "font-semibold",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-3.5 flex-none items-center justify-center rounded-full",
          done ? "bg-correct text-paper" : current ? "bg-bic" : "border border-margin-rule",
        )}
      >
        {done ? <Check className="size-2.5" strokeWidth={3} /> : null}
      </span>
      <span className="line-clamp-1">
        {text.kinds[activity.kind]}: {activity.prompt}
      </span>
    </li>
  );
}

function ActivityView({
  state,
  dispatch,
  onRated,
}: {
  state: SessionState;
  dispatch: (event: SessionEvent) => void;
  onRated: () => void;
}) {
  const activity = currentActivity(state)!;
  const total = state.plan?.activities.length ?? 0;
  const answerId = React.useId();
  const promptRef = React.useRef<HTMLHeadingElement>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [rateError, setRateError] = React.useState(false);
  const attempt = state.answer.trim();

  React.useEffect(() => {
    if (state.index > 0) promptRef.current?.focus();
    setRateError(false);
  }, [state.index]);

  async function rate(rating: ReviewRating) {
    setSubmitting(true);
    setRateError(false);
    try {
      await submitReview(activity.reviewItemId, rating);
      dispatch({ type: "rated", rating });
      onRated();
    } catch {
      setRateError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 text-xs text-ink-muted">
        <span className="font-semibold text-ink">{text.progress(state.index + 1, total)}</span>
        <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
          <span
            className="block h-full rounded-full bg-bic transition-[width] duration-base ease-margem-out motion-reduce:transition-none"
            style={{ width: `${Math.round((state.index / total) * 100)}%` }}
          />
        </span>
        <span>{text.remaining(remainingMinutes(state))}</span>
      </div>

      <section className="flex flex-col gap-3 rounded-lg bg-paper p-6 shadow-xs">
        <span
          className={cn(
            "self-start rounded-sm px-2 py-0.5 text-[11px] font-semibold",
            KIND_TAG[activity.kind],
          )}
        >
          {text.kinds[activity.kind]}
        </span>
        <h2
          ref={promptRef}
          tabIndex={-1}
          className="font-serif text-xl leading-snug font-semibold text-ink outline-none"
        >
          {activity.prompt}
        </h2>
        {!state.revealed ? (
          <>
            <label htmlFor={answerId} className="text-xs text-ink-muted">
              {text.yourAnswer}
            </label>
            <textarea
              id={answerId}
              rows={4}
              value={state.answer}
              onChange={(event) => dispatch({ type: "typeAnswer", value: event.target.value })}
              placeholder={text.yourAnswerPlaceholder}
              className="w-full resize-y rounded-md border border-margin-rule bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-muted/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic"
            />
            <div className="flex gap-2">
              <Button type="button" onClick={() => dispatch({ type: "reveal" })}>
                {text.check}
              </Button>
              <Button type="button" variant="ghost" onClick={() => dispatch({ type: "skip" })}>
                {text.skip}
              </Button>
            </div>
          </>
        ) : attempt ? (
          <p className="text-sm text-ink-muted">
            <span className="font-medium text-ink">{text.yourAttempt}: </span>
            {attempt}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 rounded-lg bg-margin p-5" aria-live="polite">
        <span className="text-xs font-medium text-ink-muted">
          {text.from(activity.sourceTitle, activity.excerpt?.page ?? null)}
        </span>
        {!state.revealed ? (
          <>
            <span className="sr-only">{text.hiddenExcerpt}</span>
            <div aria-hidden="true" className="flex flex-col gap-2">
              <span className="h-2.5 w-[92%] rounded-full bg-ground" />
              <span className="h-2.5 w-[84%] rounded-full bg-ground" />
              <span className="h-2.5 w-[60%] rounded-full bg-ground" />
            </div>
          </>
        ) : (
          <>
            {activity.excerpt ? (
              <p className="font-serif text-[17px] leading-[1.75] text-ink">
                {splitBlanks(activity.excerpt.text, [
                  { id: "answer", answer: activity.answer },
                ]).map((segment, index) =>
                  "blankId" in segment ? (
                    <mark key={index} className="rounded-[3px] bg-marker-soft px-0.5 text-ink">
                      {segment.text}
                    </mark>
                  ) : (
                    <React.Fragment key={index}>{segment.text}</React.Fragment>
                  ),
                )}
              </p>
            ) : (
              <p className="text-sm text-ink-muted">{text.noExcerpt}</p>
            )}
            <p className="text-sm text-ink">
              <span className="font-medium">{text.expected}: </span>
              {activity.answer}
            </p>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-ink-muted">{text.howDidItGo}</span>
              <div className="flex flex-wrap gap-2">
                {RATINGS.map((rating) => (
                  <Button
                    key={rating}
                    type="button"
                    variant="secondary"
                    disabled={submitting}
                    onClick={() => void rate(rating)}
                  >
                    {messages.review[rating]}
                  </Button>
                ))}
              </div>
              {rateError ? <p className="text-sm text-danger">{text.rateError}</p> : null}
            </div>
          </>
        )}
      </section>
    </>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg bg-paper p-6 text-sm text-ink-muted shadow-xs">
      {children}
    </div>
  );
}
