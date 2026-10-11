import { ForgeLoader } from "@/components/loaders/ForgeLoader";
import { Spinner } from "@/components/loaders/Spinner";
import styles from "../dev.module.css";

export default function DevLoaders() {
  return (
    <>
      <h1 style={{ fontFamily: "var(--display)", margin: "0 0 0.5rem" }}>Loaders</h1>
      <p className={styles.lead}>
        Three signature concepts, SVG + CSS only, looping and theme-aware. <b>Ember ignition
        is the chosen signature</b> (the brand is an ember) — the others stay available for
        variety. Tiny inline spinner is for Run / Save / Sync. All honour reduced-motion.
      </p>

      <h2 className={styles.secTitle}>Signature + variants</h2>
      <div className={styles.loaderGrid}>
        <div className={`${styles.loaderCard} ${styles.signature}`}>
          <ForgeLoader variant="ember" size={84} label="Loading" />
          <h3>Ember ignition · signature</h3>
          <p>Flame draws in, fills warm, sparks rise.</p>
        </div>
        <div className={styles.loaderCard}>
          <ForgeLoader variant="anvil" size={84} label="Loading" />
          <h3>Anvil strike</h3>
          <p>Hammer falls, sparks burst, the mark stamps in.</p>
        </div>
        <div className={styles.loaderCard}>
          <ForgeLoader variant="molten" size={84} label="Loading" />
          <h3>Molten ring</h3>
          <p>Ring sweeps; a flame pulses at the centre.</p>
        </div>
      </div>

      <h2 className={styles.secTitle}>Compact — inline button states</h2>
      <div className={styles.btnRow}>
        <span className={styles.btnLoad}>
          <Spinner label="Running code" /> Running…
        </span>
        <span className={`${styles.btnLoad} ${styles.btnLoadGhost}`}>
          <Spinner /> Saving…
        </span>
        <span className={`${styles.btnLoad} ${styles.btnLoadGhost}`}>
          <Spinner /> Syncing…
        </span>
      </div>
    </>
  );
}
