import { authUserSchema, type AuthUser } from "@margem/shared";

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
