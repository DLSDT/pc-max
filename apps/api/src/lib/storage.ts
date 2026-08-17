import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
  /** Resolve a stored object key to its public URL. */
  publicUrl(objectKey: string): string;
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
    const uploadUrl = `${this.baseUrl}/api/v1/uploads/put/${objectKey}`;
    return { uploadUrl, objectKey, publicUrl };
  }

  publicUrl(objectKey: string): string {
    return `${this.baseUrl}/uploads/${objectKey}`;
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

  publicUrl(objectKey: string): string {
    return `${this.publicBase}/${objectKey}`;
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
