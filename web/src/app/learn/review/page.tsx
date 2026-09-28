import type { Metadata } from "next";
import { Review } from "./Review";

export const metadata: Metadata = {
  title: "Review deck — Forge Code Academy",
  description:
    "Active recall for the concepts you've learned. Rate each card honestly and it returns exactly when it's due.",
};

// The spaced-repetition deck. All state lives in the shared ProgressProvider, so
// this route is a thin shell around the client component — no server data.
export default function ReviewPage() {
  return <Review />;
}
