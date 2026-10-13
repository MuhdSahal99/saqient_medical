import { Helmet } from "react-helmet";
import { toast } from "sonner";
import { Switch } from "../components/Switch";
import { Skeleton } from "../components/Skeleton";
import { claimQueries } from "../helpers/claimQueries";
import { useAuth } from "../helpers/useAuth";
import { format } from "../helpers/format";
import styles from "./rules.module.css";

const SEVERITY: Record<string, string> = { block: "Blocks payment", warn: "Denial risk", info: "Note" };

export default function RulesPage() {
  const { authState } = useAuth();
  const isAdmin = authState.type === "authenticated" && authState.user.role === "admin";
  const { data, isFetching, error } = claimQueries.useRules();
  const toggle = claimQueries.useToggleRule();

  return (
    <div className={styles.page}>
      <Helmet>
        <title>Payer rules · Saqient</title>
      </Helmet>
      <header>
        <h1 className={styles.title}>Payer rule library</h1>
        <p className={styles.sub}>
          Rules are data, not code: each one is versioned, cites its source and can be switched on or off without a release.
          {!isAdmin && " Only admins can change rules."}
        </p>
      </header>
      {error && <div className={styles.error}>{error.message}</div>}
      <div className={styles.list}>
        {!data && isFetching
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className={styles.skeleton} />)
          : data?.rules.map((r) => (
              <div key={r.id} className={`${styles.rule} ${r.active ? "" : styles.inactive}`}>
                <div className={styles.ruleMain}>
                  <div className={styles.ruleHead}>
                    <span className={`${styles.sev} ${styles[r.severity]}`}>{SEVERITY[r.severity]}</span>
                    <span className={styles.name}>{r.name}</span>
                  </div>
                  <p className={styles.desc}>{r.description}</p>
                  <p className={styles.meta}>
                    <span className={styles.mono}>{r.ruleKey}</span> · v{r.version} · {r.market ? format.marketLabel(r.market) : "All markets"} · {r.reference}
                  </p>
                </div>
                <div className={styles.side}>
                  <span className={styles.hits}>
                    <strong>{r.hitCount}</strong> hits
                  </span>
                  <Switch
                    checked={r.active}
                    disabled={!isAdmin || toggle.isPending}
                    onCheckedChange={(checked) =>
                      toggle.mutate({ ruleId: r.id, active: checked }, { onError: (e) => toast.error(e.message) })
                    }
                    aria-label={`Turn ${r.name} ${r.active ? "off" : "on"}`}
                  />
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}