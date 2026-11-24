import { Button } from "@margem/ui";
import { messages } from "../messages/pt-br";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 px-6">
      <h1 className="font-serif text-3xl font-semibold text-ink">{messages.appName}</h1>
      <p className="text-ink-muted">{messages.tagline}</p>
      <Button type="button">{messages.home.primaryAction}</Button>
    </main>
  );
}
