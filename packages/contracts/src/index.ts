export type CaptureActionType =
    | "click"
    | "input"
    | "select"
    | "submit"
    | "keypress";

export interface ElementRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface CapturedStep {
    id: string;
    action: CaptureActionType;
    timestamp: number;
    url: string;
    pageTitle: string;
    description: string;
    accessibleName?: string;
    role?: string;
    selectors: string[];
    rect: ElementRect;
}
