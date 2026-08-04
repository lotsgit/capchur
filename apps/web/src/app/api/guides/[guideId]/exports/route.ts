import { after } from "next/server";

import { getExportApi, getExportService } from "@/server/runtime";

export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ guideId: string }> },
): Promise<Response> {
  const response = await (await getExportApi()).enqueue(
    request,
    (await context.params).guideId,
  );
  if (response.status === 202) {
    after(async () => {
      await (await getExportService()).processAvailable();
    });
  }
  return response;
}
