export const OPENROUTER_CHANNEL = "margem:openrouter";

export interface OpenRouterTabMessage {
  type: "openrouter-result";
  result: string;
}

export function isOpenRouterTabMessage(value: unknown): value is OpenRouterTabMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as { type?: unknown; result?: unknown };
  return message.type === "openrouter-result" && typeof message.result === "string";
}

export function openBlankTab(): Window | null {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  return tab;
}

export function announceOpenRouterResult(result: string): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(OPENROUTER_CHANNEL);
  channel.postMessage({ type: "openrouter-result", result } satisfies OpenRouterTabMessage);
  channel.close();
}
