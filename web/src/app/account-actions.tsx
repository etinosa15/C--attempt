"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

// Right to erasure. Guarded by an explicit confirm; the export link next to it lets
// the learner keep a copy first.
export function AccountActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function deleteAccount() {
    if (!window.confirm("Delete your account and all progress? This cannot be undone."))
      return;
    setBusy(true);
    const res = await fetch("/api/account", { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      router.push("/login");
      router.refresh();
    } else {
      window.alert("Could not delete the account. Please try again.");
    }
  }

  return (
    <button className={styles.danger} type="button" onClick={deleteAccount} disabled={busy}>
      {busy ? "Deleting…" : "Delete account"}
    </button>
  );
}
