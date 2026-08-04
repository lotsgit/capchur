import { getCollaborationApi } from "@/server/runtime";

interface RouteContext {
  params: Promise<{ guideId: string; shareId: string }>;
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { guideId, shareId } = await context.params;
  return (await getCollaborationApi()).shares(request, guideId, shareId);
}
