import { getCollaborationApi } from "@/server/runtime";

interface RouteContext {
  params: Promise<{ guideId: string }>;
}

async function handle(request: Request, context: RouteContext): Promise<Response> {
  const { guideId } = await context.params;
  return (await getCollaborationApi()).shares(request, guideId);
}

export const GET = handle;
export const POST = handle;
