import { getPersistenceApi } from "@/server/runtime";

interface SessionRouteContext {
  params: Promise<{ sessionId: string }>;
}

async function handle(request: Request, context: SessionRouteContext): Promise<Response> {
  const { sessionId } = await context.params;
  return (await getPersistenceApi()).session(request, sessionId);
}

export const GET = handle;
export const PUT = handle;
export const DELETE = handle;