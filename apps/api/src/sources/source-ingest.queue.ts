import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { type Job, Queue, Worker } from "bullmq";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { chunkText } from "./chunk-text";
import { extractPdfPages, type PdfPageText } from "./pdf-text-extractor";
import { extractTextFromHtml, fetchSafeUrl } from "./ssrf-guard";
import { StorageService } from "./storage.service";
import { EmbeddingsService } from "../search/embeddings.service";
import { SearchIndexService } from "../search/search-index.service";

export const SOURCE_INGEST_QUEUE = "source-ingest";
export const SOURCE_INGEST_DLQ = "source-ingest-dlq";

export interface SourceIngestJobData {
  sourceId: string;
}

@Injectable()
export class SourceIngestQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SourceIngestQueue.name);
  private queue: Queue<SourceIngestJobData> | null = null;
  private dlq: Queue<SourceIngestJobData & { reason: string; failedAt: string }> | null = null;
  private worker: Worker<SourceIngestJobData> | null = null;

  /** Swappable in tests; production parses in a worker_thread (pdf-text-extractor.ts). */
  extractPages: (buffer: Buffer) => Promise<PdfPageText[]> = extractPdfPages;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Optional() private readonly embeddings?: EmbeddingsService,
    @Optional() private readonly searchIndex?: SearchIndexService,
  ) {}

  onModuleInit() {
    const env = loadEnv();
    if (env.NODE_ENV === "test") return;

    const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null as null };

    this.queue = new Queue<SourceIngestJobData>(SOURCE_INGEST_QUEUE, { connection });
    this.dlq = new Queue<SourceIngestJobData & { reason: string; failedAt: string }>(
      SOURCE_INGEST_DLQ,
      { connection },
    );

    this.worker = new Worker<SourceIngestJobData>(
      SOURCE_INGEST_QUEUE,
      async (job) => {
        await this.processJob(job.data.sourceId);
      },
      { connection, concurrency: 2 },
    );

    this.worker.on("failed", (job, err) => {
      void this.handleJobFailure(job, err);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.dlq?.close();
  }

  async enqueue(sourceId: string): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      "ingest",
      { sourceId },
      {
        jobId: sourceId,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: false,
      },
    );
  }

  async processJob(sourceId: string): Promise<void> {
    const source = await this.prisma.source.findUnique({
      where: { id: sourceId },
    });
    if (!source || source.deletedAt) return;

    await this.prisma.source.update({
      where: { id: sourceId },
      data: { status: "processing", failureReason: null },
    });

    const chunkEntries: Array<{ text: string; page: number | null }> = [];
    let resolvedTitle: string | undefined;

    if (source.type === "text") {
      const text = source.content ?? "";
      if (!text.trim()) {
        throw new Error('Empty source content for type "text"');
      }
      for (const piece of chunkText(text)) {
        chunkEntries.push({ text: piece, page: null });
      }
    } else if (source.type === "file") {
      if (!source.storageKey) {
        throw new Error("Missing storageKey for file source");
      }
      const pdfChunks = await this.extractPdfChunks(source.storageKey);
      chunkEntries.push(...pdfChunks);
    } else if (source.type === "link") {
      if (!source.url) {
        throw new Error("Missing url for link source");
      }
      const fetched = await fetchSafeUrl(source.url);
      const isHtml =
        fetched.contentType === "text/html" || fetched.contentType === "application/xhtml+xml";
      const extracted = isHtml
        ? extractTextFromHtml(fetched.body)
        : { title: null, text: fetched.body.trim() };

      if (extracted.title && source.title === new URL(source.url).hostname) {
        resolvedTitle = extracted.title.slice(0, 120);
      }
      for (const piece of chunkText(extracted.text)) {
        chunkEntries.push({ text: piece, page: null });
      }
    } else {
      throw new Error(`Unsupported source type "${source.type}"`);
    }

    if (chunkEntries.length === 0) {
      throw new Error("Source has no extractable text");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.sourceChunk.deleteMany({ where: { sourceId } });
      await tx.sourceChunk.createMany({
        data: chunkEntries.map((entry, ord) => ({
          sourceId,
          ord,
          text: entry.text,
          page: entry.page,
        })),
      });
      await tx.source.update({
        where: { id: sourceId },
        data: {
          status: "ready",
          failureReason: null,
          ...(resolvedTitle ? { title: resolvedTitle } : {}),
        },
      });
    });

    if (this.searchIndex) {
      try {
        const savedChunks = await this.prisma.sourceChunk.findMany({
          where: { sourceId },
          orderBy: { ord: "asc" },
          select: { id: true, ord: true, page: true, text: true },
        });
        const vectors = await this.embeddings?.embed(savedChunks.map((c) => c.text));
        await this.searchIndex.indexChunks(
          savedChunks.map((chunk, i) => ({
            id: chunk.id,
            sourceId,
            notebookId: source.notebookId,
            ord: chunk.ord,
            page: chunk.page,
            text: chunk.text,
            ...(vectors?.[i] ? { embedding: vectors[i] } : {}),
          })),
        );
      } catch (err) {
        this.logger.warn(
          { sourceId, error: err instanceof Error ? err.message : String(err) },
          "Search indexing failed, chunks remain in Postgres",
        );
      }
    }

    this.logger.log({ sourceId, chunkCount: chunkEntries.length }, "Source ingested");
  }

  private async extractPdfChunks(
    storageKey: string,
  ): Promise<Array<{ text: string; page: number | null }>> {
    const buffer = await this.storage.getObjectBuffer(storageKey);
    const pages = await this.extractPages(buffer);

    const entries: Array<{ text: string; page: number | null }> = [];
    for (const page of pages) {
      for (const piece of chunkText(page.text)) {
        entries.push({ text: piece, page: page.num });
      }
    }
    return entries;
  }

  private async handleJobFailure(
    job: Job<SourceIngestJobData> | undefined,
    err: Error,
  ): Promise<void> {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;

    const reason = err.message.slice(0, 300);
    await this.prisma.source.updateMany({
      where: { id: job.data.sourceId },
      data: { status: "failed", failureReason: reason },
    });

    await this.dlq?.add("failed-ingest", {
      sourceId: job.data.sourceId,
      reason,
      failedAt: new Date().toISOString(),
    });

    this.logger.error({ sourceId: job.data.sourceId, reason }, "Source ingestion moved to DLQ");
  }
}
