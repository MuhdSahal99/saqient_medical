import type { EncounterStatus } from "../helpers/schema";
import styles from "./StatusPill.module.css";

const LABELS: Record<EncounterStatus, string> = {
  processing: "AI working",
  needs_review: "Needs review",
  ready: "Ready to approve",
  approved: "Approved",
  error: "Error",
};

export const StatusPill = ({ status, className }: { status: EncounterStatus; className?: string }) => (
  <span className={`${styles.pill} ${styles[status]} ${className ?? ""}`}>
    <span className={styles.dot} />
    {LABELS[status]}
  </span>
);