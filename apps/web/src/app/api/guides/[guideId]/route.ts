import { getPersistenceApi } from "@/server/runtime";

interface GuideRouteContext {
  params: Promise<{ guideId: string }>;
}

async function handle(request: Request, context: GuideRouteContext): Promise<Response> {
  const { guideId } = await context.params;
  return (await getPersistenceApi()).guide(request, guideId);
}

export const GET = handle;
export const PUT = handle;
export const DELETE = handle;