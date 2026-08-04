import { after } from "next/server";

import { getExportApi, getExportService } from "@/server/runtime";

export const maxDuration = 300;

async function handle(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const response = await (await getExportApi()).job(
    request,
    (await context.params).jobId,
  );
  if (request.method === "GET" || (request.method === "POST" && response.ok)) {
    after(async () => {
      await (await getExportService()).processAvailable();
    });
  }
  return response;
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
