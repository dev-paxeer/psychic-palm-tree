import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';

let _s3: S3Client | null = null;

function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }
  return _s3;
}

/**
 * Upload a buffer to S3 and return the key.
 */
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const s3 = getS3();
  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

/**
 * Generate a pre-signed download URL (valid for 1 hour).
 */
export async function getDownloadUrl(key: string, expiresInSec = 3600): Promise<string> {
  const s3 = getS3();
  const command = new GetObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: expiresInSec });
}

/**
 * Upload a scaffold project archive and return its S3 key + download URL.
 */
export async function uploadScaffoldArchive(
  projectSlug: string,
  archiveBuffer: Buffer
): Promise<{ key: string; downloadUrl: string }> {
  const timestamp = Date.now();
  const key = `scaffolds/${projectSlug}-${timestamp}.tar.gz`;

  await uploadFile(key, archiveBuffer, 'application/gzip');
  const downloadUrl = await getDownloadUrl(key);

  return { key, downloadUrl };
}
