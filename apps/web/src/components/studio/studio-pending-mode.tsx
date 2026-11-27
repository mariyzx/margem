interface StudioPendingModeProps {
  title: string;
  description: string;
  detail: string | null;
}

export function StudioPendingMode({ title, description, detail }: StudioPendingModeProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-lg bg-paper p-8 shadow-xs">
      <h1 className="font-serif text-2xl font-semibold text-ink">{title}</h1>
      <p className="text-sm text-ink-muted">{detail ?? description}</p>
    </div>
  );
}
