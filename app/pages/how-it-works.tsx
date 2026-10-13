import { Helmet } from "react-helmet";
import { ShieldCheck, FileSearch, Code2, ScanEye, ClipboardCheck, Scale, Gauge, UserCheck } from "lucide-react";
import styles from "./how-it-works.module.css";

const STEPS = [
  { icon: ShieldCheck, name: "Redaction", kind: "Deterministic", text: "Names, Emirates IDs, Saudi IDs, phone numbers, record numbers and dates of birth are removed before the note is stored or sent to any model." },
  { icon: FileSearch, name: "Extraction agent", kind: "Language model", text: "Reads the note and lists diagnoses, procedures and findings. Every fact must quote the note word for word, or it is thrown away." },
  { icon: Code2, name: "Coding agent", kind: "Language model", text: "Chooses codes only from a short list retrieved from the market's code set (ICD-10-CM + CPT in the UAE, ICD-10-AM + ACHI in Saudi Arabia). Codes outside that list are blocked." },
  { icon: ScanEye, name: "Verifier agent", kind: "Judge model", text: "A second, independent model checks each suggested code against the note and scores how well it is supported." },
  { icon: ClipboardCheck, name: "Pre-auth agent", kind: "Judge model", text: "Flags procedures that need prior approval and checks whether medical necessity and an approval number are documented." },
  { icon: Scale, name: "Rules engine", kind: "Deterministic", text: "Applies the payer rule library. Rules, not the AI, decide whether a claim passes." },
  { icon: Gauge, name: "Risk model", kind: "Deterministic v0", text: "Combines the payer's base denial rate, rule hits and code history into a denial probability with the reasons behind it." },
  { icon: UserCheck, name: "Coder approval", kind: "Human", text: "A coder accepts or rejects each suggestion and approves the claim. Every action is written to the audit trail." },
];

const SAFEGUARDS = [
  ["No raw identifiers", "PHI is removed at ingest; the pseudonymous patient reference is checked too."],
  ["No invented codes", "Codes must exist in the retrieved candidate list and the active code table."],
  ["No unsupported claims", "Facts and codes need a verbatim quote that is found in the note."],
  ["Two opinions", "A separate verifier model re-checks every AI code."],
  ["Rules decide", "Pass or fail comes from versioned, cited rules, never from the model."],
  ["People approve", "Approval is refused while blockers or unreviewed AI codes remain."],
];

const TOKENS = [
  ["Retrieval, not the whole code set", "Only the 20 to 30 most relevant codes are sent to the coding agent."],
  ["Note budget", "Generative agents see at most 6,000 characters of compacted note."],
  ["Structured outputs", "Strict JSON schemas, low reasoning effort and capped output tokens."],
  ["Cheap judges", "Yes/no checks use a fast judge model that generates no text."],
  ["Content-hash cache", "Re-running an unchanged claim costs nothing; identical inputs are served from cache."],
  ["Deterministic first", "Redaction, rules and scoring use no model at all."],
];

export default function HowItWorksPage() {
  return (
    <div className={styles.page}>
      <Helmet>
        <title>How it works · Saqient</title>
      </Helmet>
      <header>
        <h1 className={styles.title}>How Saqient checks a claim</h1>
        <p className={styles.sub}>A supervised team of narrow agents, a deterministic rules engine with the final say, and a person who signs off.</p>
      </header>
      <ol className={styles.steps}>
        {STEPS.map((s, i) => (
          <li key={s.name} className={styles.step}>
            <span className={styles.stepNum}>{i + 1}</span>
            <s.icon size={20} className={styles.stepIcon} />
            <div>
              <div className={styles.stepHead}>
                <span className={styles.stepName}>{s.name}</span>
                <span className={styles.kind}>{s.kind}</span>
              </div>
              <p className={styles.stepText}>{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <section className={styles.cols}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Guardrails</h2>
          <dl className={styles.dl}>
            {SAFEGUARDS.map(([t, d]) => (
              <div key={t}>
                <dt>{t}</dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Keeping AI cost low</h2>
          <dl className={styles.dl}>
            {TOKENS.map(([t, d]) => (
              <div key={t}>
                <dt>{t}</dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <p className={styles.note}>
        This workspace is a prototype for synthetic or de-identified data. Production use with real patient data needs UAE-hosted (or, for Saudi customers,
        in-Kingdom) infrastructure and in-region models, under UAE Federal Law No. 2 of 2019 and the Saudi PDPL.
      </p>
    </div>
  );
}