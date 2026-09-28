import type { Metadata } from "next";
import { Playground } from "./Playground";

export const metadata: Metadata = {
  title: "Playground — Forge Code Academy",
  description:
    "A blank canvas for experiments: run JavaScript or C#, and wire up a real button in the isolated browser lab.",
};

// The experiment surface. All state lives in the shared ProgressProvider, so this
// route is a thin shell around the client component (which reads ?lang= itself).
export default function PlaygroundPage() {
  return <Playground />;
}
