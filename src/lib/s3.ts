import { S3Client } from "@aws-sdk/client-s3";

export const s3Client = new S3Client({
  region: process.env.WASABI_REGION || "us-east-1",
  endpoint: process.env.WASABI_ENDPOINT || "https://s3.us-east-1.wasabisys.com",
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID!,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

export const S3_BUCKET = process.env.WASABI_BUCKET || "moisa-personal";
