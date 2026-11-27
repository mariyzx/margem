"use client";

import { Skeleton } from "@margem/ui";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Wordmark } from "../../../../components/wordmark";
import { ApiError, finishOpenRouterConnection, OpenRouterConnectError } from "../../../../lib/api";
import { announceOpenRouterResult } from "../../../../lib/openrouter-tab";
import { messages } from "../../../../messages/pt-br";

const SETTINGS_PATH = "/configuracoes/ia";

export default function OpenRouterCallbackPage() {
  const router = useRouter();
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    window.history.replaceState(null, "", window.location.pathname);

    const done = (result: string) => {
      announceOpenRouterResult(result);
      router.replace(`${SETTINGS_PATH}?openrouter=${result}`);
    };
    if (!code || !state) {
      done(code ? "oauth_state_invalid" : "denied");
      return;
    }

    finishOpenRouterConnection(state, code)
      .then(() => done("connected"))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/entrar");
          return;
        }
        done(error instanceof OpenRouterConnectError ? error.reason : "unknown");
      });
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <Wordmark />
      <p role="status" className="text-sm text-ink-muted">
        {messages.ai.openRouterFinishing}
      </p>
      <Skeleton className="h-2 w-40" />
    </main>
  );
}
