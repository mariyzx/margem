import {
  authUserSchema,
  nextCursorSchema,
  noteSummarySchema,
  quotaExceededErrorSchema,
  type NoteSummary,
  type QuotaExceededError,
  CreateQuestionInput,
  notebookSchema,
  noteSchema,
  QuestionDto,
  questionSchema,
  reviewCardSchema,
  sourceSchema,
  type AuthUser,
  type CreateLinkSourceInput,
  type CreateNotebookInput,
  type CreateNoteInput,
  type CreateTextSourceInput,
  type NotebookDto,
  type NoteDto,
  type ReviewCardDto,
  type ReviewRating,
  type SourceDto,
  type UpdateNotebookInput,
  type UpdateNoteInput,
  SearchHitDto,
  searchHitSchema,
} from "@margem/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Safety net for "fetch every page" loops; per-user caps keep real lists far below it. */
const MAX_PAGES = 200;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Set when the API answered 422 because a per-user cap was reached. */
    readonly quota?: QuotaExceededError,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function failed(res: Response, label: string): Promise<never> {
  let quota: QuotaExceededError | undefined;
  if (res.status === 422) {
    const parsed = quotaExceededErrorSchema.safeParse(await res.json().catch(() => null));
    if (parsed.success) quota = parsed.data;
  }
  throw new ApiError(`${label} failed with status ${res.status}`, res.status, quota);
}

function pageQuery(cursor: string | null): string {
  return cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : "?limit=100";
}

/** Walks a cursor-paginated endpoint until the last page. */
async function fetchAllPages<T>(
  fetchPage: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { items, nextCursor } = await fetchPage(cursor);
    all.push(...items);
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return all;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

export async function requestMagicLink(email: string): Promise<void> {
  const res = await apiFetch("/auth/magic-link", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
}

export async function verifyMagicLink(token: string): Promise<AuthUser> {
  const res = await apiFetch("/auth/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw new Error(`Verify failed with status ${res.status}`);
  }
  const data = (await res.json()) as { user: unknown };
  return authUserSchema.parse(data.user);
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const res = await apiFetch("/auth/me", { method: "GET" });
  if (res.status === 401) return null;
  if (!res.ok) {
    throw new Error(`Fetch user failed with status ${res.status}`);
  }
  const data = (await res.json()) as { user: unknown };
  return authUserSchema.parse(data.user);
}

export async function logout(): Promise<void> {
  const res = await apiFetch("/auth/logout", { method: "POST" });
  if (!res.ok) {
    throw new Error(`Logout failed with status ${res.status}`);
  }
}

export async function logoutAll(): Promise<void> {
  const res = await apiFetch("/auth/logout-all", { method: "POST" });
  if (!res.ok) {
    throw new Error(`Logout all failed with status ${res.status}`);
  }
}

export function fetchNotebooks(): Promise<NotebookDto[]> {
  return fetchAllPages(async (cursor) => {
    const res = await apiFetch(`/notebooks${pageQuery(cursor)}`, { method: "GET" });
    if (!res.ok) await failed(res, "Fetch notebooks");
    const data = (await res.json()) as { notebooks: unknown[]; nextCursor: unknown };
    return {
      items: data.notebooks.map((item) => notebookSchema.parse(item)),
      nextCursor: nextCursorSchema.parse(data.nextCursor),
    };
  });
}

/** One page of a notebook's notes, after the note with id `cursor`. */
export async function fetchNotebookNotes(
  notebookId: string,
  cursor: string | null,
): Promise<{ notes: NoteSummary[]; nextCursor: string | null }> {
  const res = await apiFetch(
    `/notebooks/${encodeURIComponent(notebookId)}/notes${pageQuery(cursor)}`,
    { method: "GET" },
  );
  if (!res.ok) await failed(res, "Fetch notebook notes");
  const data = (await res.json()) as { notes: unknown[]; nextCursor: unknown };
  return {
    notes: data.notes.map((item) => noteSummarySchema.parse(item)),
    nextCursor: nextCursorSchema.parse(data.nextCursor),
  };
}

export async function createNotebook(input: CreateNotebookInput): Promise<NotebookDto> {
  const res = await apiFetch("/notebooks", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) await failed(res, "Create notebook");
  const data = (await res.json()) as { notebook: unknown };
  return notebookSchema.parse(data.notebook);
}

export async function updateNotebook(id: string, input: UpdateNotebookInput): Promise<NotebookDto> {
  const res = await apiFetch(`/notebooks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Update notebook failed with status ${res.status}`);
  }
  const data = (await res.json()) as { notebook: unknown };
  return notebookSchema.parse(data.notebook);
}

export async function deleteNotebook(id: string): Promise<void> {
  const res = await apiFetch(`/notebooks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Delete notebook failed with status ${res.status}`);
  }
}

export async function fetchNote(id: string): Promise<NoteDto> {
  const res = await apiFetch(`/notes/${encodeURIComponent(id)}`, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Fetch note failed with status ${res.status}`);
  }
  const data = (await res.json()) as { note: unknown };
  return noteSchema.parse(data.note);
}

export async function createNote(input: CreateNoteInput): Promise<NoteDto> {
  const res = await apiFetch("/notes", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) await failed(res, "Create note");
  const data = (await res.json()) as { note: unknown };
  return noteSchema.parse(data.note);
}

export async function updateNote(id: string, input: UpdateNoteInput): Promise<NoteDto> {
  const res = await apiFetch(`/notes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Update note failed with status ${res.status}`);
  }
  const data = (await res.json()) as { note: unknown };
  return noteSchema.parse(data.note);
}

export async function deleteNote(id: string): Promise<void> {
  const res = await apiFetch(`/notes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Delete note failed with status ${res.status}`);
  }
}

export function fetchQuestions(noteId: string): Promise<QuestionDto[]> {
  return fetchAllPages(async (cursor) => {
    const res = await apiFetch(
      `/notes/${encodeURIComponent(noteId)}/questions${pageQuery(cursor)}`,
      { method: "GET" },
    );
    if (!res.ok) await failed(res, "Fetch questions");
    const data = (await res.json()) as { questions: unknown[]; nextCursor: unknown };
    return {
      items: data.questions.map((item) => questionSchema.parse(item)),
      nextCursor: nextCursorSchema.parse(data.nextCursor),
    };
  });
}

export async function createQuestion(
  noteId: string,
  input: CreateQuestionInput,
): Promise<QuestionDto> {
  const res = await apiFetch(`/notes/${encodeURIComponent(noteId)}/questions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) await failed(res, "Create question");
  const data = (await res.json()) as { question: unknown };
  return questionSchema.parse(data.question);
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const res = await apiFetch(`/questions/${encodeURIComponent(questionId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Delete question failed with status ${res.status}`);
  }
}

export async function fetchDueReviews(): Promise<ReviewCardDto[]> {
  const res = await apiFetch("/reviews/due", { method: "GET" });
  if (!res.ok) {
    throw new Error(`Fetch due reviews failed with status ${res.status}`);
  }
  const data = (await res.json()) as { cards: unknown[] };
  return data.cards.map((item) => reviewCardSchema.parse(item));
}

export async function submitReview(
  reviewItemId: string,
  rating: ReviewRating,
): Promise<{ ok: true; nextDue: string; scheduledDays: number }> {
  const res = await apiFetch(`/reviews/${encodeURIComponent(reviewItemId)}/submit`, {
    method: "POST",
    body: JSON.stringify({ rating }),
  });
  if (!res.ok) {
    throw new Error(`Submit review failed with status ${res.status}`);
  }
  return (await res.json()) as { ok: true; nextDue: string; scheduledDays: number };
}

export async function enqueueStudyErrors(
  noteId: string,
  questionIds: string[],
): Promise<{ enqueued: number }> {
  const res = await apiFetch("/reviews/study-errors", {
    method: "POST",
    body: JSON.stringify({ noteId, questionIds }),
  });
  if (!res.ok) {
    throw new Error(`Enqueue study errors failed with status ${res.status}`);
  }
  return (await res.json()) as { enqueued: number };
}

export async function createTextSource(input: CreateTextSourceInput): Promise<SourceDto> {
  const res = await apiFetch("/sources/text", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) await failed(res, "Create source");
  const data = (await res.json()) as { source: unknown };
  return sourceSchema.parse(data.source);
}

export async function fetchSource(sourceId: string): Promise<SourceDto> {
  const res = await apiFetch(`/sources/${encodeURIComponent(sourceId)}`, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Fetch source failed with status ${res.status}`);
  }
  const data = (await res.json()) as { source: unknown };
  return sourceSchema.parse(data.source);
}

export async function uploadFileSource(input: {
  notebookId: string;
  file: File;
  title?: string;
}): Promise<SourceDto> {
  const form = new FormData();
  form.append("notebookId", input.notebookId);
  if (input.title?.trim()) {
    form.append("title", input.title.trim());
  }
  form.append("file", input.file);

  const res = await fetch(`${API_URL}/sources/file`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) await failed(res, "Upload PDF source");
  const data = (await res.json()) as { source: unknown };
  return sourceSchema.parse(data.source);
}

export async function fetchSourceFileUrl(sourceId: string): Promise<string> {
  const res = await apiFetch(`/sources/${encodeURIComponent(sourceId)}/file`, { method: "GET" });
  if (!res.ok) await failed(res, "Fetch source file URL");
  const data = (await res.json()) as { url: string };
  return data.url;
}

export async function createLinkSource(input: CreateLinkSourceInput): Promise<SourceDto> {
  const res = await apiFetch("/sources/link", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) await failed(res, "Create link source");
  const data = (await res.json()) as { source: unknown };
  return sourceSchema.parse(data.source);
}

export async function deleteSource(sourceId: string): Promise<void> {
  const res = await apiFetch(`/sources/${encodeURIComponent(sourceId)}`, {
    method: "DELETE",
  });
  if (!res.ok) await failed(res, "Delete source");
}

export async function searchNotebook(
  notebookId: string,
  q: string,
  limit = 10,
): Promise<SearchHitDto[]> {
  const params = new URLSearchParams({
    notebookId,
    q,
    limit: String(limit),
  });
  const res = await apiFetch(`/search?${params.toString()}`, { method: "GET" });
  if (!res.ok) await failed(res, "Search notebook");
  const data = (await res.json()) as { hits: unknown[] };
  return data.hits.map((hit) => searchHitSchema.parse(hit));
}
