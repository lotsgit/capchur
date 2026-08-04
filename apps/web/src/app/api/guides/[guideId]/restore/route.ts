import { getCollaborationApi } from "@/server/runtime";

interface RouteContext {
  params: Promise<{ guideId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { guideId } = await context.params;
  return (await getCollaborationApi()).restore(request, guideId);
}
