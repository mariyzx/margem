import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { type Job, Queue, Worker } from "bullmq";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { chunkText } from "./chunk-text";

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

  constructor(private readonly prisma: PrismaService) {}

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

    const text = source.type === "text" ? (source.content ?? "") : "";
    if (!text.trim()) {
      throw new Error(`Unsupported or empty source content for type "${source.type}"`);
    }

    const chunks = chunkText(text);

    await this.prisma.$transaction(async (tx) => {
      await tx.sourceChunk.deleteMany({ where: { sourceId } });
      if (chunks.length > 0) {
        await tx.sourceChunk.createMany({
          data: chunks.map((chunk, ord) => ({
            sourceId,
            ord,
            text: chunk,
          })),
        });
      }
      await tx.source.update({
        where: { id: sourceId },
        data: { status: "ready", failureReason: null },
      });
    });

    this.logger.log({ sourceId, chunkCount: chunks.length }, "Source ingested");
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
