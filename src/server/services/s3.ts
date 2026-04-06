import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, S3_BUCKET } from "@/lib/s3";

export async function generateSignedUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function generateSignedUrls(
  keys: string[],
  expiresIn: number = 3600
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    keys.map(async (key) => [key, await generateSignedUrl(key, expiresIn)] as const)
  );
  return Object.fromEntries(entries);
}
