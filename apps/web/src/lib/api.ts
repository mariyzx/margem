import {
  authUserSchema,
  CreateQuestionInput,
  notebookSchema,
  noteSchema,
  QuestionDto,
  questionSchema,
  reviewCardSchema,
  type AuthUser,
  type CreateNotebookInput,
  type CreateNoteInput,
  type NotebookDto,
  type NoteDto,
  type ReviewCardDto,
  type ReviewRating,
  type UpdateNotebookInput,
  type UpdateNoteInput,
} from "@margem/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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

export async function fetchNotebooks(): Promise<NotebookDto[]> {
  const res = await apiFetch("/notebooks", { method: "GET" });
  if (!res.ok) {
    throw new Error(`Fetch notebooks failed with status ${res.status}`);
  }
  const data = (await res.json()) as { notebooks: unknown[] };
  return data.notebooks.map((item) => notebookSchema.parse(item));
}

export async function createNotebook(input: CreateNotebookInput): Promise<NotebookDto> {
  const res = await apiFetch("/notebooks", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Create notebook failed with status ${res.status}`);
  }
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
  if (!res.ok) {
    throw new Error(`Create note failed with status ${res.status}`);
  }
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

export async function fetchQuestions(noteId: string): Promise<QuestionDto[]> {
  const res = await apiFetch(`/notes/${encodeURIComponent(noteId)}/questions`, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Fetch questions failed with status ${res.status}`);
  }
  const data = (await res.json()) as { questions: unknown[] };
  return data.questions.map((item) => questionSchema.parse(item));
}

export async function createQuestion(
  noteId: string,
  input: CreateQuestionInput,
): Promise<QuestionDto> {
  const res = await apiFetch(`/notes/${encodeURIComponent(noteId)}/questions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Create question failed with status ${res.status}`);
  }
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
