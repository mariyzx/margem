"use client";

import type { StudioOverviewDto } from "@margem/shared";
import { Button, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@margem/ui";
import { AnimatePresence, m, useReducedMotion, type Variants } from "motion/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { ReadMode } from "../../../components/studio/read-mode";
import type { SheetCache } from "../../../components/studio/source-sheet";
import { StudioOverview } from "../../../components/studio/studio-overview";
import type { ReadEvent } from "../../../components/studio/read-state";
import { SessionMode } from "../../../components/studio/session-mode";
import type { SessionEvent } from "../../../components/studio/session-state";
import {
  initialStudioState,
  isStudioMode,
  STUDIO_MODES,
  type StudioMode,
  studioReducer,
} from "../../../components/studio/studio-state";
import { ThemeToggle } from "../../../components/theme-toggle";
import { Wordmark } from "../../../components/wordmark";
import { ApiError, fetchCurrentUser, fetchStudioOverview } from "../../../lib/api";
import { messages } from "../../../messages/pt-br";

const text = messages.studio;
const SLIDE_PX = 48;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; overview: StudioOverviewDto }
  | { status: "notFound" }
  | { status: "error" };

const modeVariants: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * SLIDE_PX }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -SLIDE_PX }),
};

export default function StudioPage() {
  const router = useRouter();
  const { notebookId } = useParams<{ notebookId: string }>();
  const [load, setLoad] = React.useState<LoadState>({ status: "loading" });
  const [studio, dispatch] = React.useReducer(studioReducer, initialStudioState);
  const reduceMotion = useReducedMotion();
  const [sheets, setSheets] = React.useState<SheetCache>({});
  const [overviewStale, setOverviewStale] = React.useState(false);
  const dispatchRead = React.useCallback(
    (event: ReadEvent) => dispatch({ type: "read", event }),
    [],
  );
  const dispatchSession = React.useCallback(
    (event: SessionEvent) => dispatch({ type: "session", event }),
    [],
  );

  const requestIdRef = React.useRef(0);

  const loadOverview = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestIdRef.current === requestId;
    setLoad({ status: "loading" });
    try {
      const user = await fetchCurrentUser();
      if (!isCurrent()) return;
      if (!user) {
        router.replace("/entrar");
        return;
      }
      const overview = await fetchStudioOverview(notebookId);
      if (isCurrent()) setLoad({ status: "ready", overview });
    } catch (error) {
      if (!isCurrent()) return;
      setLoad({
        status: error instanceof ApiError && error.status === 404 ? "notFound" : "error",
      });
    }
  }, [notebookId, router]);

  React.useEffect(() => {
    if (studio.mode !== "overview" || !overviewStale) return;
    setOverviewStale(false);
    let active = true;
    fetchStudioOverview(notebookId)
      .then((overview) => {
        if (active) setLoad({ status: "ready", overview });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [studio.mode, overviewStale, notebookId]);

  React.useEffect(() => {
    void loadOverview();
    return () => {
      requestIdRef.current++;
    };
  }, [loadOverview]);

  const sources = load.status === "ready" ? load.overview.sources : [];

  const views: Record<StudioMode, React.ReactNode> = {
    overview: (
      <StudioOverview
        sources={sources}
        onPractice={(sourceIds, minutes) => dispatch({ type: "practice", sourceIds, minutes })}
        onOpenMaterial={(sourceId, kind) => dispatch({ type: "openMaterial", sourceId, kind })}
      />
    ),
    read: (
      <ReadMode
        notebookId={notebookId}
        sources={sources}
        state={studio.read}
        dispatch={dispatchRead}
        sheets={sheets}
        setSheets={setSheets}
        onPracticeChanged={() => setOverviewStale(true)}
      />
    ),
    session: (
      <SessionMode
        notebookId={notebookId}
        sources={sources}
        state={studio.session}
        dispatch={dispatchSession}
        onGoToRead={() => dispatch({ type: "switch", mode: "read" })}
        onRated={() => setOverviewStale(true)}
      />
    ),
  };

  return (
    <div className="flex min-h-screen flex-col bg-ground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-margin-rule bg-paper px-6 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <Wordmark />
          <p className="truncate text-sm text-ink-muted">
            {load.status === "ready" ? (
              <>
                {load.overview.notebook.name} <span aria-hidden="true">/</span>{" "}
              </>
            ) : null}
            <strong className="font-semibold text-ink">{text.title}</strong>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/"
            className="text-sm font-medium text-ink-muted transition-colors duration-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic"
          >
            {text.backToNotebooks}
          </Link>
        </div>
      </header>

      {load.status === "notFound" ? (
        <StudioMessage title={text.notFoundTitle} description={text.notFoundDescription}>
          <Button asChild variant="secondary">
            <Link href="/">{text.backToNotebooks}</Link>
          </Button>
        </StudioMessage>
      ) : load.status === "error" ? (
        <StudioMessage title={text.title} description={text.loadError}>
          <Button type="button" onClick={() => void loadOverview()}>
            {text.retry}
          </Button>
        </StudioMessage>
      ) : (
        <Tabs
          value={studio.mode}
          onValueChange={(value) => {
            if (isStudioMode(value)) dispatch({ type: "switch", mode: value });
          }}
          className="flex flex-1 flex-col"
        >
          <nav
            aria-label={text.modesLabel}
            className="sticky top-0 z-10 flex justify-center border-b border-margin-rule bg-ground/95 px-4 py-3 backdrop-blur-sm"
          >
            <TabsList className="w-full max-w-2xl overflow-x-auto">
              {STUDIO_MODES.map((mode) => (
                <TabsTrigger
                  key={mode}
                  value={mode}
                  className="flex min-h-11 flex-1 flex-col items-start justify-center gap-0.5 px-4 py-2 data-[state=active]:bg-paper data-[state=active]:shadow-xs"
                >
                  <span className="text-sm font-semibold">{text.modes[mode].label}</span>
                  <span className="hidden text-xs text-ink-muted sm:block">
                    {text.modes[mode].sub}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </nav>

          <div className="relative flex-1 overflow-x-clip px-4 pt-8 pb-14 md:px-6">
            {load.status === "loading" ? (
              <OverviewSkeleton />
            ) : (
              <AnimatePresence mode="popLayout" initial={false} custom={studio.direction}>
                <TabsContent key={studio.mode} value={studio.mode} forceMount asChild>
                  <m.section
                    className="data-[state=inactive]:pointer-events-none"
                    transition={reduceMotion ? { duration: 0 } : undefined}
                    custom={studio.direction}
                    variants={modeVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    {views[studio.mode]}
                  </m.section>
                </TabsContent>
              </AnimatePresence>
            )}
          </div>
        </Tabs>
      )}
    </div>
  );
}

function StudioMessage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="font-serif text-2xl font-semibold text-ink">{title}</h1>
      <p className="text-sm text-ink-muted">{description}</p>
      <div>{children}</div>
    </main>
  );
}

function OverviewSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6" aria-busy="true">
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(17.5rem,1fr))] gap-5">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-80 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
