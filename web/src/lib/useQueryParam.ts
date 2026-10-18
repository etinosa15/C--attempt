"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Read one query-string value on the client without useSearchParams (which would
 * force a Suspense boundary and opt a static page out of prerendering). The server
 * snapshot is null, so markup that depends on it renders after hydration.
 */
export function useQueryParam(name: string): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}
