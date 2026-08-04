import { createAuth, WorkspaceAuthenticator } from "./auth";
import { ExtensionApi, PersistenceApi } from "./api";
import { getDatabase } from "./db";
import { ExtensionAuthorizationService } from "./extension-auth";
import { ExportApi } from "./export-api";
import { createExportJobRepository } from "./export-job-repository";
import { ExportService } from "./export-service";
import { createEnvironmentObjectStorage } from "./object-storage";
import { createPersistenceRepository } from "./persistence-repository";

const globalRuntime = globalThis as typeof globalThis & {
  capchurAuth?: Promise<ReturnType<typeof createAuth>>;
  capchurExtensionApi?: Promise<ExtensionApi>;
  capchurExportApi?: Promise<ExportApi>;
  capchurExportService?: Promise<ExportService>;
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

async function createExportRuntime(): Promise<{ api: ExportApi; service: ExportService }> {
  const database = await getDatabase();
  const authenticator = await getWorkspaceAuthenticator();
  const guides = createPersistenceRepository(database);
  const jobs = createExportJobRepository(database);
  const storage = createEnvironmentObjectStorage();
  return {
    api: new ExportApi(authenticator, guides, jobs, storage),
    service: new ExportService(jobs, guides, storage),
  };
}

export function getExportApi(): Promise<ExportApi> {
  globalRuntime.capchurExportApi ??= createExportRuntime().then(({ api }) => api);
  return globalRuntime.capchurExportApi;
}

export function getExportService(): Promise<ExportService> {
  globalRuntime.capchurExportService ??= createExportRuntime().then(({ service }) => service);
  return globalRuntime.capchurExportService;
}