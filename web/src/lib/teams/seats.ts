// Team seat math (PURE). How many seats a team has bought, how many its active
// members occupy, and whether another member can be added. No I/O — the route
// supplies the counts (member count needs a privileged read); this is just the
// arithmetic, so it's identical everywhere and unit-testable.

export interface SeatUsage {
  /** Seats purchased. */
  total: number;
  /** Seats occupied by active members. */
  used: number;
  /** Seats free to assign (never negative). */
  available: number;
  /** True when active members exceed purchased seats (billing must reconcile). */
  over: boolean;
}

/** Resolve purchased seats + active member count into a usage summary. */
export function resolveSeatUsage(seats: number, activeMembers: number): SeatUsage {
  const total = Math.max(0, Math.floor(seats));
  const used = Math.max(0, Math.floor(activeMembers));
  return {
    total,
    used,
    available: Math.max(0, total - used),
    over: used > total,
  };
}

/** Can another member take a seat right now? */
export function canAssignSeat(usage: SeatUsage): boolean {
  return usage.available > 0;
}
