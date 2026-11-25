"use client";

import { cn } from "@margem/config/cn";
import type { AuthUser, NotebookColor, NotebookDto } from "@margem/shared";
import { Button, SidebarItem } from "@margem/ui";
import { BookOpen, Clock, FileText, LogOut, Plus, X } from "lucide-react";
import Link from "next/link";
import { messages } from "../messages/pt-br";
import { Wordmark } from "./wordmark";

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
  onLogout,
  onLogoutAll,
  mobileOpen = false,
  onCloseMobile,
}: NotebookSidebarProps) {
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

      <div className="px-3 pt-3">
        <Link
          href="/revisar"
          onClick={onCloseMobile}
          className="flex items-center gap-2 rounded-md border border-margin-rule bg-paper px-3 py-2 text-sm font-medium text-bic shadow-xs transition-colors duration-fast ease-margem-out hover:bg-margin focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic"
        >
          <Clock className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span>{messages.review.navLink}</span>
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
            return (
              <li key={notebook.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <SidebarItem
                    active={isSelectedNotebook && !selectedNoteId}
                    onClick={() => onSelectNotebook(notebook.id)}
                    className="flex-1"
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
                    onClick={() => onCreateNote(notebook.id)}
                    aria-label={`${messages.notebooks.newNote} em ${notebook.name}`}
                    className="rounded-md p-1.5 text-ink-muted transition-colors duration-fast hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic"
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>

                {notes.length > 0 ? (
                  <ul className="ml-4 flex flex-col gap-0.5 border-l border-margin-rule pl-2">
                    {notes.map((note) => (
                      <li key={note.id}>
                        <SidebarItem
                          active={note.id === selectedNoteId}
                          onClick={() => onSelectNote(notebook.id, note.id)}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                          <span className="truncate">
                            {note.title.trim() || messages.notebooks.untitledNote}
                          </span>
                        </SidebarItem>
                      </li>
                    ))}
                  </ul>
                ) : null}
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
