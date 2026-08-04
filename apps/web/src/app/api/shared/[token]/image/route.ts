import { getCollaborationApi } from "@/server/runtime";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { token } = await context.params;
  return (await getCollaborationApi()).sharedImage(request, token);
}
