import { handleLocalDownload, handleLocalUpload } from "@/server/runtime";

export const GET = handleLocalDownload;
export const PUT = handleLocalUpload;