"use client";

import { cn } from "@margem/config/cn";
import type { AuthUser, NotebookColor, NotebookDto } from "@margem/shared";
import { Button, Popover, PopoverContent, PopoverTrigger, SidebarItem } from "@margem/ui";
import {
  BookOpen,
  ChevronRight,
  Clock,
  FileText,
  LogOut,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { MOTION_DURATIONS, MOTION_EASINGS } from "@margem/config/motion";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { messages } from "../messages/pt-br";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "./wordmark";

const EASE = [...MOTION_EASINGS.out] as [number, number, number, number];

const itemVariants = {
  hidden: { opacity: 0, x: -6 },
  visible: { opacity: 1, x: 0, transition: { duration: MOTION_DURATIONS.base, ease: EASE } },
};

const COLOR_DOT_CLASSES: Record<NotebookColor, string> = {
  bic: "bg-bic",
  correct: "bg-correct",
  turma: "bg-turma",
  marker: "bg-marker",
  ink: "bg-ink",
};

interface NotebookSidebarProps {
  user: AuthUser;
  notebooks: NotebookDto[];
  selectedNotebookId: string | null;
  selectedNoteId: string | null;
  onSelectNotebook: (notebookId: string) => void;
  onSelectNote: (notebookId: string, noteId: string) => void;
  onStartNewNotebook: () => void;
  onCreateNote: (notebookId: string) => void;
  /** Loads the next page of a notebook's notes (only shown when `hasMoreNotes`). */
  onLoadMoreNotes: (notebookId: string) => Promise<void>;
  onDeleteNote: (notebookId: string, noteId: string) => Promise<void>;
  onLogout: () => void;
  onLogoutAll: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function NotebookSidebar({
  user,
  notebooks,
  selectedNotebookId,
  selectedNoteId,
  onSelectNotebook,
  onSelectNote,
  onStartNewNotebook,
  onCreateNote,
  onLoadMoreNotes,
  onDeleteNote,
  onLogout,
  onLogoutAll,
  mobileOpen = false,
  onCloseMobile,
}: NotebookSidebarProps) {
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => new Set());
  const reduceMotion = useReducedMotion();
  const [confirmingNoteId, setConfirmingNoteId] = React.useState<string | null>(null);
  const [loadingMoreIds, setLoadingMoreIds] = React.useState<Set<string>>(() => new Set());

  async function handleLoadMore(notebookId: string) {
    setLoadingMoreIds((prev) => new Set(prev).add(notebookId));
    try {
      await onLoadMoreNotes(notebookId);
    } finally {
      setLoadingMoreIds((prev) => {
        const next = new Set(prev);
        next.delete(notebookId);
        return next;
      });
    }
  }

  // O caderno da nota aberta sempre aparece aberto (carga inicial, troca de nota, link ?note=).
  React.useEffect(() => {
    if (selectedNotebookId) {
      setExpandedIds((prev) =>
        prev.has(selectedNotebookId) ? prev : new Set(prev).add(selectedNotebookId),
      );
    }
  }, [selectedNotebookId]);

  function toggleNotebook(notebookId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(notebookId)) next.add(notebookId);
      return next;
    });
  }

  function expandNotebook(notebookId: string) {
    setExpandedIds((prev) => (prev.has(notebookId) ? prev : new Set(prev).add(notebookId)));
  }

  return (
    <aside
      aria-label={messages.notebooks.sectionTitle}
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-margin-rule bg-margin transition-transform duration-base ease-margem-out md:static md:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex items-center justify-between border-b border-margin-rule px-4 py-3">
        <Wordmark />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {onCloseMobile ? (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label={messages.notebooks.closeMenu}
              className="rounded-md p-1.5 text-ink-muted hover:bg-paper hover:text-ink md:hidden"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="px-3 pt-3">
        <Link
          href="/revisar"
          onClick={onCloseMobile}
          className="flex items-center gap-2 rounded-md border border-margin-rule bg-paper px-3 py-2 text-sm font-medium text-bic shadow-xs transition-colors duration-fast ease-margem-out hover:bg-margin focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic"
        >
          <Clock className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span>{messages.review.navLink}</span>
        </Link>
        <Link
          href="/configuracoes/ia"
          onClick={onCloseMobile}
          className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-ink-muted transition-colors duration-fast ease-margem-out hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic"
        >
          <Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span>{messages.ai.navLink}</span>
        </Link>
      </div>

      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-xs font-medium tracking-wide text-ink-muted uppercase">
          {messages.notebooks.sectionTitle}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onStartNewNotebook}>
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          <span>{messages.notebooks.newNotebook}</span>
        </Button>
      </div>
      <nav
        className="flex-1 overflow-y-auto px-2 pb-4"
        aria-label={messages.notebooks.sectionTitle}
      >
        <ul className="flex flex-col gap-3">
          {notebooks.map((notebook) => {
            const isSelectedNotebook = notebook.id === selectedNotebookId;
            const notes = notebook.notes ?? [];
            const expanded = expandedIds.has(notebook.id);
            const notesListId = `notebook-notes-${notebook.id}`;
            return (
              <li key={notebook.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleNotebook(notebook.id)}
                    aria-expanded={expanded}
                    aria-controls={notesListId}
                    aria-label={`${expanded ? messages.notebooks.collapseNotebook : messages.notebooks.expandNotebook}: ${notebook.name}`}
                    className="rounded-md p-1.5 text-ink-muted transition-colors duration-fast hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic"
                  >
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 transition-transform duration-fast ease-margem-out motion-reduce:transition-none",
                        expanded && "rotate-90",
                      )}
                      strokeWidth={1.5}
                    />
                  </button>
                  <SidebarItem
                    active={isSelectedNotebook && (!selectedNoteId || !expanded)}
                    onClick={() => {
                      toggleNotebook(notebook.id);
                      if (notes.length === 0) onSelectNotebook(notebook.id);
                    }}
                    aria-expanded={expanded}
                    aria-controls={notesListId}
                    className={cn(
                      "flex-1",
                      !(isSelectedNotebook && (!selectedNoteId || !expanded)) &&
                        "hover:bg-transparent",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-2.5 w-2.5 shrink-0 rounded-full",
                        COLOR_DOT_CLASSES[notebook.color],
                      )}
                    />
                    <BookOpen className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{notebook.name}</span>
                  </SidebarItem>
                  <button
                    type="button"
                    onClick={() => {
                      expandNotebook(notebook.id);
                      onCreateNote(notebook.id);
                    }}
                    aria-label={`${messages.notebooks.newNote} em ${notebook.name}`}
                    className="rounded-md p-1.5 text-ink-muted transition-colors duration-fast hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic"
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {expanded ? (
                    <m.div
                      key="notes"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        duration: reduceMotion ? 0 : MOTION_DURATIONS.slow,
                        ease: EASE,
                      }}
                      className="overflow-hidden"
                    >
                      <m.ul
                        id={notesListId}
                        initial="hidden"
                        animate="visible"
                        variants={{
                          visible: {
                            transition: {
                              staggerChildren: reduceMotion ? 0 : 0.035,
                              delayChildren: reduceMotion ? 0 : 0.05,
                            },
                          },
                        }}
                        className="mt-1 ml-4 flex flex-col gap-0.5 border-l border-margin-rule py-0.5 pr-1 pl-2"
                      >
                        {notes.map((note) => (
                          <m.li
                            key={note.id}
                            variants={itemVariants}
                            className="group/note relative"
                          >
                            <SidebarItem
                              active={note.id === selectedNoteId}
                              onClick={() => onSelectNote(notebook.id, note.id)}
                              className="pr-8"
                            >
                              <FileText className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                              <span className="truncate">
                                {note.title.trim() || messages.notebooks.untitledNote}
                              </span>
                            </SidebarItem>
                            <Popover
                              open={confirmingNoteId === note.id}
                              onOpenChange={(open) => setConfirmingNoteId(open ? note.id : null)}
                            >
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`${messages.notebooks.deleteNote}: ${note.title.trim() || messages.notebooks.untitledNote}`}
                                  className={cn(
                                    "absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1 text-ink-muted transition-opacity duration-fast hover:bg-margin hover:text-danger focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic",
                                    confirmingNoteId === note.id
                                      ? "opacity-100"
                                      : "opacity-0 group-hover/note:opacity-100 [@media(hover:none)]:opacity-100",
                                  )}
                                >
                                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="end" className="w-64">
                                <p className="font-medium">{messages.notebooks.deleteNoteTitle}</p>
                                <p className="mt-1 text-xs text-ink-muted">
                                  {messages.notebooks.deleteNoteDescription}
                                </p>
                                <div className="mt-3 flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setConfirmingNoteId(null)}
                                  >
                                    {messages.notebooks.cancelButton}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="danger"
                                    onClick={() => {
                                      setConfirmingNoteId(null);
                                      void onDeleteNote(notebook.id, note.id);
                                    }}
                                  >
                                    {messages.notebooks.deleteNoteConfirm}
                                  </Button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </m.li>
                        ))}
                        {notebook.hasMoreNotes ? (
                          <m.li variants={itemVariants}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={loadingMoreIds.has(notebook.id)}
                              onClick={() => void handleLoadMore(notebook.id)}
                            >
                              {loadingMoreIds.has(notebook.id)
                                ? messages.notebooks.loadingMoreNotes
                                : messages.notebooks.loadMoreNotes}
                            </Button>
                          </m.li>
                        ) : null}
                        {notes.length === 0 ? (
                          <m.li
                            variants={itemVariants}
                            className="px-2.5 py-1.5 text-xs text-ink-muted"
                          >
                            {messages.notebooks.emptyNotebookHint}
                          </m.li>
                        ) : null}
                      </m.ul>
                    </m.div>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-2 border-t border-margin-rule p-4">
        <p className="truncate text-xs text-ink-muted" title={user.email}>
          {user.email}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onLogout}>
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>{messages.auth.logout}</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onLogoutAll}>
            {messages.auth.logoutAll}
          </Button>
        </div>
      </div>
    </aside>
  );
}
