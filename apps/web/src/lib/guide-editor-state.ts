import type { Guide, GuideStep } from "@/lib/contracts";

export type StepDirection = -1 | 1;

function normalizePositions(steps: GuideStep[]): GuideStep[] {
  return steps.map((step, position) => ({ ...step, position }));
}

export function addGuideStep(
  guide: Guide,
  stepId: string,
  updatedAt: number,
): Guide {
  return {
    ...guide,
    updatedAt,
    steps: [...guide.steps, {
      id: stepId,
      position: guide.steps.length,
      title: "Untitled step",
      description: "",
      section: null,
      media: null,
      annotation: null,
    }],
  };
}

export function duplicateGuideStep(
  guide: Guide,
  stepId: string,
  duplicateId: string,
  updatedAt: number,
): Guide {
  const sourceIndex = guide.steps.findIndex((step) => step.id === stepId);
  if (sourceIndex < 0) return guide;
  const steps = [...guide.steps];
  steps.splice(sourceIndex + 1, 0, {
    ...structuredClone(guide.steps[sourceIndex]),
    id: duplicateId,
  });
  return { ...guide, updatedAt, steps: normalizePositions(steps) };
}

export function deleteGuideStep(guide: Guide, stepId: string, updatedAt: number): Guide {
  if (!guide.steps.some((step) => step.id === stepId)) return guide;
  return {
    ...guide,
    updatedAt,
    steps: normalizePositions(guide.steps.filter((step) => step.id !== stepId)),
  };
}

export function moveGuideStep(
  guide: Guide,
  stepId: string,
  direction: StepDirection,
  updatedAt: number,
): Guide {
  const sourceIndex = guide.steps.findIndex((step) => step.id === stepId);
  const destinationIndex = sourceIndex + direction;

  if (
    sourceIndex < 0
    || destinationIndex < 0
    || destinationIndex >= guide.steps.length
  ) {
    return guide;
  }

  const steps = [...guide.steps];
  [steps[sourceIndex], steps[destinationIndex]] = [
    steps[destinationIndex],
    steps[sourceIndex],
  ];

  return {
    ...guide,
    updatedAt,
    steps: normalizePositions(steps),
  };
}

export function updateGuideDetails(
  guide: Guide,
  details: Pick<Guide, "title" | "description" | "introduction" | "branding">,
  updatedAt: number,
): Guide {
  return { ...guide, ...details, updatedAt };
}

export function updateGuideStep(
  guide: Guide,
  stepId: string,
  changes: Partial<Pick<GuideStep, "title" | "description" | "section" | "annotation">>,
  updatedAt: number,
): Guide {
  if (!guide.steps.some((step) => step.id === stepId)) {
    return guide;
  }

  return {
    ...guide,
    updatedAt,
    steps: guide.steps.map((step) => (
      step.id === stepId ? { ...step, ...changes } : step
    )),
  };
}