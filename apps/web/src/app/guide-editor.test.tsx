import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GuideEditor } from "@/app/guide-editor";
import type { Guide } from "@/lib/contracts";

const guide: Guide = {
  version: 1,
  id: "0198f1d0-c184-7000-8000-000000000301",
  title: "Publish an update",
  description: "Share a release.",
  introduction: "",
  branding: { name: "", accentColor: "#164c3b", logoUrl: null },
  updatedAt: 100,
  steps: [
    {
      id: "0198f1d0-c184-7000-8000-000000000302",
      position: 0,
      title: "Open releases",
      description: "Choose Releases.",
      section: null,
      media: null,
      annotation: null,
    },
    {
      id: "0198f1d0-c184-7000-8000-000000000303",
      position: 1,
      title: "Create update",
      description: "Choose New update.",
      section: null,
      media: null,
      annotation: null,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GuideEditor", () => {
  it("loads a fixture, edits the selected step, reorders, and saves", async () => {
    const user = userEvent.setup();
    render(<GuideEditor fixtureLoader={() => Promise.resolve(guide)} />);

    expect(screen.getByText("Opening your guide workspace")).toBeTruthy();
    const titleInput = await screen.findByLabelText("Step title");

    await user.clear(titleInput);
    await user.type(titleInput, "Open the release workspace");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Move Create update up" }));
    const stepList = screen.getByRole("list", { name: "Guide steps" });
    const steps = within(stepList).getAllByRole("listitem");
    expect(within(steps[0]).getByText("Create update")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(screen.getByText("Draft saved")).toBeTruthy();
    expect(screen.getByText("Preview saved")).toBeTruthy();
  });

  it("renders empty and failed fixture states", async () => {
    const emptyGuide = { ...guide, steps: [] };
    const { rerender } = render(
      <GuideEditor fixtureLoader={() => Promise.resolve(emptyGuide)} />,
    );

    expect(await screen.findByText("Your first step starts here")).toBeTruthy();

    rerender(<GuideEditor fixtureLoader={() => Promise.reject(new Error("bad fixture"))} />);
    await waitFor(() => expect(screen.getByText("Guide unavailable")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("edits privacy annotations, duplicates a step, and undoes changes", async () => {
    const user = userEvent.setup();
    const mediaGuide: Guide = {
      ...guide,
      steps: [{
        ...guide.steps[0],
        media: {
          type: "image",
          source: "/fixtures/release-workspace.svg",
          width: 800,
          height: 600,
          alt: "Release workspace",
        },
        annotation: {
          rect: { x: 10, y: 20, width: 100, height: 50 },
          coordinateSpace: "image-pixels",
          hidden: false,
          crop: null,
          redactions: [],
        },
      }],
    };
    render(<GuideEditor fixtureLoader={() => Promise.resolve(mediaGuide)} />);

    const highlightX = await screen.findByLabelText("Highlight x");
    await user.clear(highlightX);
    await user.type(highlightX, "42");
    await user.click(screen.getByRole("button", { name: "Add redaction" }));
    expect(screen.getByLabelText("Redacted area")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Hide highlight" }));
    expect(screen.queryByLabelText("Highlighted target")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByLabelText("Highlighted target")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(within(screen.getByRole("list", { name: "Guide steps" })).getAllByRole("listitem"))
      .toHaveLength(2);
  });

  it("keeps local changes when the server reports an edit conflict", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(guide))
      .mockResolvedValueOnce(Response.json(
        { error: { code: "EDIT_CONFLICT", message: "The guide changed" } },
        { status: 409 },
      ));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<GuideEditor guideId={guide.id} fixtureLoader={() => Promise.resolve(guide)} />);

    const titleInput = await screen.findByLabelText("Step title");
    await user.clear(titleInput);
    await user.type(titleInput, "My local edit");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText("Conflict: reload before saving")).toBeTruthy();
    expect((screen.getByLabelText("Step title") as HTMLInputElement).value).toBe("My local edit");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });
});