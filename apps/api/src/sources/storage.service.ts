import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { loadEnv } from "../config/env";

@Injectable()
export class StorageService {
  private getConfig() {
    const env = loadEnv();
    const accessKeyId = env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
    // No fallback to BACKUP_S3_*: a missing S3_BUCKET must fail loudly (503), never send
    // user uploads into the bucket that holds the Postgres dumps.
    const endpoint = env.S3_ENDPOINT;
    const bucket = env.S3_BUCKET;

    if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
      throw new ServiceUnavailableException("Object storage is not configured");
    }

    const client = new S3Client({
      region: env.AWS_DEFAULT_REGION,
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });

    return { client, bucket, isProd: env.NODE_ENV === "production" };
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const { client, bucket, isProd } = this.getConfig();
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      const code = (error as { name?: string }).name;
      if (!isProd && code === "NoSuchBucket") {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
          }),
        );
        return;
      }
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const { client, bucket } = this.getConfig();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const { client, bucket } = this.getConfig();
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) {
      throw new Error("Empty object body");
    }
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async getSignedDownloadUrl(
    key: string,
    filename: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    const { client, bucket } = this.getConfig();
    const safeFilename = filename.replace(/["\r\n]/g, "_");
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: "application/pdf",
      ResponseContentDisposition: `inline; filename="${safeFilename}"`,
    });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }
}
