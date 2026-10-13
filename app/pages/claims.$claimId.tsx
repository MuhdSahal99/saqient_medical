import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { toast } from "sonner";
import {
  ArrowLeft,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  Info,
  Sparkles,
  Star,
  Undo2,
  X,
  Check,
  ShieldCheck,
  Clock,
  Database,
} from "lucide-react";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/Tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/Tooltip";
import { RiskMeter } from "../components/RiskMeter";
import { StatusPill } from "../components/StatusPill";
import { EvidenceNote } from "../components/EvidenceNote";
import { AgentProgress } from "../components/AgentProgress";
import { claimQueries } from "../helpers/claimQueries";
import { format } from "../helpers/format";
import type { OutputType as Detail } from "../endpoints/encounters/detail_GET.schema";
import styles from "./claims.$claimId.module.css";

type Line = Detail["lines"][number];

const AGENT_LABELS: Record<string, string> = {
  redaction: "Redaction guard",
  extraction: "Extraction agent",
  coding: "Coding agent",
  verifier: "Verifier agent",
  preauth: "Pre-auth agent",
  rules: "Rules engine",
  risk: "Risk model",
};

export default function ClaimDetailPage() {
  const { claimId } = useParams();
  const id = Number(claimId);
  const { data, isFetching, error } = claimQueries.useClaim(id);
  const process = claimQueries.useProcessClaim();
  const updateLine = claimQueries.useUpdateLine(id);
  const approve = claimQueries.useApprove();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [tab, setTab] = useState("codes");
  const triggered = useRef(false);

  // A freshly created claim has not been processed yet: start the pipeline once.
  const shouldAutoRun = data?.encounter.status === "processing" && data.agentRuns.length === 0;
  useEffect(() => {
    if (!shouldAutoRun || triggered.current) return;
    triggered.current = true;
    process.mutate(id, {
      onError: (err) => {
        if ((err as { code?: string }).code === "OUT_OF_CREDITS") return console.warn(err);
        toast.error(err instanceof Error ? err.message : "The AI check failed.");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoRun, id]);

  const spans = useMemo(
    () => (data?.lines ?? []).filter((l) => l.evidence && l.status !== "rejected").map((l) => ({ key: `line-${l.id}`, text: l.evidence as string })),
    [data?.lines]
  );

  if (error) return <div className={styles.error}>{error.message}</div>;
  if (!data) {
    return (
      <div className={styles.page}>
        <Skeleton className={styles.headSkeleton} />
        <Skeleton className={styles.bodySkeleton} />
      </div>
    );
  }

  const { encounter: enc, lines, hits, agentRuns, facts, audit } = data;
  const running = process.isPending || (enc.status === "processing" && agentRuns.length === 0);
  const locked = enc.status === "approved";
  const currency = format.currencyFor(enc.market);
  const blockers = hits.filter((h) => h.severity === "block");
  const pending = lines.filter((l) => l.source === "ai_suggested" && l.status === "proposed");
  const approveBlockedReason = blockers.length
    ? `Fix ${blockers.length} blocking issue${blockers.length === 1 ? "" : "s"} first`
    : pending.length
      ? `Review ${pending.length} AI suggestion${pending.length === 1 ? "" : "s"} first`
      : null;

  const act = (lineId: number, action: "accept" | "reject" | "make_primary" | "reset") =>
    updateLine.mutate({ lineId, action }, { onError: (e) => toast.error(e.message) });

  const doApprove = () =>
    approve.mutate(id, {
      onSuccess: () => toast.success("Claim approved and locked. The clean-claim pack is ready."),
      onError: (e) => toast.error(e.message),
    });

  const rerun = () => {
    process.mutate(id, {
      onSuccess: () => toast.success("AI check finished."),
      onError: (err) => {
        if ((err as { code?: string }).code === "OUT_OF_CREDITS") return console.warn(err);
        toast.error(err instanceof Error ? err.message : "The AI check failed.");
      },
    });
  };

  const downloadPack = () => {
    const pack = {
      format: "saqient.clean-claim-pack.v1",
      generatedAt: new Date().toISOString(),
      draft: !locked,
      claim: {
        id: enc.id,
        patientRef: enc.patientRef,
        payer: enc.payerName,
        submissionPlatform: enc.platform,
        market: enc.market,
        encounterType: enc.encounterType,
        encounterDate: enc.encounterDate,
        billedAmount: Number(enc.billedAmount),
        currency,
      },
      diagnoses: lines.filter((l) => l.kind === "diagnosis" && l.status === "accepted").map((l) => ({ system: l.system, code: l.code, description: l.description, primary: l.isPrimary, evidence: l.evidence })),
      procedures: lines.filter((l) => l.kind === "procedure" && l.status === "accepted").map((l) => ({ system: l.system, code: l.code, description: l.description, evidence: l.evidence })),
      priorAuthorization: enc.preauth,
      openIssues: hits.map((h) => ({ severity: h.severity, rule: h.ruleName, message: h.message, fix: h.fix })),
      denialRisk: enc.riskScore,
      readiness: enc.readinessScore,
      approvedAt: enc.approvedAt,
      auditTrail: audit.map((a) => ({ at: a.createdAt, by: a.userName, action: a.action })),
    };
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `claim-${enc.id}-${enc.patientRef}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dx = lines.filter((l) => l.kind === "diagnosis");
  const px = lines.filter((l) => l.kind === "procedure");
  const totalCredits = agentRuns.reduce((s, r) => s + r.credits, 0);
  const totalMs = agentRuns.reduce((s, r) => s + r.durationMs, 0);

  return (
    <div className={styles.page}>
      <Helmet>
        <title>{`${enc.specialty} · ${enc.patientRef} · Saqient`}</title>
      </Helmet>

      <Link to="/claims" className={styles.back}>
        <ArrowLeft size={15} /> All claims
      </Link>

      <header className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{enc.specialty}</h1>
            <StatusPill status={running ? "processing" : enc.status} />
          </div>
          <p className={styles.meta}>
            <span className={styles.mono}>{enc.patientRef}</span> · {enc.payerName} · {format.marketLabel(enc.market)} · {format.date(enc.encounterDate)} ·{" "}
            <span className={styles.num}>{format.aed(enc.billedAmount, currency)}</span>
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="outline" onClick={rerun} disabled={running || locked}>
            <RefreshCw size={15} /> Re-run AI
          </Button>
          <Button variant="outline" onClick={downloadPack} disabled={running}>
            <Download size={15} /> {locked ? "Claim pack" : "Draft pack"}
          </Button>
          {locked ? (
            <Button disabled>
              <CheckCircle2 size={15} /> Approved
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button onClick={doApprove} disabled={running || !!approveBlockedReason || approve.isPending}>
                    <CheckCircle2 size={15} /> Approve claim
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{approveBlockedReason ?? "A person signs off every claim before submission"}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>

      {enc.status === "error" && !running && (
        <div className={styles.error}>
          The AI check stopped: {enc.pipelineError}. You can re-run it, or code the claim manually.
        </div>
      )}

      {running ? (
        <AgentProgress />
      ) : (
        <>
          <section className={styles.scores}>
            <div className={styles.scoreCard}>
              <span className={styles.scoreLabel}>Denial risk</span>
              <span className={styles.scoreBig}>{enc.riskScore ?? "—"}%</span>
              <RiskMeter value={enc.riskScore} showValue={false} />
            </div>
            <div className={styles.scoreCard}>
              <span className={styles.scoreLabel}>Claim readiness</span>
              <span className={styles.scoreBig}>{enc.readinessScore ?? "—"}%</span>
              <RiskMeter value={enc.readinessScore} kind="readiness" showValue={false} />
            </div>
            <div className={`${styles.scoreCard} ${styles.why}`}>
              <span className={styles.scoreLabel}>What drives the risk</span>
              {enc.riskReasons.length === 0 ? (
                <p className={styles.good}>
                  <ShieldCheck size={16} /> No risk factors beyond the payer's normal denial rate.
                </p>
              ) : (
                <ul className={styles.reasons}>
                  {enc.riskReasons.slice(0, 4).map((r, i) => (
                    <li key={i}>{r.label}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <div className={styles.layout}>
            <section className={styles.noteCard}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Clinical note</h2>
                <span className={styles.hint}>
                  <ShieldCheck size={13} /> {enc.redactionCount} identifier{enc.redactionCount === 1 ? "" : "s"} removed · highlights show evidence
                </span>
              </div>
              <EvidenceNote
                note={enc.noteText}
                spans={spans}
                activeKey={activeKey}
                onSelect={(k) => {
                  setActiveKey(k);
                  setTab("codes");
                  document.getElementById(k)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
              {facts.length > 0 && (
                <div className={styles.facts}>
                  <span className={styles.factsLabel}>Facts the extraction agent found</span>
                  <div className={styles.factChips}>
                    {facts.map((f) => (
                      <span key={f.id} className={`${styles.fact} ${f.negated ? styles.negated : ""}`} title={f.evidence}>
                        {f.negated ? "No " : ""}
                        {f.text}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className={styles.panel}>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className={styles.tabs}>
                  <TabsTrigger value="codes">Codes {pending.length ? <span className={styles.count}>{pending.length}</span> : null}</TabsTrigger>
                  <TabsTrigger value="issues">Issues {hits.length ? <span className={`${styles.count} ${blockers.length ? styles.countBad : ""}`}>{hits.length}</span> : null}</TabsTrigger>
                  <TabsTrigger value="preauth">Pre-auth</TabsTrigger>
                  <TabsTrigger value="trace">Agent trace</TabsTrigger>
                  <TabsTrigger value="audit">Audit</TabsTrigger>
                </TabsList>

                <TabsContent value="codes" className={styles.tabBody}>
                  <CodeGroup title="Diagnoses" lines={dx} locked={locked} activeKey={activeKey} setActiveKey={setActiveKey} act={act} busy={updateLine.isPending} />
                  <CodeGroup title="Procedures and services" lines={px} locked={locked} activeKey={activeKey} setActiveKey={setActiveKey} act={act} busy={updateLine.isPending} />
                </TabsContent>

                <TabsContent value="issues" className={styles.tabBody}>
                  {hits.length === 0 ? (
                    <p className={styles.good}>
                      <ShieldCheck size={16} /> All payer rules pass.
                    </p>
                  ) : (
                    <ul className={styles.hits}>
                      {[...hits]
                        .sort((a, b) => "bwi".indexOf(a.severity[0]) - "bwi".indexOf(b.severity[0]))
                        .map((h) => (
                          <li key={h.id} className={`${styles.hit} ${styles[h.severity]}`}>
                            <span className={styles.hitIcon}>
                              {h.severity === "block" ? <AlertOctagon size={16} /> : h.severity === "warn" ? <AlertTriangle size={16} /> : <Info size={16} />}
                            </span>
                            <div>
                              <div className={styles.hitHead}>
                                <span className={styles.hitRule}>{h.ruleName}</span>
                                <span className={styles.hitSeverity}>{h.severity === "block" ? "Blocks payment" : h.severity === "warn" ? "Denial risk" : "Note"}</span>
                              </div>
                              <p className={styles.hitMsg}>{h.message}</p>
                              {h.fix && (
                                <p className={styles.hitFix}>
                                  <strong>Fix:</strong> {h.fix}
                                </p>
                              )}
                              {h.reference && <p className={styles.hitRef}>Source: {h.reference}</p>}
                            </div>
                          </li>
                        ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="preauth" className={styles.tabBody}>
                  {!enc.preauth || !enc.preauth.required ? (
                    <p className={styles.good}>
                      <ShieldCheck size={16} /> No procedure on this claim needs prior approval.
                    </p>
                  ) : (
                    enc.preauth.items.map((item) => {
                      const necessityOk = (item.necessityScore ?? 0) >= 0.5;
                      const approvalOk = (item.approvalMentioned ?? 0) >= 0.5;
                      return (
                        <div key={item.code} className={styles.paCard}>
                          <div className={styles.paHead}>
                            <span className={styles.code}>{item.code}</span>
                            <span>{item.description}</span>
                          </div>
                          <div className={styles.paChecks}>
                            <Check2 ok={necessityOk} label={necessityOk ? "Medical necessity is documented" : "Medical necessity is not clearly documented"} />
                            <Check2 ok={approvalOk} label={approvalOk ? "Approval number found in the note" : "No approval number recorded yet"} />
                          </div>
                          <span className={styles.factsLabel}>Before you submit</span>
                          <ul className={styles.checklist}>
                            {item.checklist.map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })
                  )}
                </TabsContent>

                <TabsContent value="trace" className={styles.tabBody}>
                  <div className={styles.traceTotals}>
                    <span>
                      <Clock size={14} /> {(totalMs / 1000).toFixed(1)} s total
                    </span>
                    <span>
                      <Sparkles size={14} /> {totalCredits.toFixed(2)} AI credits
                    </span>
                    <span>
                      <Database size={14} /> {agentRuns.filter((r) => r.status === "cached").length} cached
                    </span>
                  </div>
                  <ol className={styles.trace}>
                    {agentRuns.map((r) => (
                      <li key={r.id} className={styles.traceItem}>
                        <span className={`${styles.traceDot} ${styles[`dot_${r.status}`]}`} />
                        <div>
                          <div className={styles.traceHead}>
                            <span className={styles.traceName}>{AGENT_LABELS[r.agent] ?? r.agent}</span>
                            <span className={styles.traceMeta}>
                              {r.model} · {r.status} · {(r.durationMs / 1000).toFixed(1)} s{r.credits ? ` · ${r.credits.toFixed(2)} cr` : ""}
                            </span>
                          </div>
                          <p className={styles.traceSummary}>{r.summary}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </TabsContent>

                <TabsContent value="audit" className={styles.tabBody}>
                  <ul className={styles.audit}>
                    {audit.map((a) => (
                      <li key={a.id}>
                        <span className={styles.auditAction}>{a.action.replace(/[._]/g, " ")}</span>
                        <span className={styles.auditMeta}>
                          {a.userName ?? "System"} · {format.dateTime(a.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </TabsContent>
              </Tabs>
            </section>
          </div>
        </>
      )}
      {isFetching && !running && <span className={styles.syncing}>Updating…</span>}
    </div>
  );
}

function Check2({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`${styles.check} ${ok ? styles.checkOk : styles.checkBad}`}>
      {ok ? <Check size={14} /> : <X size={14} />} {label}
    </span>
  );
}

function CodeGroup({
  title,
  lines,
  locked,
  activeKey,
  setActiveKey,
  act,
  busy,
}: {
  title: string;
  lines: Line[];
  locked: boolean;
  activeKey: string | null;
  setActiveKey: (k: string | null) => void;
  act: (id: number, a: "accept" | "reject" | "make_primary" | "reset") => void;
  busy: boolean;
}) {
  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>{title}</h3>
      {lines.length === 0 && <p className={styles.hint}>None on this claim.</p>}
      {lines.map((l) => {
        const key = `line-${l.id}`;
        const ai = l.source === "ai_suggested";
        return (
          <div
            key={l.id}
            id={key}
            className={`${styles.line} ${l.status === "rejected" ? styles.lineRejected : ""} ${activeKey === key ? styles.lineActive : ""}`}
            onMouseEnter={() => l.evidence && setActiveKey(key)}
          >
            <div className={styles.lineHead}>
              <span className={styles.code}>{l.code}</span>
              <span className={styles.lineDesc}>{l.description}</span>
            </div>
            <div className={styles.badges}>
              {l.isPrimary && (
                <span className={styles.badgePrimary}>
                  <Star size={11} /> Primary
                </span>
              )}
              {ai ? (
                <span className={styles.badgeAi}>
                  <Sparkles size={11} /> AI suggested
                </span>
              ) : (
                <span className={styles.badgeMuted}>Entered by provider</span>
              )}
              {l.status === "accepted" && <span className={styles.badgeOk}>Accepted</span>}
              {l.status === "rejected" && <span className={styles.badgeMuted}>Rejected</span>}
              {l.confidence !== null && <span className={styles.badgeMuted}>Confidence {Math.round(l.confidence * 100)}%</span>}
              {l.verifierScore !== null && (
                <span className={l.verifierScore >= 0.5 ? styles.badgeOk : styles.badgeWarn}>Verifier {Math.round(l.verifierScore * 100)}%</span>
              )}
            </div>
            {l.evidence ? (
              <blockquote className={styles.evidence} onClick={() => setActiveKey(key)}>
                “{l.evidence}”
              </blockquote>
            ) : (
              ai || <p className={styles.noEvidence}>No supporting sentence found in the note.</p>
            )}
            {l.rationale && <p className={styles.rationale}>{l.rationale}</p>}
            {!locked && (
              <div className={styles.lineActions}>
                {l.status !== "accepted" && (
                  <Button size="sm" onClick={() => act(l.id, "accept")} disabled={busy}>
                    <Check size={14} /> Accept
                  </Button>
                )}
                {l.status !== "rejected" && (
                  <Button size="sm" variant="outline" onClick={() => act(l.id, "reject")} disabled={busy}>
                    <X size={14} /> Reject
                  </Button>
                )}
                {l.kind === "diagnosis" && !l.isPrimary && l.status !== "rejected" && (
                  <Button size="sm" variant="ghost" onClick={() => act(l.id, "make_primary")} disabled={busy}>
                    <Star size={14} /> Make primary
                  </Button>
                )}
                {ai && l.status !== "proposed" && (
                  <Button size="sm" variant="ghost" onClick={() => act(l.id, "reset")} disabled={busy}>
                    <Undo2 size={14} /> Undo
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}