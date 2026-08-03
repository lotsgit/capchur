import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { GuideEditor } from "@/app/guide-editor";
import type { Guide } from "@/lib/contracts";

const guide: Guide = {
  version: 1,
  id: "0198f1d0-c184-7000-8000-000000000301",
  title: "Publish an update",
  description: "Share a release.",
  updatedAt: 100,
  steps: [
    {
      id: "0198f1d0-c184-7000-8000-000000000302",
      position: 0,
      title: "Open releases",
      description: "Choose Releases.",
      media: null,
      annotation: null,
    },
    {
      id: "0198f1d0-c184-7000-8000-000000000303",
      position: 1,
      title: "Create update",
      description: "Choose New update.",
      media: null,
      annotation: null,
    },
  ],
};

afterEach(cleanup);

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
});