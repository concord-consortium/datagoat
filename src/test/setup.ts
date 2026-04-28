import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// jsdom's matchMedia is missing addEventListener / removeEventListener; the
// dashboard carousel + reduced-motion guards subscribe to mq.change events,
// so the polyfill matters even though no test file in this session needs it.
// Lives here so component tests in later steps just work.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

afterEach(() => {
  if (typeof localStorage !== "undefined") localStorage.clear();
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
});
