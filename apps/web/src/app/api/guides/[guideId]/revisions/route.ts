import { getCollaborationApi } from "@/server/runtime";

interface RouteContext {
  params: Promise<{ guideId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { guideId } = await context.params;
  return (await getCollaborationApi()).revisions(request, guideId);
}
