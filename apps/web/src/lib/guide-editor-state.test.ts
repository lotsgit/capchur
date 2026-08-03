import { describe, expect, it } from "vitest";

import type { Guide } from "@/lib/contracts";
import {
  moveGuideStep,
  updateGuideDetails,
  updateGuideStep,
} from "@/lib/guide-editor-state";

const guide: Guide = {
  version: 1,
  id: "0198f1d0-c184-7000-8000-000000000201",
  title: "Original guide",
  description: "Original summary",
  updatedAt: 100,
  steps: [
    {
      id: "0198f1d0-c184-7000-8000-000000000202",
      position: 0,
      title: "First",
      description: "First description",
      media: null,
      annotation: null,
    },
    {
      id: "0198f1d0-c184-7000-8000-000000000203",
      position: 1,
      title: "Second",
      description: "Second description",
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
      { title: "New guide", description: "New summary" },
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
});