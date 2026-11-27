"use client";

import type { AiPromptTarget } from "@margem/shared";
import { Button } from "@margem/ui";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { fetchAiSettings } from "../../lib/api";
import { HANDOFF_TARGETS } from "../../lib/prompt-handoff";
import { messages } from "../../messages/pt-br";

const text = messages.handoff;
const DEFAULT_TARGET: AiPromptTarget = "claude";

function usePromptTarget(): AiPromptTarget {
  const [target, setTarget] = React.useState<AiPromptTarget>(DEFAULT_TARGET);
  React.useEffect(() => {
    let active = true;
    fetchAiSettings()
      .then((settings) => {
        if (active) setTarget(settings.promptTarget);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return target;
}

type CopyState = "idle" | "copied" | "failed";

interface PromptHandoffProps {
  prompt: string | null;
}

export function PromptHandoff({ prompt }: PromptHandoffProps) {
  const target = HANDOFF_TARGETS[usePromptTarget()];
  const [copy, setCopy] = React.useState<CopyState>("idle");
  const fieldId = React.useId();

  React.useEffect(() => {
    setCopy("idle");
  }, [prompt]);

  async function handleClick() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopy("copied");
    } catch {
      setCopy("failed");
    } finally {
      window.open(target.url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-margin-rule bg-paper p-3">
      <p className="text-xs leading-relaxed text-ink-muted">{text.intro}</p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="self-start"
        loading={prompt === null}
        disabled={prompt === null}
        onClick={() => void handleClick()}
      >
        {prompt === null ? text.preparing : text.copyAndOpen(target.name)}
        {prompt === null ? null : (
          <ExternalLink className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
        )}
      </Button>
      <p role="status" className="text-xs text-ink-muted empty:hidden">
        {copy === "copied" ? text.copied(target.name) : copy === "failed" ? text.copyFailed : ""}
      </p>
      {prompt ? (
        <details open={copy === "failed"} className="text-xs">
          <summary className="cursor-pointer font-medium text-ink-muted hover:text-ink">
            {text.showPrompt}
          </summary>
          <label htmlFor={fieldId} className="sr-only">
            {text.promptLabel}
          </label>
          <textarea
            id={fieldId}
            readOnly
            value={prompt}
            rows={8}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 w-full resize-y rounded-md border border-margin-rule bg-margin p-2 font-mono text-[11px] leading-relaxed text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic"
          />
        </details>
      ) : null}
      <Link
        href="/configuracoes/ia"
        className="self-start text-xs font-medium text-bic underline-offset-4 hover:underline"
      >
        {text.changeTarget}
      </Link>
    </div>
  );
}
