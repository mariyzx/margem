"use client";

import type { AuthUser } from "@margem/shared";
import { Button, Skeleton } from "@margem/ui";
import { useRouter } from "next/navigation";
import * as React from "react";
import { fetchCurrentUser, logout, logoutAll } from "../lib/api";
import { messages } from "../messages/pt-br";

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then((current) => {
        if (!active) return;
        if (!current) {
          router.replace("/entrar");
          return;
        }
        setUser(current);
        setChecking(false);
      })
      .catch(() => {
        if (active) router.replace("/entrar");
      });
    return () => {
      active = false;
    };
  }, [router]);

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

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 px-6">
      <h1 className="font-serif text-3xl font-semibold text-ink">{messages.appName}</h1>
      <p className="text-sm text-ink-muted">
        {messages.auth.signedInAs} <span className="font-medium text-ink">{user.email}</span>
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={handleLogout}>
          {messages.auth.logout}
        </Button>
        <Button type="button" variant="ghost" onClick={handleLogoutAll}>
          {messages.auth.logoutAll}
        </Button>
      </div>
    </main>
  );
}
