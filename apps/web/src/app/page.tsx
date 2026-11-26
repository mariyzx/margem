"use client";

import { MOTION_DURATIONS, MOTION_EASINGS } from "@margem/config/motion";
import type { AuthUser, NotebookColor, NotebookDto, NoteDto } from "@margem/shared";
import { Skeleton, Toast, ToastClose, ToastTitle } from "@margem/ui";
import { Menu } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { NotebookSidebar } from "../components/notebook-sidebar";
import { createErrorMessage } from "../lib/errors";
import { NoteWorkspace } from "../components/note-workspace";
import { ThemeToggle } from "../components/theme-toggle";
import {
  createNotebook,
  createNote,
  deleteNote,
  fetchCurrentUser,
  fetchNote,
  fetchNotebookNotes,
  fetchNotebooks,
  logout,
  logoutAll,
  updateNote,
} from "../lib/api";
import { messages } from "../messages/pt-br";

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [checking, setChecking] = React.useState(true);
  const [notebooks, setNotebooks] = React.useState<NotebookDto[]>([]);
  const [selectedNotebookId, setSelectedNotebookId] = React.useState<string | null>(null);
  const [selectedNote, setSelectedNote] = React.useState<NoteDto | null>(null);
  const [loadingNote, setLoadingNote] = React.useState(false);
  const [creatingNotebook, setCreatingNotebook] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [errorToast, setErrorToast] = React.useState<string | null>(null);
  const noteRequestIdRef = React.useRef(0);
  const deletedNoteIdsRef = React.useRef<Set<string>>(new Set());

  const loadNoteById = React.useCallback(async (noteId: string) => {
    const requestId = ++noteRequestIdRef.current;
    setLoadingNote(true);
    try {
      const note = await fetchNote(noteId);
      if (noteRequestIdRef.current === requestId) {
        setSelectedNote(note);
      }
    } catch {
      if (noteRequestIdRef.current === requestId) {
        setErrorToast(messages.notes.saveError);
      }
    } finally {
      if (noteRequestIdRef.current === requestId) {
        setLoadingNote(false);
      }
    }
  }, []);

  const loadFirstNoteOfNotebook = React.useCallback(
    async (notebook: NotebookDto) => {
      const firstNote = notebook.notes?.[0];
      if (!firstNote) {
        noteRequestIdRef.current++;
        setSelectedNote(null);
        setLoadingNote(false);
        return;
      }
      await loadNoteById(firstNote.id);
    },
    [loadNoteById],
  );

  const loadWorkspace = React.useCallback(async () => {
    const list = await fetchNotebooks();
    setNotebooks(list);
    if (list.length === 0) {
      setSelectedNotebookId(null);
      setSelectedNote(null);
      return;
    }

    const requestedNoteId = new URLSearchParams(window.location.search).get("note");
    if (requestedNoteId) {
      const targetNotebook = list.find((nb) =>
        (nb.notes ?? []).some((note) => note.id === requestedNoteId),
      );
      if (targetNotebook) {
        setSelectedNotebookId(targetNotebook.id);
        await loadNoteById(requestedNoteId);
        return;
      }
    }

    const firstNotebook = list[0]!;
    setSelectedNotebookId(firstNotebook.id);
    await loadFirstNoteOfNotebook(firstNotebook);
  }, [loadFirstNoteOfNotebook, loadNoteById]);

  React.useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then(async (current) => {
        if (!active) return;
        if (!current) {
          router.replace("/entrar");
          return;
        }
        setUser(current);
        await loadWorkspace();
        if (active) setChecking(false);
      })
      .catch(() => {
        if (active) router.replace("/entrar");
      });
    return () => {
      active = false;
    };
  }, [router, loadWorkspace]);

  async function handleSelectNotebook(notebookId: string) {
    setCreatingNotebook(false);
    setMobileMenuOpen(false);
    setSelectedNotebookId(notebookId);

    const nb = notebooks.find((item) => item.id === notebookId);
    if (!nb) {
      noteRequestIdRef.current++;
      setSelectedNote(null);
      return;
    }

    await loadFirstNoteOfNotebook(nb);
  }

  async function handleSelectNote(notebookId: string, noteId: string) {
    setCreatingNotebook(false);
    setMobileMenuOpen(false);
    setSelectedNotebookId(notebookId);
    await loadNoteById(noteId);
  }

  async function handleCreateNotebook(values: { name: string; color: NotebookColor }) {
    try {
      const created = await createNotebook(values);
      setNotebooks((prev) => [created, ...prev]);
      setSelectedNotebookId(created.id);
      noteRequestIdRef.current++;
      setSelectedNote(null);
      setCreatingNotebook(false);
    } catch (error) {
      setErrorToast(createErrorMessage(error, messages.notes.saveError));
    }
  }

  async function handleCreateNote(notebookId: string, sourceId?: string) {
    setCreatingNotebook(false);
    setMobileMenuOpen(false);
    let created: NoteDto;
    try {
      created = await createNote({ notebookId, ...(sourceId ? { sourceId } : {}) });
    } catch (error) {
      setErrorToast(createErrorMessage(error, messages.notes.saveError));
      return;
    }
    setSelectedNotebookId(notebookId);
    setSelectedNote(created);
    setNotebooks((prev) =>
      prev.map((nb) =>
        nb.id === notebookId
          ? {
              ...nb,
              notes: [
                {
                  id: created.id,
                  notebookId: created.notebookId,
                  title: created.title,
                  createdAt: created.createdAt,
                  updatedAt: created.updatedAt,
                },
                ...(nb.notes ?? []),
              ],
            }
          : nb,
      ),
    );
  }

  async function handleLoadMoreNotes(notebookId: string) {
    const notebook = notebooks.find((nb) => nb.id === notebookId);
    const lastNote = notebook?.notes?.at(-1);
    if (!lastNote) return;
    try {
      const page = await fetchNotebookNotes(notebookId, lastNote.id);
      setNotebooks((prev) =>
        prev.map((nb) => {
          if (nb.id !== notebookId) return nb;
          const known = new Set((nb.notes ?? []).map((n) => n.id));
          return {
            ...nb,
            notes: [...(nb.notes ?? []), ...page.notes.filter((n) => !known.has(n.id))],
            hasMoreNotes: page.nextCursor !== null,
          };
        }),
      );
    } catch {
      setErrorToast(messages.notebooks.loadMoreNotesError);
    }
  }

  async function handleSaveNote(
    noteId: string,
    values: {
      title?: string;
      doc?: Record<string, unknown>;
      sourceId?: string;
      materialOpenedAt?: string;
    },
  ) {
    // Autosave pendente de uma nota recém-excluída não deve virar toast de erro.
    if (deletedNoteIdsRef.current.has(noteId)) return;
    try {
      const updated = await updateNote(noteId, values);
      setSelectedNote((prev) => (prev?.id === updated.id ? updated : prev));
      setNotebooks((prev) =>
        prev.map((nb) =>
          nb.id === updated.notebookId
            ? {
                ...nb,
                notes: (nb.notes ?? []).map((n) =>
                  n.id === updated.id
                    ? { ...n, title: updated.title, updatedAt: updated.updatedAt }
                    : n,
                ),
              }
            : nb,
        ),
      );
    } catch {
      setErrorToast(messages.notes.saveError);
    }
  }

  async function handleDeleteNote(notebookId: string, noteId: string) {
    try {
      await deleteNote(noteId);
    } catch {
      setErrorToast(messages.notebooks.deleteNoteError);
      return;
    }
    deletedNoteIdsRef.current.add(noteId);

    const notebook = notebooks.find((nb) => nb.id === notebookId);
    const remaining = (notebook?.notes ?? []).filter((n) => n.id !== noteId);
    setNotebooks((prev) =>
      prev.map((nb) => (nb.id === notebookId ? { ...nb, notes: remaining } : nb)),
    );

    if (selectedNote?.id === noteId) {
      const index = (notebook?.notes ?? []).findIndex((n) => n.id === noteId);
      const next = remaining[Math.min(index, remaining.length - 1)];
      if (next) {
        await loadNoteById(next.id);
      } else {
        noteRequestIdRef.current++;
        setSelectedNote(null);
        setLoadingNote(false);
      }
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/entrar");
  }

  async function handleLogoutAll() {
    await logoutAll();
    router.replace("/entrar");
  }

  if (checking || !user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </main>
    );
  }

  const selectedNotebook = notebooks.find((nb) => nb.id === selectedNotebookId) ?? null;

  return (
    <div className="flex min-h-screen bg-ground">
      <NotebookSidebar
        user={user}
        notebooks={notebooks}
        selectedNotebookId={selectedNotebookId}
        selectedNoteId={selectedNote?.id ?? null}
        onSelectNotebook={(id) => void handleSelectNotebook(id)}
        onSelectNote={(nbId, noteId) => void handleSelectNote(nbId, noteId)}
        onStartNewNotebook={() => {
          setCreatingNotebook(true);
          setMobileMenuOpen(false);
        }}
        onCreateNote={(nbId) => void handleCreateNote(nbId)}
        onLoadMoreNotes={handleLoadMoreNotes}
        onDeleteNote={handleDeleteNote}
        onLogout={() => void handleLogout()}
        onLogoutAll={() => void handleLogoutAll()}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-margin-rule bg-paper px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label={messages.notebooks.openMenu}
            className="rounded-md p-1.5 text-ink hover:bg-margin"
          >
            <Menu className="h-5 w-5" strokeWidth={1.5} />
          </button>
          <span className="font-serif text-lg font-semibold text-ink">{messages.appName}</span>
          <ThemeToggle />
        </header>

        <main className="flex-1 px-6 py-8">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={
                selectedNote?.id ??
                (creatingNotebook ? "new-notebook" : (selectedNotebookId ?? "empty"))
              }
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{
                duration: MOTION_DURATIONS.fast,
                ease: [...MOTION_EASINGS.out],
              }}
            >
              <NoteWorkspace
                key={selectedNote?.id ?? selectedNotebookId ?? "empty"}
                notebooks={notebooks}
                selectedNotebook={selectedNotebook}
                selectedNote={selectedNote}
                loadingNote={loadingNote}
                creatingNotebook={creatingNotebook}
                onCancelCreateNotebook={() => setCreatingNotebook(false)}
                onCreateNotebook={handleCreateNotebook}
                onCreateNote={handleCreateNote}
                onSaveNote={handleSaveNote}
                onSelectNote={(noteId) => {
                  if (selectedNotebook) void handleSelectNote(selectedNotebook.id, noteId);
                }}
              />
            </m.div>
          </AnimatePresence>
        </main>
      </div>

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
    </div>
  );
}
