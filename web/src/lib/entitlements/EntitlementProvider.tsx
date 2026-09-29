"use client";

// The server resolves the entitlement once (in learn/layout.tsx, from the trusted
// subscriptions row) and hands it down as plain, non-secret capability data. This
// context makes that same value available to any client screen under /learn — the
// lesson paywall, the Overview certificate button, future gated affordances —
// without prop-drilling or a client refetch. It is a read-only mirror for UX;
// decisions that MUST hold are re-checked server-side on the gated action route.
//
// Parallels ProgressProvider: one instance per /learn subtree, fed by the layout.
import { createContext, useContext } from "react";
import type { Entitlement } from "./types";

const EntitlementContext = createContext<Entitlement | null>(null);

export function EntitlementProvider({
  entitlement,
  children,
}: {
  entitlement: Entitlement | null;
  children: React.ReactNode;
}) {
  return (
    <EntitlementContext.Provider value={entitlement}>
      {children}
    </EntitlementContext.Provider>
  );
}

/**
 * The current learner's entitlement, or null when signed out (the local-only Free
 * experience) or before it has resolved. Gating helpers in ./gating treat null as
 * the Free floor, so callers can pass this straight through.
 */
export function useEntitlement(): Entitlement | null {
  return useContext(EntitlementContext);
}
