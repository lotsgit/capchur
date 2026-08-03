import { createEnvironmentAuthenticator } from "./auth";
import { PersistenceApi } from "./api";
import { getDatabase } from "./db";
import { createEnvironmentObjectStorage } from "./object-storage";
import { createPersistenceRepository } from "./persistence-repository";

const globalRuntime = globalThis as typeof globalThis & {
  capchurPersistenceApi?: Promise<PersistenceApi>;
};

async function createPersistenceApi(): Promise<PersistenceApi> {
  const database = await getDatabase();
  return new PersistenceApi(
    createEnvironmentAuthenticator(),
    createPersistenceRepository(database),
    createEnvironmentObjectStorage(),
  );
}

export function getPersistenceApi(): Promise<PersistenceApi> {
  globalRuntime.capchurPersistenceApi ??= createPersistenceApi();
  return globalRuntime.capchurPersistenceApi;
}

export async function handleLocalUpload(request: Request): Promise<Response> {
  const storage = createEnvironmentObjectStorage();
  const token = new URL(request.url).searchParams.get("token");
  if (!token || !storage.receiveUpload) {
    return Response.json({ error: "Local upload is unavailable" }, { status: 404 });
  }
  return storage.receiveUpload(request, token);
}

export async function handleLocalDownload(request: Request): Promise<Response> {
  const storage = createEnvironmentObjectStorage();
  const token = new URL(request.url).searchParams.get("token");
  if (!token || !storage.serveDownload) {
    return Response.json({ error: "Local download is unavailable" }, { status: 404 });
  }
  return storage.serveDownload(token);
}