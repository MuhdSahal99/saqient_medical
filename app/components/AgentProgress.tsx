import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import styles from "./AgentProgress.module.css";

const STEPS = [
  { name: "Redaction", detail: "Removing identifiers before any AI sees the note" },
  { name: "Extraction agent", detail: "Reading the note and quoting the evidence for each finding" },
  { name: "Coding agent", detail: "Choosing codes from the payer's code set only" },
  { name: "Verifier agent", detail: "Independently re-checking every suggested code" },
  { name: "Pre-auth agent", detail: "Checking prior approval and medical necessity" },
  { name: "Rules engine and risk model", detail: "Applying payer rules and scoring denial risk" },
];

// Shown while the pipeline runs. The steps advance on a timer because the
// pipeline runs as one server call; the real per-agent trace appears after.
export const AgentProgress = ({ className }: { className?: string }) => {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
      <h2 className={styles.title}>The agents are working on this claim</h2>
      <ol className={styles.list}>
        {STEPS.map((s, i) => (
          <li key={s.name} className={i < step ? styles.done : i === step ? styles.current : styles.todo}>
            <span className={styles.icon}>{i < step ? <Check size={14} /> : i === step ? <Loader2 size={14} className={styles.spin} /> : i + 1}</span>
            <span>
              <span className={styles.name}>{s.name}</span>
              <span className={styles.detail}>{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};