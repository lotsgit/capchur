import { getExtensionApi } from "@/server/runtime";

export async function PUT(
  request: Request,
  context: RouteContext<"/api/sync/sessions/[sessionId]">,
): Promise<Response> {
  const { sessionId } = await context.params;
  return (await getExtensionApi()).syncSession(request, sessionId);
}