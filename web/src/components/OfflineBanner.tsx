"use client";

// Thin notice shown while the browser reports no connection. Lessons already
// loaded keep working; sync resumes when the connection returns.
import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: "1rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        padding: "0.55rem 1rem",
        borderRadius: 999,
        background: "var(--surface, #fff)",
        color: "var(--ink, inherit)",
        border: "1px solid var(--line-strong, #ccc)",
        boxShadow: "var(--glass-shadow)",
        fontSize: "0.9rem",
      }}
    >
      You are offline. Your progress is saved on this device and will sync when you reconnect.
    </div>
  );
}
