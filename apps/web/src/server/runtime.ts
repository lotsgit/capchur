import { createAuth, WorkspaceAuthenticator } from "./auth";
import { ExtensionApi, PersistenceApi } from "./api";
import { getDatabase } from "./db";
import { ExtensionAuthorizationService } from "./extension-auth";
import { createEnvironmentObjectStorage } from "./object-storage";
import { createPersistenceRepository } from "./persistence-repository";

const globalRuntime = globalThis as typeof globalThis & {
  capchurAuth?: Promise<ReturnType<typeof createAuth>>;
  capchurExtensionApi?: Promise<ExtensionApi>;
  capchurPersistenceApi?: Promise<PersistenceApi>;
};

export function getAuth(): Promise<ReturnType<typeof createAuth>> {
  globalRuntime.capchurAuth ??= getDatabase().then(createAuth);
  return globalRuntime.capchurAuth;
}

export async function getWorkspaceAuthenticator(): Promise<WorkspaceAuthenticator> {
  const [database, auth] = await Promise.all([getDatabase(), getAuth()]);
  const extensionAuthorization = new ExtensionAuthorizationService(database.database);
  return new WorkspaceAuthenticator({
    getSession: (headers) => auth.api.getSession({ headers }),
  }, database.database, extensionAuthorization);
}

async function createExtensionApi(): Promise<ExtensionApi> {
  const database = await getDatabase();
  const authorization = new ExtensionAuthorizationService(database.database);
  return new ExtensionApi(
    new WorkspaceAuthenticator({
      getSession: async (headers) => (await getAuth()).api.getSession({ headers }),
    }, database.database, authorization),
    authorization,
    createPersistenceRepository(database),
  );
}

export function getExtensionApi(): Promise<ExtensionApi> {
  globalRuntime.capchurExtensionApi ??= createExtensionApi();
  return globalRuntime.capchurExtensionApi;
}

async function createPersistenceApi(): Promise<PersistenceApi> {
  const database = await getDatabase();
  return new PersistenceApi(
    await getWorkspaceAuthenticator(),
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