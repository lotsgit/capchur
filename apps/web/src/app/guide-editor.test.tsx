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

  it("queues an export, polls its status, and presents the signed download", async () => {
    const job = {
      id: "0198f1d0-c184-7000-8000-000000000399",
      guideId: guide.id,
      format: "pdf",
      status: "queued",
      attempts: 0,
      createdAt: 200,
      updatedAt: 200,
      expiresAt: 86_400_200,
      error: null,
      downloadUrl: null,
    } as const;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(guide))
      .mockResolvedValueOnce(Response.json(job, { status: 202 }))
      .mockResolvedValueOnce(Response.json({
        ...job,
        status: "completed",
        attempts: 1,
        updatedAt: 300,
        downloadUrl: "/api/images/content?token=signed-export",
      }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<GuideEditor
      guideId={guide.id}
      fixtureLoader={() => Promise.resolve(guide)}
      identity={{ name: "Owner", role: "owner" }}
    />);

    await screen.findByLabelText("Step title");
    await user.click(screen.getByRole("button", { name: "PDF" }));
    expect(await screen.findByText("PDF export queued")).toBeTruthy();
    const download = await screen.findByRole("link", { name: "Download" }, { timeout: 3_000 });

    expect(download.getAttribute("href")).toBe("/api/images/content?token=signed-export");
    expect(fetchMock).toHaveBeenCalledWith(`/api/guides/${guide.id}/exports`, expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith(`/api/exports/${job.id}`);
  });

  it("requires opt-in and keeps the deterministic description when AI falls back", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(guide))
      .mockResolvedValueOnce(Response.json({
        description: guide.steps[0].description,
        source: "deterministic",
        fallbackReason: "provider-failure",
      }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<GuideEditor
      guideId={guide.id}
      fixtureLoader={() => Promise.resolve(guide)}
      identity={{ name: "Owner", role: "owner" }}
    />);

    const description = await screen.findByLabelText("Supporting detail") as HTMLTextAreaElement;
    const improve = screen.getByRole("button", { name: "Improve description" });
    expect(improve.hasAttribute("disabled")).toBe(true);

    await user.click(screen.getByRole("checkbox", { name: "Enable AI for this editing session" }));
    await user.click(improve);

    expect(await screen.findByText("Original kept - AI unavailable")).toBeTruthy();
    expect(description.value).toBe(guide.steps[0].description);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/ai/descriptions", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        consent: true,
        deterministicDescription: guide.steps[0].description,
        stepTitle: guide.steps[0].title,
        section: null,
      }),
    }));
  });
});