import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import type { ImageType } from '@goh/validation';

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface PresignResult {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
}

/**
 * Storage driver interface. Image bytes never touch the API in production —
 * clients upload directly to object storage via a presigned URL.
 */
export interface StorageDriver {
  presignUpload(kind: ImageType, contentType: string, size: number): Promise<PresignResult>;
  /** Presign an upload for an optimization package file. */
  presignPackageUpload(filename: string, size: number): Promise<PresignResult>;
  /** Resolve a stored object key to its public URL. */
  publicUrl(objectKey: string): string;
  /**
   * Short-lived, capability-bounded URL for downloading one object. The local
   * driver issues an HMAC-signed URL validated by the API; S3 issues a
   * presigned GET. Package files are NEVER exposed via bare publicUrl.
   */
  signDownload(objectKey: string, ttlSeconds: number): Promise<string>;
}

/** How long a presigned upload stays usable. Long enough for a slow upload of
 *  a large package file, short enough that a leaked URL is not a standing grant. */
const UPLOAD_TTL_SECONDS = 15 * 60;

// ---------------------------------------------------------------------------
// Signed-URL helpers (local driver)
// ---------------------------------------------------------------------------

function signToken(objectKey: string, expiresAt: number): string {
  return createHmac('sha256', config.DOWNLOAD_SIGNING_SECRET).update(`${objectKey}|${expiresAt}`).digest('hex');
}

/** Validate a signed token — constant-time compare, rejects expired links. */
/** Upload tokens are scoped separately so a download URL can never be replayed
 *  as an upload grant (or vice versa). */
function signUploadToken(objectKey: string, expiresAt: number): string {
  return createHmac('sha256', config.DOWNLOAD_SIGNING_SECRET).update(`upload|${objectKey}|${expiresAt}`).digest('hex');
}

/** Build the signed PUT path for an object key, valid for `ttlSeconds`. */
export function signedUploadPath(objectKey: string, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `/api/v1/uploads/put/${exp}/${signUploadToken(objectKey, exp)}/${objectKey}`;
}

/** Constant-time check that this PUT was actually authorised by a presign. */
export function verifySignedUpload(objectKey: string, expiresAt: number, signature: string): boolean {
  if (!Number.isInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signUploadToken(objectKey, expiresAt), 'hex');
  const given = Buffer.from(signature, 'hex');
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export function verifySignedDownload(objectKey: string, expiresAt: number, signature: string): boolean {
  if (!Number.isInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signToken(objectKey, expiresAt), 'hex');
  const given = Buffer.from(signature, 'hex');
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

// ---------------------------------------------------------------------------
// Local driver (development) — files written to UPLOAD_DIR, served by the API.
// ---------------------------------------------------------------------------

class LocalStorageDriver implements StorageDriver {
  constructor(private readonly dir: string, private readonly baseUrl: string) {
    mkdirSync(this.dir, { recursive: true });
  }

  async presignUpload(kind: ImageType, contentType: string): Promise<PresignResult> {
    const ext = EXT_BY_TYPE[contentType] ?? 'bin';
    const objectKey = `${kind}/${randomUUID()}.${ext}`;
    const publicUrl = this.publicUrl(objectKey);
    const uploadUrl = `${this.baseUrl}${signedUploadPath(objectKey, UPLOAD_TTL_SECONDS)}`;
    return { uploadUrl, objectKey, publicUrl };
  }

  async presignPackageUpload(filename: string): Promise<PresignResult> {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `packages/${randomUUID()}/${safe}`;
    const publicUrl = this.publicUrl(objectKey);
    const uploadUrl = `${this.baseUrl}${signedUploadPath(objectKey, UPLOAD_TTL_SECONDS).replace('/uploads/put/', '/uploads/packages/put/')}`;
    return { uploadUrl, objectKey, publicUrl };
  }

  publicUrl(objectKey: string): string {
    return `${this.baseUrl}/uploads/${objectKey}`;
  }

  async signDownload(objectKey: string, ttlSeconds: number): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = signToken(objectKey, expiresAt);
    return `${this.baseUrl}/api/v1/uploads/signed/${expiresAt}/${sig}/${objectKey}`;
  }

  resolveDiskPath(objectKey: string): string {
    // Reject path traversal — keys are server-generated but validate anyway.
    const normalized = path.normalize(objectKey);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw new Error('Invalid object key');
    }
    return path.join(this.dir, normalized);
  }
}

// ---------------------------------------------------------------------------
// S3 / Cloudflare R2 driver (production)
// ---------------------------------------------------------------------------

class S3StorageDriver implements StorageDriver {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string;

  constructor() {
    if (!config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY || !config.S3_BUCKET || !config.S3_PUBLIC_BASE_URL) {
      throw new Error('S3 storage requires S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET and S3_PUBLIC_BASE_URL');
    }
    this.bucket = config.S3_BUCKET;
    this.publicBase = config.S3_PUBLIC_BASE_URL.replace(/\/$/, '');
    this.client = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(config.S3_ENDPOINT),
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  async presignUpload(kind: ImageType, contentType: string, size: number): Promise<PresignResult> {
    const ext = EXT_BY_TYPE[contentType] ?? 'bin';
    const objectKey = `games/${kind}/${randomUUID()}.${ext}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType,
      ContentLength: size,
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 60 * 10 });
    return { uploadUrl, objectKey, publicUrl: this.publicUrl(objectKey) };
  }

  async presignPackageUpload(filename: string, size: number): Promise<PresignResult> {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `packages/${randomUUID()}/${safe}`;
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, ContentLength: size });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 60 * 10 });
    return { uploadUrl, objectKey, publicUrl: this.publicUrl(objectKey) };
  }

  publicUrl(objectKey: string): string {
    return `${this.publicBase}/${objectKey}`;
  }

  async signDownload(objectKey: string, ttlSeconds: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: objectKey });
    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }
}

function buildDriver(): StorageDriver {
  if (config.STORAGE_DRIVER === 's3') return new S3StorageDriver();
  return new LocalStorageDriver(path.resolve(config.UPLOAD_DIR), config.PUBLIC_API_URL.replace(/\/$/, ''));
}

export const storage: StorageDriver = buildDriver();

/** Exposes the local driver's disk resolution — only meaningful in local mode. */
export function resolveLocalPath(objectKey: string): string {
  const driver = storage as LocalStorageDriver;
  return driver.resolveDiskPath(objectKey);
}
