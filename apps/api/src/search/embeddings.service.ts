import { Injectable, Logger } from "@nestjs/common";
import { loadEnv } from "../config/env";

const EMBED_TIMEOUT_MS = 10_000;

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  async embed(texts: string[]): Promise<number[][] | null> {
    if (texts.length === 0) return [];
    const env = loadEnv();
    if (!env.OLLAMA_URL) return null;

    const baseUrl = env.OLLAMA_URL.replace(/\/+$/, "");

    try {
      const res = await fetch(`${baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: env.OLLAMA_EMBED_MODEL,
          input: texts,
        }),
        signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
      });

      if (!res.ok) {
        this.logger.warn({ status: res.status }, "Ollama embed failed, falling back");
        return null;
      }

      const data = (await res.json()) as { embeddings?: number[][] };
      if (!Array.isArray(data.embeddings) || data.embeddings.length !== texts.length) {
        this.logger.warn("Unexpected Ollama embed response shape, falling back");
        return null;
      }

      return data.embeddings;
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Ollama unavailable, falling back",
      );
      return null;
    }
  }
}
