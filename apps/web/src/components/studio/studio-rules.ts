import type { StudioSourceDto } from "@margem/shared";

export type MasteryLevel = "none" | "weak" | "growing" | "strong";

export function masteryLevel(mastery: number | null): MasteryLevel {
  if (mastery === null) return "none";
  if (mastery < 40) return "weak";
  if (mastery < 70) return "growing";
  return "strong";
}

export function weakestSource(sources: StudioSourceDto[]): StudioSourceDto | null {
  return sources.find((source) => source.status === "ready" && source.mastery !== null) ?? null;
}
