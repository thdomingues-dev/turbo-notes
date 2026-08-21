import "@testing-library/jest-dom/vitest";

class ResizeObserverStub implements ResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

globalThis.ResizeObserver = ResizeObserverStub;

const storageValues = new Map<string, string>();
Object.defineProperties(Storage.prototype, {
  length: { configurable: true, get: () => storageValues.size },
  clear: { configurable: true, value: () => storageValues.clear() },
  getItem: {
    configurable: true,
    value: (key: string) => storageValues.get(key) ?? null,
  },
  key: {
    configurable: true,
    value: (index: number) => [...storageValues.keys()][index] ?? null,
  },
  removeItem: {
    configurable: true,
    value: (key: string) => storageValues.delete(key),
  },
  setItem: {
    configurable: true,
    value: (key: string, value: string) => storageValues.set(key, value),
  },
});

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: Object.create(Storage.prototype) as Storage,
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => null,
});
