import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { envSchema } from "../config/env";

/**
 * AES-256-GCM for users' AI keys (docs/06-ia.md, docs/10-seguranca.md "Chaves de IA").
 *
 * Stored format (one string in AiCredential.encryptedKey):
 *   v1.<iv>.<authTag>.<ciphertext>   (each part base64)
 *
 * - `v1` names the master key generation, so a rotation can re-encrypt in batch (v1 → v2).
 * - `context` is bound as AAD (`userId:provider`): a ciphertext copied into another
 *   user's row fails to decrypt instead of silently working there.
 */

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
/** 96-bit IV: the size GCM is designed for. Never reused with the same key. */
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

const keyEnvSchema = envSchema.pick({ AI_KEYS_MASTER_KEY: true });

/** Thrown when AI credentials can't be stored or read; the message never carries key material. */
export class CredentialCipherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialCipherError";
  }
}

/** Reads the master key at call time. No dev fallback: saving a credential needs a real key. */
export function loadMasterKey(): Buffer {
  const { AI_KEYS_MASTER_KEY } = keyEnvSchema.parse(process.env);
  if (!AI_KEYS_MASTER_KEY) {
    throw new CredentialCipherError("AI_KEYS_MASTER_KEY is not configured");
  }
  return Buffer.from(AI_KEYS_MASTER_KEY, "base64");
}

export function encryptCredential(plaintext: string, context: string, masterKey: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, iv, authTag, ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64")))
    .join(".");
}

export function decryptCredential(envelope: string, context: string, masterKey: Buffer): string {
  const [version, ivB64, tagB64, ciphertextB64, ...extra] = envelope.split(".");
  if (version !== VERSION || !ivB64 || !tagB64 || !ciphertextB64 || extra.length > 0) {
    throw new CredentialCipherError("Unsupported credential envelope");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new CredentialCipherError("Malformed credential envelope");
  }

  const decipher = createDecipheriv(ALGORITHM, masterKey, iv, { authTagLength: AUTH_TAG_BYTES });
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Node's message ("Unsupported state or unable to authenticate data") says nothing useful
    // and the cause stays out of logs on purpose: wrong key, wrong context or tampered data.
    throw new CredentialCipherError("Credential could not be decrypted");
  }
}

/** What the API may return about a stored key (docs/06-ia.md: only the last 4 characters). */
export function keyLast4(plaintext: string): string {
  return plaintext.slice(-4);
}
