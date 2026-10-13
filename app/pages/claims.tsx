import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Search, Plus, AlertOctagon, Sparkles } from "lucide-react";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { RiskMeter } from "../components/RiskMeter";
import { StatusPill } from "../components/StatusPill";
import { claimQueries } from "../helpers/claimQueries";
import { useDebounce } from "../helpers/useDebounce";
import { format } from "../helpers/format";
import type { EncounterStatus } from "../helpers/schema";
import styles from "./claims.module.css";

const FILTERS: { value: EncounterStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_review", label: "Needs review" },
  { value: "ready", label: "Ready to approve" },
  { value: "approved", label: "Approved" },
  { value: "error", label: "Errors" },
];

export default function ClaimsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<EncounterStatus | "all">("all");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const { data, isFetching, error } = claimQueries.useClaims({
    status: filter === "all" ? undefined : filter,
    search: debounced || undefined,
  });

  return (
    <div className={styles.page}>
      <Helmet>
        <title>Claims · Saqient</title>
      </Helmet>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Claims worklist</h1>
          <p className={styles.sub}>Highest risk first is not always first in time: sort your day by what will be denied.</p>
        </div>
        <Button asChild>
          <Link to="/claims/new">
            <Plus size={16} /> New claim
          </Link>
        </Button>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.filters} role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={filter === f.value}
              className={`${styles.chip} ${filter === f.value ? styles.chipActive : ""}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className={styles.searchBox}>
          <Search size={15} className={styles.searchIcon} />
          <Input placeholder="Search patient ref, specialty, payer" value={search} onChange={(e) => setSearch(e.target.value)} className={styles.search} />
        </div>
      </div>

      {error && <div className={styles.error}>{error.message}</div>}

      <div className={styles.tableCard}>
        {!data && isFetching ? (
          <div className={styles.skeletons}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className={styles.rowSkeleton} />
            ))}
          </div>
        ) : data && data.claims.length === 0 ? (
          <div className={styles.empty}>
            <p>No claims match this view.</p>
            <Button asChild variant="outline">
              <Link to="/claims/new">Check a new claim</Link>
            </Button>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Encounter</th>
                <th>Payer</th>
                <th>Date</th>
                <th className={styles.right}>Billed</th>
                <th>Status</th>
                <th>Denial risk</th>
                <th>Needs attention</th>
              </tr>
            </thead>
            <tbody>
              {[...(data?.claims ?? [])]
                .sort((a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1))
                .map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/claims/${c.id}`)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && navigate(`/claims/${c.id}`)}>
                    <td>
                      <div className={styles.primary}>{c.specialty}</div>
                      <div className={styles.secondary}>
                        <span className={styles.mono}>{c.patientRef}</span> · {c.encounterType.replace("_", " ")}
                      </div>
                    </td>
                    <td>
                      <div className={styles.primary}>{c.payerName}</div>
                      <div className={styles.secondary}>{format.marketLabel(c.market)}</div>
                    </td>
                    <td className={styles.nowrap}>{format.date(c.encounterDate)}</td>
                    <td className={`${styles.right} ${styles.num}`}>{format.aed(c.billedAmount, format.currencyFor(c.market))}</td>
                    <td>
                      <StatusPill status={c.status} />
                    </td>
                    <td>
                      <RiskMeter value={c.riskScore} size="sm" />
                    </td>
                    <td>
                      <div className={styles.flags}>
                        {c.blockers > 0 && (
                          <span className={`${styles.flag} ${styles.flagBlock}`}>
                            <AlertOctagon size={13} /> {c.blockers} blocker{c.blockers === 1 ? "" : "s"}
                          </span>
                        )}
                        {c.pendingSuggestions > 0 && (
                          <span className={`${styles.flag} ${styles.flagAi}`}>
                            <Sparkles size={13} /> {c.pendingSuggestions} to review
                          </span>
                        )}
                        {c.blockers === 0 && c.pendingSuggestions === 0 && <span className={styles.secondary}>—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}