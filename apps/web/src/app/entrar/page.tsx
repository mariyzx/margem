"use client";

import { magicLinkRequestSchema } from "@margem/shared";
import { Button, Field, Toast, ToastClose, ToastDescription, ToastTitle } from "@margem/ui";
import * as React from "react";
import { Wordmark } from "../../components/wordmark";
import { ThemeToggle } from "../../components/theme-toggle";
import { requestMagicLink } from "../../lib/api";
import { messages } from "../../messages/pt-br";

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
