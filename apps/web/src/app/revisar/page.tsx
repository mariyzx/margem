"use client";

import type { ReviewCardDto, ReviewRating } from "@margem/shared";
import { Button, Skeleton, Toast, ToastClose, ToastTitle } from "@margem/ui";
import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Wordmark } from "../../components/wordmark";
import { ThemeToggle } from "../../components/theme-toggle";
import { fetchCurrentUser, fetchDueReviews, submitReview } from "../../lib/api";
import { messages } from "../../messages/pt-br";

function formatInterval(days: number): string {
  if (days < 1) return "< 1 dia";
  if (days === 1) return "1 dia";
  return `${days} dias`;
}

export default function ReviewPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [cards, setCards] = React.useState<ReviewCardDto[]>([]);
  const [revealed, setRevealed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorToast, setErrorToast] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then(async (user) => {
        if (!active) return;
        if (!user) {
          router.replace("/entrar");
          return;
        }
        const due = await fetchDueReviews();
        if (active) {
          setCards(due);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setErrorToast(messages.review.loadError);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [router]);

  const currentCard = cards[0] ?? null;

  async function handleRate(rating: ReviewRating) {
    if (!currentCard || submitting) return;
    setSubmitting(true);
    try {
      await submitReview(currentCard.id, rating);
      setCards((prev) => prev.slice(1));
      setRevealed(false);
    } catch {
      setErrorToast(messages.review.submitError);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/"
            className="text-sm font-medium text-ink-muted transition-colors duration-fast hover:text-ink"
          >
            {messages.review.backToNotebooks}
          </Link>
        </div>
      </header>

      <h1 className="mb-4 text-xs font-medium tracking-wide text-ink-muted uppercase">
        {messages.review.title}
      </h1>

      <AnimatePresence mode="wait">
        {!currentCard ? (
          <m.section
            key="empty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-lg border border-margin-rule bg-paper p-8 shadow-sm"
          >
            <h2 className="font-serif text-2xl font-semibold text-ink">
              {messages.review.emptyTitle}
            </h2>
            <p className="mt-2 mb-6 text-sm text-ink-muted">{messages.review.emptyDescription}</p>
            <Button type="button" onClick={() => router.push("/")}>
              {messages.review.backToNotebooks}
            </Button>
          </m.section>
        ) : (
          <m.section
            key={currentCard.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            className="flex flex-col gap-5 rounded-lg border border-margin-rule bg-paper p-8 shadow-sm"
          >
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span>{currentCard.notebookName}</span>
              {currentCard.noteId ? (
                <Link
                  href={`/?note=${encodeURIComponent(currentCard.noteId)}`}
                  className="font-medium text-bic hover:underline"
                >
                  {messages.review.seeInNote}
                </Link>
              ) : null}
            </div>

            {currentCard.quote ? (
              <blockquote className="border-l-2 border-bic pl-3 font-serif text-sm text-ink-muted italic">
                “{currentCard.quote}”
              </blockquote>
            ) : null}

            <p className="font-serif text-xl leading-relaxed font-medium text-ink">
              {currentCard.prompt}
            </p>

            {!revealed ? (
              <Button type="button" onClick={() => setRevealed(true)}>
                {messages.review.showAnswer}
              </Button>
            ) : (
              <div className="flex flex-col gap-4 border-t border-margin-rule pt-4">
                <p className="font-serif text-base leading-relaxed text-ink">
                  {currentCard.answer}
                </p>

                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={submitting}
                    onClick={() => void handleRate("again")}
                    className="flex flex-col py-2"
                  >
                    <span>{messages.review.again}</span>
                    <span className="text-[11px] font-normal text-ink-muted">
                      {formatInterval(currentCard.intervals.again)}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={submitting}
                    onClick={() => void handleRate("hard")}
                    className="flex flex-col py-2"
                  >
                    <span>{messages.review.hard}</span>
                    <span className="text-[11px] font-normal text-ink-muted">
                      {formatInterval(currentCard.intervals.hard)}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleRate("easy")}
                    className="flex flex-col py-2"
                  >
                    <span>{messages.review.easy}</span>
                    <span className="text-[11px] font-normal opacity-90">
                      {formatInterval(currentCard.intervals.easy)}
                    </span>
                  </Button>
                </div>
              </div>
            )}
          </m.section>
        )}
      </AnimatePresence>

      <Toast
        open={Boolean(errorToast)}
        onOpenChange={(open) => {
          if (!open) setErrorToast(null);
        }}
        variant="danger"
      >
        <ToastTitle>{errorToast}</ToastTitle>
        <ToastClose />
      </Toast>
    </main>
  );
}
