import { GuideSchema, type Guide } from "@/lib/contracts";

const fixture = {
  version: 1,
  id: "0198f1d0-c184-7000-8000-000000000101",
  title: "Publish a product update",
  description: "Turn a finished release into a clear update for your workspace.",
  updatedAt: 1_754_198_400_000,
  steps: [
    {
      id: "0198f1d0-c184-7000-8000-000000000102",
      position: 0,
      title: "Open the release workspace",
      description: "Choose Releases from the workspace navigation.",
      media: {
        type: "image",
        source: "/fixtures/release-workspace.svg",
        width: 1440,
        height: 900,
        alt: "Deskflow workspace with Releases selected in the navigation",
      },
      annotation: {
        rect: { x: 38, y: 272, width: 218, height: 54 },
        coordinateSpace: "image-pixels",
        hidden: false,
      },
    },
    {
      id: "0198f1d0-c184-7000-8000-000000000103",
      position: 1,
      title: "Start a new update",
      description: "Select New update in the top-right corner.",
      media: {
        type: "image",
        source: "/fixtures/release-workspace.svg",
        width: 1440,
        height: 900,
        alt: "Deskflow release workspace with the New update button highlighted",
      },
      annotation: {
        rect: { x: 1174, y: 108, width: 202, height: 58 },
        coordinateSpace: "image-pixels",
        hidden: false,
      },
    },
    {
      id: "0198f1d0-c184-7000-8000-000000000104",
      position: 2,
      title: "Draft the release note",
      description: "Add a concise title and summarize the customer-facing changes.",
      media: {
        type: "image",
        source: "/fixtures/release-workspace.svg",
        width: 1440,
        height: 900,
        alt: "Deskflow release workspace showing the latest update draft",
      },
      annotation: {
        rect: { x: 304, y: 318, width: 1032, height: 136 },
        coordinateSpace: "image-pixels",
        hidden: false,
      },
    },
  ],
} as const;

export async function loadGuideFixture(): Promise<Guide> {
  await new Promise((resolve) => window.setTimeout(resolve, 240));
  return GuideSchema.parse(fixture);
}