"use client";

import { magicLinkRequestSchema } from "@margem/shared";
import { Button, Field, Toast, ToastClose, ToastDescription, ToastTitle } from "@margem/ui";
import * as React from "react";
import { Wordmark } from "../../components/wordmark";
import { ThemeToggle } from "../../components/theme-toggle";
import { requestMagicLink } from "../../lib/api";
import { messages } from "../../messages/pt-br";
const GOOGLE_LOGIN_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/google`;

export default function SignInPage() {
  const [email, setEmail] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | undefined>();
  const [loading, setLoading] = React.useState(false);
  const [toast, setToast] = React.useState<{
    open: boolean;
    variant: "success" | "danger";
    title: string;
    description: string;
  }>({ open: false, variant: "success", title: "", description: "" });

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "google") {
      setToast({
        open: true,
        variant: "danger",
        title: messages.auth.googleError,
        description: "",
      });
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(undefined);

    const parsed = magicLinkRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }

    setLoading(true);
    try {
      await requestMagicLink(parsed.data.email);
      setToast({
        open: true,
        variant: "success",
        title: messages.auth.sentTitle,
        description: messages.auth.sentDescription,
      });
    } catch {
      setToast({
        open: true,
        variant: "danger",
        title: messages.auth.genericError,
        description: "",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="rounded-lg border border-margin-rule bg-paper p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-start gap-2">
          <div className="flex w-full items-center justify-between">
            <Wordmark />
            <ThemeToggle />
          </div>
          <h1 className="font-sans text-lg font-medium text-ink">{messages.auth.title}</h1>
          <p className="text-sm text-ink-muted">{messages.auth.subtitle}</p>
        </div>

        <div className="mb-5 flex flex-col gap-4">
          <Button asChild variant="secondary" className="w-full">
            <a href={GOOGLE_LOGIN_URL}>
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
                />
              </svg>
              <span>{messages.auth.continueWithGoogle}</span>
            </a>
          </Button>

          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span aria-hidden="true" className="h-px flex-1 bg-margin-rule" />
            <span>{messages.auth.orWithEmail}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-margin-rule" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <Field
            type="email"
            label={messages.auth.emailLabel}
            placeholder={messages.auth.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldError}
            autoComplete="email"
            required
          />
          <Button type="submit" loading={loading}>
            {loading ? messages.auth.sendingButton : messages.auth.submitButton}
          </Button>
        </form>
      </div>

      <Toast
        open={toast.open}
        onOpenChange={(open) => setToast((prev) => ({ ...prev, open }))}
        variant={toast.variant}
      >
        <div className="flex flex-col gap-1">
          <ToastTitle>{toast.title}</ToastTitle>
          {toast.description ? <ToastDescription>{toast.description}</ToastDescription> : null}
        </div>
        <ToastClose />
      </Toast>
    </main>
  );
}
