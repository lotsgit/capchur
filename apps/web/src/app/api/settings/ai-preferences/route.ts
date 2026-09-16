import { getAiPreferencesApi } from "@/server/runtime";

export async function GET(request: Request): Promise<Response> {
  return (await getAiPreferencesApi()).handle(request);
}

export async function PUT(request: Request): Promise<Response> {
  return (await getAiPreferencesApi()).handle(request);
}
