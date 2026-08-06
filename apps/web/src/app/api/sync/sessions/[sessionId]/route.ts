import { getExtensionApi } from "@/server/runtime";

export async function PUT(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await context.params;
  return (await getExtensionApi()).syncSession(request, sessionId);
}