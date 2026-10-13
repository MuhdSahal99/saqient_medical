import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { claimQueries } from "../helpers/claimQueries";
import { format } from "../helpers/format";
import styles from "./_index.module.css";

const BUCKET_COLORS = ["var(--success)", "var(--success)", "var(--warning)", "var(--error)", "var(--error)"];

export default function OverviewPage() {
  const { data, isFetching, error } = claimQueries.useStats();

  return (
    <div className={styles.page}>
      <Helmet>
        <title>Overview · Saqient</title>
      </Helmet>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Revenue integrity</p>
          <h1 className={styles.title}>What would have been denied, caught before submission</h1>
        </div>
        <Button asChild>
          <Link to="/claims/new">
            <Sparkles size={16} /> Check a new claim
          </Link>
        </Button>
      </header>

      {error && <div className={styles.error}>{error.message}</div>}

      {!data && isFetching ? (
        <div className={styles.kpis}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className={styles.kpiSkeleton} />
          ))}
        </div>
      ) : data && data.totals.claims === 0 ? (
        <div className={styles.empty}>
          <h2>No claims yet</h2>
          <p>Paste a de-identified physician note or pick one of the sample encounters. The agents will code it, check payer rules and score its denial risk in under a minute.</p>
          <Button asChild>
            <Link to="/claims/new">
              Run your first claim <ArrowRight size={16} />
            </Link>
          </Button>
        </div>
      ) : data ? (
        <>
          <section className={styles.kpis}>
            <Kpi label="Claims checked" value={String(data.totals.claims)} hint={`${data.totals.needsReview} need review · ${data.totals.approved} approved`} />
            <Kpi label="Billed amount at risk" value={format.aed(data.totals.billedAtRisk)} hint={`of ${format.aed(data.totals.billed)} billed, not yet approved`} />
            <Kpi label="Issues caught" value={String(data.totals.issuesCaught)} hint={`${data.totals.blockersCaught} would have blocked payment`} />
            <Kpi label="Average denial risk" value={data.totals.avgRisk === null ? "—" : `${data.totals.avgRisk}%`} hint="across all scored claims" />
          </section>

          <section className={styles.grid}>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Denial risk distribution</h2>
              <p className={styles.cardSub}>Number of claims per risk band</p>
              <div className={styles.chart}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.riskBuckets} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                    <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--popup)", border: "1px solid var(--border)", borderRadius: 8 }} formatter={(v) => [v, "claims"]} labelFormatter={(l) => `Risk ${l}%`} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {data.riskBuckets.map((b, i) => (
                        <Cell key={b.bucket} fill={BUCKET_COLORS[i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Most common issues</h2>
              <p className={styles.cardSub}>What the rules engine catches most often</p>
              {data.topIssues.length === 0 ? (
                <p className={styles.muted}>No issues found yet.</p>
              ) : (
                <ul className={styles.issues}>
                  {data.topIssues.map((i) => {
                    const max = data.topIssues[0].count;
                    return (
                      <li key={i.ruleName}>
                        <div className={styles.issueRow}>
                          <span>{i.ruleName}</span>
                          <span className={styles.num}>{i.count}</span>
                        </div>
                        <div className={styles.issueTrack}>
                          <div className={`${styles.issueFill} ${styles[i.severity]}`} style={{ width: `${(i.count / max) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Risk by payer</h2>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Payer</th>
                    <th className={styles.right}>Claims</th>
                    <th className={styles.right}>Avg risk</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byPayer.map((p) => (
                    <tr key={p.payerName}>
                      <td>{p.payerName}</td>
                      <td className={`${styles.right} ${styles.num}`}>{p.claims}</td>
                      <td className={`${styles.right} ${styles.num}`}>{p.avgRisk}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>AI efficiency and safety</h2>
              <p className={styles.cardSub}>Model calls, cache savings and guardrail interventions</p>
              <dl className={styles.aiStats}>
                <div>
                  <dt>Model calls</dt>
                  <dd>{data.ai.runs}</dd>
                </div>
                <div>
                  <dt>Served from cache</dt>
                  <dd>{data.ai.cachedRuns}</dd>
                </div>
                <div>
                  <dt>AI credits used</dt>
                  <dd>{data.ai.credits.toFixed(1)}</dd>
                </div>
                <div>
                  <dt>Guardrail blocks</dt>
                  <dd>{data.ai.guardrailBlocks}</dd>
                </div>
              </dl>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>{value}</span>
      <span className={styles.kpiHint}>{hint}</span>
    </div>
  );
}