import { vizByLesson } from "@/components/viz/registry";
import styles from "../dev.module.css";

// Dev showcase of the Phase 4H visualization system — every registered lesson
// visualization in one place. These also render inline in their real lessons.
export default function DevViz() {
  return (
    <>
      <h1 style={{ fontFamily: "var(--display)", margin: "0 0 0.5rem" }}>Visualizations</h1>
      <p className={styles.lead}>
        One reusable, data-driven system: <code>CodeTracer</code>, <code>PipelineDiagram</code>,
        <code> TypeBox</code>, <code>PredictReveal</code> — keyboard-steppable (←/→/Space),
        narrated via aria-live, and manual-only under reduced motion. Each is wired into a
        real lesson by id.
      </p>
      {Object.entries(vizByLesson).map(([id, node]) => (
        <div key={id} style={{ marginBottom: "1.6rem" }}>
          <h2 className={styles.secTitle}>lesson: {id}</h2>
          {node}
        </div>
      ))}
    </>
  );
}
