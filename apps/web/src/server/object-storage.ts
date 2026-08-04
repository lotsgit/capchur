import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  SignedImageDownload,
  SignedImageUpload,
} from "@capchur/contracts";

import type { StoredObjectRecord } from "./persistence-repository";

const SIGNED_URL_LIFETIME_MS = 5 * 60 * 1_000;

export interface ObjectStorage {
  issueUpload(record: StoredObjectRecord): Promise<SignedImageUpload>;
  issueDownload(record: StoredObject): Promise<SignedImageDownload>;
  put(object: StoredObject, bytes: Uint8Array): Promise<void>;
  read(objectKey: string): Promise<Uint8Array>;
  delete(objectKeys: string[]): Promise<void>;
  receiveUpload?(request: Request, token: string): Promise<Response>;
  serveDownload?(token: string): Promise<Response>;
}

export interface StoredObject {
  objectKey: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
}

interface LocalTokenPayload {
  action: "upload" | "download";
  objectKey: string;
  expiresAt: number;
  mimeType: string;
  byteLength: number;
  sha256: string;
}

function encodeToken(payload: LocalTokenPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function decodeToken(token: string, secret: string): LocalTokenPayload | null {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) {
    return null;
  }

  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const providedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    providedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(providedBytes, expectedBytes)
  ) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const payload = parsed as Partial<LocalTokenPayload>;
    if (
      (payload.action !== "upload" && payload.action !== "download") ||
      typeof payload.objectKey !== "string" ||
      typeof payload.expiresAt !== "number" ||
      typeof payload.mimeType !== "string" ||
      typeof payload.byteLength !== "number" ||
      typeof payload.sha256 !== "string"
    ) {
      return null;
    }
    return payload as LocalTokenPayload;
  } catch {
    return null;
  }
}

export class LocalObjectStorage implements ObjectStorage {
  private readonly root: string;

  constructor(root: string, private readonly signingSecret: string) {
    if (signingSecret.length < 32) {
      throw new Error("CAPCHUR_SIGNING_SECRET must have at least 32 characters");
    }
    this.root = resolve(root);
  }

  async issueUpload(record: StoredObjectRecord): Promise<SignedImageUpload> {
    const expiresAt = Date.now() + SIGNED_URL_LIFETIME_MS;
    const token = encodeToken({
      action: "upload",
      objectKey: record.objectKey,
      expiresAt,
      mimeType: record.mimeType,
      byteLength: record.byteLength,
      sha256: record.sha256,
    }, this.signingSecret);
    return {
      objectKey: record.objectKey,
      uploadUrl: `/api/images/content?token=${encodeURIComponent(token)}`,
      method: "PUT",
      expiresAt,
      headers: { "content-type": record.mimeType },
    };
  }

  async issueDownload(record: StoredObject): Promise<SignedImageDownload> {
    const expiresAt = Date.now() + SIGNED_URL_LIFETIME_MS;
    const token = encodeToken({
      action: "download",
      objectKey: record.objectKey,
      expiresAt,
      mimeType: record.mimeType,
      byteLength: record.byteLength,
      sha256: record.sha256,
    }, this.signingSecret);
    return {
      downloadUrl: `/api/images/content?token=${encodeURIComponent(token)}`,
      expiresAt,
    };
  }

  async receiveUpload(request: Request, token: string): Promise<Response> {
    const payload = decodeToken(token, this.signingSecret);
    if (!payload || payload.action !== "upload" || payload.expiresAt < Date.now()) {
      return Response.json({ error: "Invalid or expired upload" }, { status: 401 });
    }

    const bytes = Buffer.from(await request.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (
      bytes.byteLength !== payload.byteLength ||
      digest !== payload.sha256 ||
      request.headers.get("content-type") !== payload.mimeType
    ) {
      return Response.json({ error: "Upload metadata does not match" }, { status: 400 });
    }

    const path = this.pathFor(payload.objectKey);
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporaryPath, bytes, { flag: "wx" });
    await rename(temporaryPath, path);
    return new Response(null, { status: 204 });
  }

  async put(object: StoredObject, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength !== object.byteLength ||
      createHash("sha256").update(bytes).digest("hex") !== object.sha256) {
      throw new Error("Object metadata does not match content");
    }
    const path = this.pathFor(object.objectKey);
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporaryPath, bytes, { flag: "wx" });
    await rename(temporaryPath, path);
  }

  async read(objectKey: string): Promise<Uint8Array> {
    return readFile(this.pathFor(objectKey));
  }

  async serveDownload(token: string): Promise<Response> {
    const payload = decodeToken(token, this.signingSecret);
    if (!payload || payload.action !== "download" || payload.expiresAt < Date.now()) {
      return Response.json({ error: "Invalid or expired download" }, { status: 401 });
    }

    try {
      const bytes = await readFile(this.pathFor(payload.objectKey));
      return new Response(bytes, {
        headers: {
          "content-type": payload.mimeType,
          "content-length": String(bytes.byteLength),
          "cache-control": "private, no-store",
        },
      });
    } catch {
      return Response.json({ error: "Image not found" }, { status: 404 });
    }
  }

  async delete(objectKeys: string[]): Promise<void> {
    await Promise.all(objectKeys.map((objectKey) =>
      rm(this.pathFor(objectKey), { force: true }),
    ));
  }

  private pathFor(objectKey: string): string {
    const path = resolve(this.root, objectKey);
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) {
      throw new Error("Invalid object key");
    }
    return path;
  }
}

export class S3ObjectStorage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async issueUpload(record: StoredObjectRecord): Promise<SignedImageUpload> {
    const expiresAt = Date.now() + SIGNED_URL_LIFETIME_MS;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: record.objectKey,
      ContentType: record.mimeType,
      ContentLength: record.byteLength,
      ChecksumSHA256: Buffer.from(record.sha256, "hex").toString("base64"),
    });
    return {
      objectKey: record.objectKey,
      uploadUrl: await getSignedUrl(this.client, command, { expiresIn: 300 }),
      method: "PUT",
      expiresAt,
      headers: { "content-type": record.mimeType },
    };
  }

  async issueDownload(record: StoredObject): Promise<SignedImageDownload> {
    return {
      downloadUrl: await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: record.objectKey }),
        { expiresIn: 300 },
      ),
      expiresAt: Date.now() + SIGNED_URL_LIFETIME_MS,
    };
  }

  async put(object: StoredObject, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength !== object.byteLength ||
      createHash("sha256").update(bytes).digest("hex") !== object.sha256) {
      throw new Error("Object metadata does not match content");
    }
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: object.objectKey,
      Body: bytes,
      ContentType: object.mimeType,
      ContentLength: object.byteLength,
      ChecksumSHA256: Buffer.from(object.sha256, "hex").toString("base64"),
    }));
  }

  async read(objectKey: string): Promise<Uint8Array> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    }));
    if (!response.Body) throw new Error("Object content is missing");
    return response.Body.transformToByteArray();
  }

  async delete(objectKeys: string[]): Promise<void> {
    await Promise.all(objectKeys.map((objectKey) =>
      this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey })),
    ));
  }
}

export function createEnvironmentObjectStorage(): ObjectStorage {
  const bucket = process.env.S3_BUCKET;
  if (bucket) {
    return new S3ObjectStorage(new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "us-east-1",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    }), bucket);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("S3_BUCKET is required in production");
  }

  const root = join(process.env.CAPCHUR_DATA_DIR ?? join(process.cwd(), ".data"), "objects");
  return new LocalObjectStorage(root, process.env.CAPCHUR_SIGNING_SECRET ?? "");
}