import type { ElementMetadata } from "@capchur/contracts";

export type SupportedCaptureAction = "click" | "input" | "select" | "submit";

export type RejectedElementReason = "sensitive" | "unsupported";

export type ElementAnalysis =
    | {
          supported: true;
          description: string;
          metadata: ElementMetadata;
      }
    | {
          supported: false;
          reason: RejectedElementReason;
      };

const ACTIONABLE_ROLES = new Set([
    "button",
    "checkbox",
    "combobox",
    "link",
    "menuitem",
    "option",
    "radio",
    "slider",
    "spinbutton",
    "switch",
    "tab",
    "textbox",
]);

const UNSUPPORTED_TAGS = new Set([
    "area",
    "base",
    "canvas",
    "embed",
    "head",
    "html",
    "iframe",
    "meta",
    "object",
    "script",
    "style",
    "template",
]);

const SENSITIVE_AUTOCOMPLETE_TOKENS = new Set([
    "cc-csc",
    "cc-exp",
    "cc-exp-month",
    "cc-exp-year",
    "cc-number",
    "current-password",
    "new-password",
    "one-time-code",
]);

const normalizeText = (value: string | null | undefined): string | undefined => {
    const normalized = value?.replace(/\s+/g, " ").trim();
    return normalized ? normalized.slice(0, 500) : undefined;
};

const escapeAttributeValue = (value: string): string =>
    value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const escapeIdentifier = (value: string): string => {
    let result = "";

    for (const [index, character] of Array.from(value).entries()) {
        const isSafe = /[a-zA-Z0-9_-]/.test(character);
        const needsNumericEscape = index === 0 && /[0-9]/.test(character);
        result += isSafe && !needsNumericEscape
            ? character
            : `\\${character.codePointAt(0)?.toString(16)} `;
    }

    return result;
};

const isQueryableRoot = (node: Node): node is Node & ParentNode =>
    "querySelector" in node && typeof node.querySelector === "function";

const getComposedParent = (element: Element): Element | null => {
    if (element.parentElement) {
        return element.parentElement;
    }

    const root = element.getRootNode();
    return "host" in root && root.host instanceof Element ? root.host : null;
};

const hasSensitiveAutocomplete = (element: Element): boolean => {
    const tokens = element
        .getAttribute("autocomplete")
        ?.toLowerCase()
        .split(/\s+/);
    return tokens?.some((token) => SENSITIVE_AUTOCOMPLETE_TOKENS.has(token)) ?? false;
};

export const isSensitiveElement = (element: Element): boolean => {
    const tagName = element.tagName.toLowerCase();
    const inputType = element.getAttribute("type")?.toLowerCase();
    const fieldName = `${element.getAttribute("name") ?? ""} ${element.id}`;

    return (
        (tagName === "input" && inputType === "password") ||
        hasSensitiveAutocomplete(element) ||
        /(?:password|passwd|passcode|credit.?card|card.?number|security.?code|\bcvv\b|\bcvc\b)/i.test(
            fieldName,
        )
    );
};

const isNativeActionable = (element: Element): boolean => {
    const tagName = element.tagName.toLowerCase();
    if (["a", "button", "select", "summary", "textarea"].includes(tagName)) {
        return true;
    }

    if (tagName !== "input") {
        return false;
    }

    return element.getAttribute("type")?.toLowerCase() !== "hidden";
};

const resolveTarget = (target: Element): Element => {
    let current: Element | null = target;

    while (current) {
        const role = current.getAttribute("role")?.toLowerCase();
        if (isNativeActionable(current) || (role && ACTIONABLE_ROLES.has(role))) {
            return current;
        }
        current = getComposedParent(current);
    }

    return target;
};

const getLabelText = (element: Element): string | undefined => {
    const wrappingLabel = element.closest("label");
    if (wrappingLabel) {
        return normalizeText(wrappingLabel.textContent);
    }

    if (!element.id) {
        return undefined;
    }

    const root = element.getRootNode();
    if (!isQueryableRoot(root)) {
        return undefined;
    }

    const label = root.querySelector(
        `label[for="${escapeAttributeValue(element.id)}"]`,
    );
    return normalizeText(label?.textContent);
};

const getAriaName = (element: Element): string | undefined => {
    const labelledBy = element.getAttribute("aria-labelledby")?.trim();
    if (labelledBy) {
        const root = element.getRootNode();
        if (isQueryableRoot(root)) {
            const text = labelledBy
                .split(/\s+/)
                .map((id) =>
                    root.querySelector(
                        `[id="${escapeAttributeValue(id)}"]`,
                    ),
                )
                .map((label) => normalizeText(label?.textContent))
                .filter((value): value is string => Boolean(value))
                .join(" ");
            if (text) {
                return normalizeText(text);
            }
        }
    }

    return normalizeText(element.getAttribute("aria-label"));
};

const getNearbyContext = (element: Element): string | undefined => {
    const fieldset = element.closest("fieldset");
    const legend = fieldset?.querySelector(":scope > legend");
    if (legend) {
        return normalizeText(legend.textContent);
    }

    const previous = element.previousElementSibling;
    if (previous?.matches("label, legend, h1, h2, h3, h4, h5, h6")) {
        return normalizeText(previous.textContent);
    }

    return undefined;
};

export const getElementName = (element: Element): string | undefined => {
    const canUseTextContent = !element.matches("input, select, textarea");
    return getAriaName(element) ??
        getLabelText(element) ??
        (canUseTextContent ? normalizeText(element.textContent) : undefined) ??
        normalizeText(element.getAttribute("alt")) ??
        normalizeText(element.getAttribute("title")) ??
        normalizeText(element.getAttribute("placeholder")) ??
        getNearbyContext(element);
};

export const getElementRole = (element: Element): string | undefined => {
    const explicitRole = normalizeText(element.getAttribute("role"));
    if (explicitRole) {
        return explicitRole.toLowerCase();
    }

    const tagName = element.tagName.toLowerCase();
    if (tagName === "a" && element.hasAttribute("href")) return "link";
    if (tagName === "button") return "button";
    if (tagName === "select") return "combobox";
    if (tagName === "textarea") return "textbox";
    if (tagName === "img") return "image";
    if (tagName !== "input") return undefined;

    const inputType = element.getAttribute("type")?.toLowerCase() ?? "text";
    if (["button", "reset", "submit"].includes(inputType)) return "button";
    if (inputType === "checkbox") return "checkbox";
    if (inputType === "radio") return "radio";
    if (inputType === "range") return "slider";
    return "textbox";
};

const getStructuralSelector = (element: Element): string => {
    const segments: string[] = [];
    let current: Element | null = element;

    while (current) {
        if (current.id) {
            segments.unshift(`#${escapeIdentifier(current.id)}`);
            break;
        }

        const tagName = current.tagName.toLowerCase();
        const siblings = current.parentElement
            ? Array.from(current.parentElement.children).filter(
                  (sibling) => sibling.tagName === current?.tagName,
              )
            : [];
        const position = siblings.indexOf(current) + 1;
        segments.unshift(
            siblings.length > 1 ? `${tagName}:nth-of-type(${position})` : tagName,
        );
        current = current.parentElement;
    }

    return segments.join(" > ");
};

const withShadowPath = (element: Element, selector: string): string => {
    const hosts: string[] = [];
    let root = element.getRootNode();

    while ("host" in root && root.host instanceof Element) {
        const host = root.host;
        hosts.unshift(getStructuralSelector(host));
        root = host.getRootNode();
    }

    return [...hosts, selector].join(" >>> ");
};

export const getLocatorCandidates = (element: Element): string[] => {
    const tagName = element.tagName.toLowerCase();
    const localCandidates: string[] = [];
    const addAttributeCandidate = (attribute: string): void => {
        const value = element.getAttribute(attribute);
        if (value) {
            localCandidates.push(
                `${tagName}[${attribute}="${escapeAttributeValue(value)}"]`,
            );
        }
    };

    if (element.id) localCandidates.push(`#${escapeIdentifier(element.id)}`);
    addAttributeCandidate("data-testid");
    addAttributeCandidate("data-test");
    addAttributeCandidate("aria-label");
    addAttributeCandidate("name");

    const role = element.getAttribute("role");
    if (role) {
        localCandidates.push(`[role="${escapeAttributeValue(role)}"]`);
    }
    localCandidates.push(getStructuralSelector(element));

    return Array.from(
        new Set(localCandidates.map((selector) => withShadowPath(element, selector))),
    ).slice(0, 10);
};

const getDescriptionNoun = (element: Element, role?: string): string => {
    if (role) return role;
    const tagName = element.tagName.toLowerCase();
    if (tagName === "img") return "image";
    return tagName === "a" ? "link" : "element";
};

export const describeElement = (
    element: Element,
    accessibleName = getElementName(element),
    role = getElementRole(element),
    action: SupportedCaptureAction = "click",
): string => {
    const noun = getDescriptionNoun(element, role);
    if (action === "input") {
        return accessibleName
            ? `Enter text in the ${accessibleName} ${noun}`
            : `Enter text in the ${noun}`;
    }
    if (action === "select") {
        return accessibleName
            ? `Select an option from the ${accessibleName} ${noun}`
            : `Select an option from the ${noun}`;
    }
    if (action === "submit") {
        return accessibleName ? `Submit the ${accessibleName} form` : "Submit the form";
    }
    return accessibleName
        ? `Click the ${accessibleName} ${noun}`
        : `Click the ${noun}`;
};

export const analyzeElement = (
    target: Element,
    action: SupportedCaptureAction = "click",
): ElementAnalysis => {
    const element = resolveTarget(target);

    if (isSensitiveElement(element)) {
        return { supported: false, reason: "sensitive" };
    }

    const tagName = element.tagName.toLowerCase();
    if (UNSUPPORTED_TAGS.has(tagName) || (tagName === "input" && element.getAttribute("type")?.toLowerCase() === "hidden")) {
        return { supported: false, reason: "unsupported" };
    }

    const accessibleName = getElementName(element);
    const role = getElementRole(element);
    const metadata: ElementMetadata = {
        tagName,
        selectors: getLocatorCandidates(element),
        ...(accessibleName ? { accessibleName } : {}),
        ...(role ? { role } : {}),
    };

    return {
        supported: true,
        description: describeElement(element, accessibleName, role, action),
        metadata,
    };
};