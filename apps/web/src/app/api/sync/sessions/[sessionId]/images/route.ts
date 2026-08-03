import { getExtensionApi } from "@/server/runtime";

interface SessionImageRouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function POST(
  request: Request,
  context: SessionImageRouteContext,
): Promise<Response> {
  const { sessionId } = await context.params;
  return (await getExtensionApi()).attachImage(request, sessionId);
}