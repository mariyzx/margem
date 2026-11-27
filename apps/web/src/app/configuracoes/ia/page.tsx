"use client";

import type { AiFeatures, AiPromptTarget, AiSettings } from "@margem/shared";
import { Button, Field, Skeleton, Toast, ToastClose, ToastTitle } from "@margem/ui";
import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { SwitchRow } from "../../../components/ai/switch-row";
import { ThemeToggle } from "../../../components/theme-toggle";
import { Wordmark } from "../../../components/wordmark";
import {
  AiCredentialError,
  fetchAiSettings,
  fetchCurrentUser,
  removeAiCredential,
  saveGroqKey,
  updateAiSettings,
} from "../../../lib/api";
import { messages } from "../../../messages/pt-br";

const FEATURE_KEYS: Array<keyof AiFeatures> = [
  "suggestClozesQuestions",
  "gradeAnswers",
  "explainAfterError",
  "askNotebook",
];
const PROMPT_TARGETS: AiPromptTarget[] = ["claude", "chatgpt", "gemini"];
const GROQ_CONSOLE_URL = "https://console.groq.com/keys";

type Notice = { tone: "success" | "danger"; text: string } | null;

export default function AiSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = React.useState<AiSettings | null>(null);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice>(null);
  const latestChange = React.useRef(0);

  React.useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then(async (user) => {
        if (!user) {
          router.replace("/entrar");
          return;
        }
        const loaded = await fetchAiSettings();
        if (active) setSettings(loaded);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function applyChange(
    change: Partial<AiSettings>,
    input: Parameters<typeof updateAiSettings>[0],
  ) {
    if (!settings) return;
    const previous = settings;
    const changeId = ++latestChange.current;
    setSettings({ ...settings, ...change });
    try {
      const saved = await updateAiSettings(input);
      if (changeId === latestChange.current) setSettings(saved);
    } catch {
      if (changeId === latestChange.current) setSettings(previous);
      setNotice({ tone: "danger", text: messages.ai.saveError });
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/"
            className="text-sm font-medium text-ink-muted transition-colors duration-fast hover:text-ink"
          >
            {messages.ai.backToNotebooks}
          </Link>
        </div>
      </header>

      <h1 className="font-serif text-3xl font-semibold text-ink">{messages.ai.title}</h1>
      <p className="mt-2 mb-8 text-sm text-ink-muted">{messages.ai.intro}</p>

      {loadFailed ? (
        <p role="alert" className="text-sm text-danger">
          {messages.ai.loadError}
        </p>
      ) : !settings ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="rounded-lg border border-margin-rule bg-paper px-5 shadow-sm">
            <SwitchRow
              label={messages.ai.useAi}
              description={messages.ai.useAiDescription}
              checked={settings.enabled}
              onCheckedChange={(enabled) => void applyChange({ enabled }, { enabled })}
            />
          </section>

          <GroqKeySection
            settings={settings}
            onChange={(credentials) => setSettings({ ...settings, credentials })}
            onNotice={setNotice}
          />

          <section
            aria-labelledby="ai-features-title"
            className="rounded-lg border border-margin-rule bg-paper px-5 py-4 shadow-sm"
          >
            <h2 id="ai-features-title" className="text-sm font-semibold text-ink">
              {messages.ai.featuresTitle}
            </h2>
            {!settings.enabled ? (
              <p className="mt-1 text-xs text-ink-muted">{messages.ai.featuresDisabledHint}</p>
            ) : null}
            <div className="divide-y divide-margin-rule">
              {FEATURE_KEYS.map((key) => (
                <SwitchRow
                  key={key}
                  label={messages.ai.features[key]}
                  checked={settings.features[key]}
                  disabled={!settings.enabled}
                  onCheckedChange={(value) =>
                    void applyChange(
                      { features: { ...settings.features, [key]: value } },
                      { features: { [key]: value } },
                    )
                  }
                />
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-margin-rule bg-paper px-5 py-4 shadow-sm">
            <fieldset>
              <legend className="text-sm font-semibold text-ink">{messages.ai.promptTitle}</legend>
              <p className="mt-1 mb-3 text-xs text-ink-muted">{messages.ai.promptDescription}</p>
              <div className="flex flex-wrap gap-2">
                {PROMPT_TARGETS.map((target) => (
                  <label
                    key={target}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-margin-rule px-3 py-2 text-sm text-ink has-[:checked]:border-bic has-[:checked]:text-bic has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-bic"
                  >
                    <input
                      type="radio"
                      name="prompt-target"
                      value={target}
                      checked={settings.promptTarget === target}
                      onChange={() =>
                        void applyChange({ promptTarget: target }, { promptTarget: target })
                      }
                      className="accent-bic"
                    />
                    {messages.ai.promptTargets[target]}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
        </div>
      )}

      <Toast
        open={Boolean(notice)}
        onOpenChange={(open) => {
          if (!open) setNotice(null);
        }}
        variant={notice?.tone ?? "default"}
      >
        <ToastTitle>{notice?.text}</ToastTitle>
        <ToastClose />
      </Toast>
    </main>
  );
}

function GroqKeySection({
  settings,
  onChange,
  onNotice,
}: {
  settings: AiSettings;
  onChange: (credentials: AiSettings["credentials"]) => void;
  onNotice: (notice: Notice) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const groq = settings.credentials.find((credential) => credential.provider === "groq");
  const others = settings.credentials.filter((credential) => credential.provider !== "groq");

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = new FormData(form).get("groq-key");
    const apiKey = typeof value === "string" ? value.trim() : "";
    if (!apiKey) {
      setError(messages.ai.keyRequired);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const saved = await saveGroqKey(apiKey);
      form.reset();
      onChange([...others, saved]);
      onNotice({ tone: "success", text: messages.ai.keySaved });
    } catch (failure) {
      const reason = failure instanceof AiCredentialError ? failure.reason : "unknown";
      setError(messages.ai.keyErrors[reason]);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      await removeAiCredential("groq");
      onChange(others);
      onNotice({ tone: "success", text: messages.ai.keyRemoved });
    } catch {
      onNotice({ tone: "danger", text: messages.ai.removeError });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="ai-account-title"
      className="rounded-lg border border-margin-rule bg-paper px-5 py-4 shadow-sm"
    >
      <div className="flex items-baseline gap-2">
        <h2 id="ai-account-title" className="text-sm font-semibold text-ink">
          {messages.ai.accountTitle}
        </h2>
        <span className="text-xs text-ink-muted">{messages.ai.accountOptional}</span>
      </div>
      <p className="mt-1 mb-4 text-xs text-ink-muted">{messages.ai.accountDescription}</p>

      {groq ? (
        <div className="flex items-center justify-between gap-4 rounded-md border border-margin-rule px-3 py-2">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-correct" strokeWidth={1.5} aria-hidden="true" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-ink">{messages.ai.groqConnected}</span>
              <span className="text-xs text-ink-muted">{messages.ai.keyEnding(groq.keyLast4)}</span>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() => void handleRemove()}
          >
            {busy ? messages.ai.removingKey : messages.ai.removeKey}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => void handleSave(event)}
          noValidate
        >
          <Field
            label={messages.ai.groqKeyLabel}
            hint={messages.ai.groqKeyHint}
            error={error}
            type="password"
            name="groq-key"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy}>
              {busy ? messages.ai.testing : messages.ai.testAndSave}
            </Button>
            <a
              href={GROQ_CONSOLE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-bic underline-offset-4 hover:underline"
            >
              {messages.ai.groqConsoleLink}
            </a>
          </div>
        </form>
      )}
    </section>
  );
}
