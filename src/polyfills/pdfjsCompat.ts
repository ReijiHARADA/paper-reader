/**
 * pdf.js 6 が要求する API のうち、Tauri の WKWebView に無いものを補う。
 * このファイルは pdf.js より先に評価される必要がある。
 */

type GetOrInsertComputed<K, V> = (key: K, valueFactory: () => V) => V;

function ensureMapGetOrInsertComputed() {
  const proto = Map.prototype as unknown as {
    getOrInsertComputed?: GetOrInsertComputed<unknown, unknown>;
  };
  if (proto.getOrInsertComputed) return;
  proto.getOrInsertComputed = function <K, V>(
    this: Map<K, V>,
    key: K,
    valueFactory: () => V
  ): V {
    if (this.has(key)) return this.get(key) as V;
    const value = valueFactory();
    this.set(key, value);
    return value;
  };
}

function ensureWeakMapGetOrInsertComputed() {
  const proto = WeakMap.prototype as unknown as {
    getOrInsertComputed?: (key: object, valueFactory: () => unknown) => unknown;
  };
  if (proto.getOrInsertComputed) return;
  proto.getOrInsertComputed = function <K extends object, V>(
    this: WeakMap<K, V>,
    key: K,
    valueFactory: () => V
  ): V {
    const existing = this.get(key);
    if (existing !== undefined) return existing;
    const value = valueFactory();
    this.set(key, value);
    return value;
  };
}

function ensurePromiseWithResolvers() {
  const PromiseCtor = Promise as unknown as {
    withResolvers?: <T>() => {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  };
  if (typeof PromiseCtor.withResolvers === "function") return;
  PromiseCtor.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

type IteratorHelpers = {
  toArray?: () => unknown[];
  join?: (separator?: string) => string;
  filter?: (
    predicate: (value: unknown, index: number) => unknown
  ) => IterableIterator<unknown>;
  map?: (
    mapper: (value: unknown, index: number) => unknown
  ) => IterableIterator<unknown>;
  flatMap?: (
    mapper: (value: unknown, index: number) => unknown
  ) => IterableIterator<unknown>;
  find?: (predicate: (value: unknown, index: number) => unknown) => unknown;
  forEach?: (fn: (value: unknown, index: number) => void) => void;
  some?: (predicate: (value: unknown, index: number) => unknown) => boolean;
  every?: (predicate: (value: unknown, index: number) => unknown) => boolean;
  take?: (limit: number) => IterableIterator<unknown>;
  drop?: (limit: number) => IterableIterator<unknown>;
  reduce?: (fn: (...args: unknown[]) => unknown, initial?: unknown) => unknown;
};

function collect(iterable: Iterable<unknown>): unknown[] {
  return Array.from(iterable);
}

function ensureIteratorHelpers(proto: object | null) {
  if (!proto) return;
  const target = proto as IteratorHelpers;

  if (typeof target.toArray !== "function") {
    target.toArray = function (this: Iterable<unknown>) {
      return collect(this);
    };
  }
  if (typeof target.join !== "function") {
    target.join = function (this: Iterable<unknown>, separator = ",") {
      return collect(this).join(separator);
    };
  }
  if (typeof target.filter !== "function") {
    target.filter = function (
      this: Iterable<unknown>,
      predicate: (value: unknown, index: number) => unknown
    ) {
      const out: unknown[] = [];
      let index = 0;
      for (const value of collect(this)) {
        if (predicate(value, index++)) out.push(value);
      }
      return out.values();
    };
  }
  if (typeof target.map !== "function") {
    target.map = function (
      this: Iterable<unknown>,
      mapper: (value: unknown, index: number) => unknown
    ) {
      return collect(this).map(mapper).values();
    };
  }
  if (typeof target.flatMap !== "function") {
    target.flatMap = function (
      this: Iterable<unknown>,
      mapper: (value: unknown, index: number) => unknown
    ) {
      return collect(this)
        .flatMap((value, index) => {
          const mapped = mapper(value, index);
          return mapped as never;
        })
        .values();
    };
  }
  if (typeof target.find !== "function") {
    target.find = function (
      this: Iterable<unknown>,
      predicate: (value: unknown, index: number) => unknown
    ) {
      let index = 0;
      for (const value of collect(this)) {
        if (predicate(value, index++)) return value;
      }
      return undefined;
    };
  }
  if (typeof target.forEach !== "function") {
    target.forEach = function (
      this: Iterable<unknown>,
      fn: (value: unknown, index: number) => void
    ) {
      collect(this).forEach(fn);
    };
  }
  if (typeof target.some !== "function") {
    target.some = function (
      this: Iterable<unknown>,
      predicate: (value: unknown, index: number) => unknown
    ) {
      return collect(this).some(predicate);
    };
  }
  if (typeof target.every !== "function") {
    target.every = function (
      this: Iterable<unknown>,
      predicate: (value: unknown, index: number) => unknown
    ) {
      return collect(this).every(predicate);
    };
  }
  if (typeof target.take !== "function") {
    target.take = function (this: Iterable<unknown>, limit: number) {
      return collect(this).slice(0, Math.max(0, limit)).values();
    };
  }
  if (typeof target.drop !== "function") {
    target.drop = function (this: Iterable<unknown>, limit: number) {
      return collect(this).slice(Math.max(0, limit)).values();
    };
  }
  if (typeof target.reduce !== "function") {
    target.reduce = function (
      this: Iterable<unknown>,
      fn: (...args: unknown[]) => unknown,
      initial?: unknown
    ) {
      const items = collect(this);
      return arguments.length >= 2 ? items.reduce(fn, initial) : items.reduce(fn);
    };
  }
}

ensureMapGetOrInsertComputed();
ensureWeakMapGetOrInsertComputed();
ensurePromiseWithResolvers();

try {
  const mapIterator = new Map().keys();
  const mapIteratorProto = Object.getPrototypeOf(mapIterator) as object | null;
  const iteratorProto = mapIteratorProto
    ? (Object.getPrototypeOf(mapIteratorProto) as object | null)
    : null;
  ensureIteratorHelpers(mapIteratorProto);
  ensureIteratorHelpers(iteratorProto);
  ensureIteratorHelpers(Object.getPrototypeOf(new Set().values()) as object | null);
  ensureIteratorHelpers(Object.getPrototypeOf([][Symbol.iterator]()) as object | null);
} catch {
  // ignore
}

const IteratorCtor = (globalThis as { Iterator?: { prototype?: object } }).Iterator;
if (IteratorCtor?.prototype) {
  ensureIteratorHelpers(IteratorCtor.prototype);
}

export {};
