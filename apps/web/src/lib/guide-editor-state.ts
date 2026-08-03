import type { Guide, GuideStep } from "@/lib/contracts";

export type StepDirection = -1 | 1;

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
    steps: steps.map((step, position) => ({ ...step, position })),
  };
}

export function updateGuideDetails(
  guide: Guide,
  details: Pick<Guide, "title" | "description">,
  updatedAt: number,
): Guide {
  return { ...guide, ...details, updatedAt };
}

export function updateGuideStep(
  guide: Guide,
  stepId: string,
  changes: Pick<GuideStep, "title" | "description">,
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