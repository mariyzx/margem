"use client";

import { Button, Skeleton } from "@margem/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { verifyMagicLink } from "../../../lib/api";
import { messages } from "../../../messages/pt-br";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [failed, setFailed] = React.useState(false);

  const startedTokenRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!token) {
      setFailed(true);
      return;
    }
    if (startedTokenRef.current === token) {
      return;
    }
    startedTokenRef.current = token;

    verifyMagicLink(token)
      .then(() => {
        router.replace("/");
      })
      .catch(() => {
        setFailed(true);
      });
  }, [router, token]);

  if (failed) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-lg border border-margin-rule bg-paper p-8 shadow-sm">
        <h1 className="font-sans text-lg font-medium text-ink">{messages.auth.invalidLinkTitle}</h1>
        <p className="text-sm text-ink-muted">{messages.auth.invalidLinkDescription}</p>
        <Button asChild>
          <Link href="/entrar">{messages.auth.requestNewLink}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-margin-rule bg-paper p-8 shadow-sm">
      <p className="font-sans text-sm text-ink-muted">{messages.auth.verifying}</p>
      <Skeleton className="h-4 w-48" />
    </div>
  );
}

export default function VerifyMagicLinkPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <React.Suspense fallback={<Skeleton className="h-32 w-full" />}>
        <VerifyContent />
      </React.Suspense>
    </main>
  );
}
