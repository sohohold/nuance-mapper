import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(cleanup);

// ── jsdom gaps that the components depend on ─────────────────────────

// useIsMobile(). Defaults to the desktop branch; tests that need the
// compact layout override window.matchMedia themselves.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// React Flow keeps a node `visibility: hidden` until a ResizeObserver has
// reported its size. jsdom has neither ResizeObserver nor layout, so
// without these two shims every node stays invisible and unqueryable.
// The numbers are arbitrary but non-zero: geometry assertions belong in
// the Playwright suite, these tests only need the nodes to exist.
const MEASURED = { width: 96, height: 40 };

if (!global.ResizeObserver) {
  global.ResizeObserver = class {
    private targets = new Set<Element>();
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.targets.add(target);
      // Asynchronously, like the real thing: React Flow calls observe()
      // from an effect and updates its store from the callback
      queueMicrotask(() => {
        if (!this.targets.has(target)) return;
        this.callback(
          [
            {
              target,
              contentRect: target.getBoundingClientRect(),
            } as unknown as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        );
      });
    }
    unobserve(target: Element) {
      this.targets.delete(target);
    }
    disconnect() {
      this.targets.clear();
    }
  } as unknown as typeof ResizeObserver;
}

// jsdom already defines these getters — they just always return 0, which
// React Flow reads as "not measured yet".
for (const prop of ["offsetWidth", "offsetHeight"] as const) {
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    prop,
  )?.get;
  Object.defineProperty(HTMLElement.prototype, prop, {
    configurable: true,
    get() {
      const real = original?.call(this) ?? 0;
      if (real) return real;
      return prop === "offsetWidth" ? MEASURED.width : MEASURED.height;
    },
  });
}

const emptyRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function getRect(this: Element) {
  const rect = emptyRect.call(this);
  if (rect.width || rect.height) return rect;
  return {
    ...rect.toJSON?.(),
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    width: MEASURED.width,
    height: MEASURED.height,
    right: MEASURED.width,
    bottom: MEASURED.height,
    toJSON: () => ({}),
  } as DOMRect;
};

if (!global.DOMMatrixReadOnly) {
  global.DOMMatrixReadOnly = class {
    m22 = 1;
    constructor(_transform?: string) {}
  } as unknown as typeof DOMMatrixReadOnly;
}

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// Tailwind's stylesheet is not loaded here, so the utilities that re-enable
// pointer events on a node's dot would have no effect and user-event would
// refuse to click it. Declaring just these two keeps its pointer-events
// check meaningful instead of switching it off.
const utilities = document.createElement("style");
utilities.textContent = `
  .pointer-events-auto { pointer-events: auto; }
  .pointer-events-none { pointer-events: none; }
`;
document.head.appendChild(utilities);

// framer-motion and React Flow both drive animations from rAF.
if (!global.requestAnimationFrame) {
  global.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 0) as unknown as number;
  global.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

// jsdom has no clipboard; every test asserting a copy uses this spy.
if (!navigator.clipboard) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
}
