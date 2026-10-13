import styles from "./RiskMeter.module.css";

// A single horizontal meter for denial risk or readiness. Tone follows meaning:
// for risk, higher is worse; for readiness, higher is better.
export const RiskMeter = ({
  value,
  kind = "risk",
  size = "md",
  showValue = true,
  className,
}: {
  value: number | null;
  kind?: "risk" | "readiness";
  size?: "sm" | "md";
  showValue?: boolean;
  className?: string;
}) => {
  if (value === null) return <span className={`${styles.none} ${className ?? ""}`}>Not scored</span>;
  const bad = kind === "risk" ? value >= 60 : value < 50;
  const mid = kind === "risk" ? value >= 30 && value < 60 : value >= 50 && value < 80;
  const tone = bad ? styles.high : mid ? styles.medium : styles.low;
  return (
    <span className={`${styles.wrap} ${styles[size]} ${className ?? ""}`}>
      <span className={styles.track} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={kind}>
        <span className={`${styles.fill} ${tone}`} style={{ width: `${Math.max(3, value)}%` }} />
      </span>
      {showValue && <span className={`${styles.value} ${tone}`}>{value}%</span>}
    </span>
  );
};