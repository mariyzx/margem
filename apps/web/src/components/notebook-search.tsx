"use client";

import type { SearchHitDto } from "@margem/shared";
import { FileText, Search, X } from "lucide-react";
import * as React from "react";
import { searchNotebook } from "../lib/api";
import { messages } from "../messages/pt-br";

interface NotebookSearchProps {
  notebookId: string;
  onSelectNote: (noteId: string) => void;
}

export function NotebookSearch({ notebookId, onSelectNote }: NotebookSearchProps) {
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<SearchHitDto[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setQuery("");
    setHits([]);
    setError(null);
  }, [notebookId]);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setHits([]);
      setError(null);
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchNotebook(notebookId, trimmed)
        .then((result) => setHits(result))
        .catch(() => setError(messages.search.error))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [notebookId, query]);

  return (
    <div className="relative mb-4">
      <div className="flex items-center gap-2 rounded-md border border-margin-rule bg-paper px-3 py-2 focus-within:border-bic">
        <Search className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.5} />
        <input
          type="search"
          aria-label={messages.search.placeholder}
          placeholder={messages.search.placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-transparent text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => setQuery("")}
            className="rounded p-0.5 text-ink-muted hover:text-ink"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        ) : null}
      </div>

      {query.trim() ? (
        <div className="mt-1.5 rounded-md border border-margin-rule bg-paper p-2 shadow-sm">
          {loading ? (
            <p className="px-2 py-1.5 text-xs text-ink-muted">{messages.search.searching}</p>
          ) : error ? (
            <p className="px-2 py-1.5 text-xs text-danger">{error}</p>
          ) : hits.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-ink-muted">{messages.search.empty}</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {hits.map((hit) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  {hit.kind === "note" && hit.noteId ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectNote(hit.noteId!);
                        setQuery("");
                      }}
                      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-margin"
                    >
                      <FileText
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bic"
                        strokeWidth={1.5}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-medium text-ink">{hit.title}</span>
                          <span className="rounded bg-margin px-1.5 py-0.5 text-[10px] text-ink-muted">
                            {messages.search.noteBadge}
                          </span>
                        </div>
                      </div>
                    </button>
                  ) : (
                    <div className="rounded px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-medium text-ink">{hit.title}</span>
                        <span className="rounded bg-margin px-1.5 py-0.5 text-[10px] text-ink-muted">
                          {messages.search.sourceBadge}
                          {hit.page ? ` · ${messages.search.pagePrefix}${hit.page}` : ""}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{hit.snippet}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
