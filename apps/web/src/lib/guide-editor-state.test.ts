import { describe, expect, it } from "vitest";

import type { Guide } from "@/lib/contracts";
import {
  addGuideStep,
  deleteGuideStep,
  duplicateGuideStep,
  moveGuideStep,
  updateGuideDetails,
  updateGuideStep,
} from "@/lib/guide-editor-state";

const guide: Guide = {
  version: 1,
  id: "0198f1d0-c184-7000-8000-000000000201",
  title: "Original guide",
  description: "Original summary",
  introduction: "Original introduction",
  branding: { name: "Capchur", accentColor: "#164c3b", logoUrl: null },
  updatedAt: 100,
  steps: [
    {
      id: "0198f1d0-c184-7000-8000-000000000202",
      position: 0,
      title: "First",
      description: "First description",
      section: null,
      media: null,
      annotation: null,
    },
    {
      id: "0198f1d0-c184-7000-8000-000000000203",
      position: 1,
      title: "Second",
      description: "Second description",
      section: null,
      media: null,
      annotation: null,
    },
  ],
};

describe("guide editor state", () => {
  it("reorders steps and normalizes their positions", () => {
    const moved = moveGuideStep(guide, guide.steps[1].id, -1, 200);

    expect(moved.steps.map(({ title, position }) => ({ title, position }))).toEqual([
      { title: "Second", position: 0 },
      { title: "First", position: 1 },
    ]);
    expect(moved.updatedAt).toBe(200);
    expect(guide.steps[0].title).toBe("First");
  });

  it("keeps the same guide when a move is outside the list", () => {
    expect(moveGuideStep(guide, guide.steps[0].id, -1, 200)).toBe(guide);
  });

  it("updates guide and selected-step copy immutably", () => {
    const renamed = updateGuideDetails(
      guide,
      {
        title: "New guide",
        description: "New summary",
        introduction: guide.introduction,
        branding: guide.branding,
      },
      200,
    );
    const edited = updateGuideStep(
      renamed,
      guide.steps[0].id,
      { title: "Updated first", description: "Updated description" },
      300,
    );

    expect(edited.title).toBe("New guide");
    expect(edited.steps[0].title).toBe("Updated first");
    expect(edited.updatedAt).toBe(300);
    expect(guide.title).toBe("Original guide");
  });

  it("adds, duplicates, and deletes steps with normalized positions", () => {
    const added = addGuideStep(guide, "0198f1d0-c184-7000-8000-000000000204", 200);
    const duplicated = duplicateGuideStep(
      added,
      guide.steps[0].id,
      "0198f1d0-c184-7000-8000-000000000205",
      300,
    );
    const deleted = deleteGuideStep(duplicated, guide.steps[1].id, 400);

    expect(added.steps.at(-1)?.title).toBe("Untitled step");
    expect(duplicated.steps[1]).toMatchObject({ title: "First", position: 1 });
    expect(deleted.steps.map((step) => step.position)).toEqual([0, 1, 2]);
    expect(guide.steps).toHaveLength(2);
  });

  it("updates section and privacy metadata without changing media", () => {
    const media = {
      type: "image" as const,
      source: "/image.png",
      width: 800,
      height: 600,
      alt: "Source",
    };
    const withMedia: Guide = {
      ...guide,
      steps: [{
        ...guide.steps[0],
        media,
        annotation: {
          rect: { x: 20, y: 20, width: 100, height: 50 },
          coordinateSpace: "image-pixels",
          hidden: false,
          crop: null,
          redactions: [],
        },
      }],
    };
    const edited = updateGuideStep(withMedia, withMedia.steps[0].id, {
      section: "Setup",
      annotation: {
        ...withMedia.steps[0].annotation!,
        crop: { x: 10, y: 10, width: 700, height: 500 },
        redactions: [{
          id: "0198f1d0-c184-7000-8000-000000000206",
          rect: { x: 40, y: 40, width: 120, height: 30 },
        }],
      },
    }, 200);

    expect(edited.steps[0].annotation?.redactions).toHaveLength(1);
    expect(edited.steps[0].section).toBe("Setup");
    expect(edited.steps[0].media).toBe(media);
  });
});