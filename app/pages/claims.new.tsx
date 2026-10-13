import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { toast } from "sonner";
import { ShieldCheck, Sparkles, FileText } from "lucide-react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Textarea } from "../components/Textarea";
import { Spinner } from "../components/Spinner";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../components/Select";
import { claimQueries } from "../helpers/claimQueries";
import { sampleNotes } from "../helpers/sampleNotes";
import { phiRedaction } from "../helpers/phiRedaction";
import { format } from "../helpers/format";
import type { EncounterType } from "../helpers/schema";
import styles from "./claims.new.module.css";

const TYPES: { value: EncounterType; label: string }[] = [
  { value: "outpatient", label: "Outpatient" },
  { value: "emergency", label: "Emergency" },
  { value: "day_case", label: "Day case" },
  { value: "inpatient", label: "Inpatient" },
];

const today = () => new Date().toISOString().slice(0, 10);

export default function NewClaimPage() {
  const navigate = useNavigate();
  const payers = claimQueries.usePayers();
  const create = claimQueries.useCreateClaim();

  const [note, setNote] = useState("");
  const [payerId, setPayerId] = useState<string>("");
  const [planName, setPlanName] = useState("");
  const [encounterType, setEncounterType] = useState<EncounterType>("outpatient");
  const [specialty, setSpecialty] = useState("");
  const [encounterDate, setEncounterDate] = useState(today());
  const [billedAmount, setBilledAmount] = useState("");
  const [patientRef, setPatientRef] = useState(`PT-${Math.floor(1000 + Math.random() * 9000)}`);
  const [codes, setCodes] = useState("");

  // Live preview of what will be removed before anything is stored.
  const preview = useMemo(() => phiRedaction(note), [note]);
  const payer = payers.data?.payers.find((p) => String(p.id) === payerId);
  const markets = ["DHA", "DOH", "KSA"] as const;

  const loadSample = (id: string) => {
    const s = sampleNotes.find((x) => x.id === id);
    if (!s) return;
    setNote(s.note);
    setSpecialty(s.specialty);
    setEncounterType(s.encounterType);
    setBilledAmount(String(s.billedAmount));
    setCodes(s.submittedCodes.join(", "));
    const p = payers.data?.payers.find((x) => x.market === s.market);
    if (p) setPayerId(String(p.id));
  };

  const canSubmit = note.trim().length >= 40 && payerId && specialty.trim().length >= 2 && !create.isPending;

  const submit = async () => {
    try {
      const result = await create.mutateAsync({
        payerId: Number(payerId),
        planName,
        encounterType,
        specialty,
        encounterDate,
        billedAmount: Number(billedAmount || 0),
        patientRef,
        noteText: note,
        submittedCodes: codes
          .split(/[,\s]+/)
          .map((c) => c.trim())
          .filter(Boolean),
      });
      if (result.redactionCount) toast.success(`Removed ${result.redactionCount} identifiers before saving.`);
      navigate(`/claims/${result.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the claim.");
    }
  };

  return (
    <div className={styles.page}>
      <Helmet>
        <title>New claim · Saqient</title>
      </Helmet>
      <header>
        <h1 className={styles.title}>Check a new claim</h1>
        <p className={styles.sub}>Paste the physician note, add payer details, and the agents will code, check and score it.</p>
      </header>

      <div className={styles.samples}>
        <span className={styles.samplesLabel}>
          <FileText size={15} /> Try a sample encounter:
        </span>
        {sampleNotes.map((s) => (
          <button key={s.id} className={styles.sample} onClick={() => loadSample(s.id)}>
            {s.title}
          </button>
        ))}
      </div>

      <div className={styles.layout}>
        <section className={styles.noteCard}>
          <div className={styles.cardHead}>
            <label htmlFor="note" className={styles.label}>
              Clinical note
            </label>
            <span className={styles.count}>{note.length.toLocaleString()} / 20,000</span>
          </div>
          <Textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Paste the SOAP note, discharge summary or procedure note here…"
            className={styles.note}
            maxLength={20000}
          />
          <div className={`${styles.phi} ${preview.count ? styles.phiFound : ""}`}>
            <ShieldCheck size={16} />
            {preview.count ? (
              <span>
                {preview.count} identifier{preview.count === 1 ? "" : "s"} ({Object.keys(preview.types).join(", ").replace(/_/g, " ")}) will be removed before the note is saved or
                sent to any AI.
              </span>
            ) : (
              <span>Names, IDs, phone numbers and record numbers are removed automatically before saving.</span>
            )}
          </div>
        </section>

        <aside className={styles.detailsCard}>
          <h2 className={styles.cardTitle}>Encounter details</h2>
          <div className={styles.field}>
            <span className={styles.label}>Payer</span>
            <Select value={payerId} onValueChange={setPayerId}>
              <SelectTrigger>
                <SelectValue placeholder={payers.isFetching ? "Loading payers…" : "Choose a payer"} />
              </SelectTrigger>
              <SelectContent>
                {markets.map((m) => (
                  <SelectGroup key={m}>
                    <SelectLabel>{format.marketLabel(m)}</SelectLabel>
                    {payers.data?.payers
                      .filter((p) => p.market === m)
                      .map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {payer && (
              <span className={styles.hint}>
                Submits through {payer.platform}. Codes: {payer.market === "KSA" ? "ICD-10-AM + ACHI" : "ICD-10-CM + CPT"}.
              </span>
            )}
          </div>
          <div className={styles.row}>
            <div className={styles.field}>
              <span className={styles.label}>Encounter type</span>
              <Select value={encounterType} onValueChange={(v) => setEncounterType(v as EncounterType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="specialty">
                Specialty
              </label>
              <Input id="specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="e.g. Orthopedics" />
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="date">
                Encounter date
              </label>
              <Input id="date" type="date" value={encounterDate} onChange={(e) => setEncounterDate(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="amount">
                Billed amount ({payer ? format.currencyFor(payer.market) : "AED"})
              </label>
              <Input id="amount" type="number" min={0} value={billedAmount} onChange={(e) => setBilledAmount(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ref">
                Patient reference
              </label>
              <Input id="ref" value={patientRef} onChange={(e) => setPatientRef(e.target.value)} className={styles.mono} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="plan">
                Plan (optional)
              </label>
              <Input id="plan" value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="e.g. Enhanced" />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="codes">
              Codes already entered (optional)
            </label>
            <Input id="codes" value={codes} onChange={(e) => setCodes(e.target.value)} placeholder="e.g. M54.50, 99214" className={styles.mono} />
            <span className={styles.hint}>We will check these and suggest anything missing.</span>
          </div>
          <Button className={styles.submit} disabled={!canSubmit} onClick={submit}>
            {create.isPending ? <Spinner size="sm" /> : <Sparkles size={16} />}
            {create.isPending ? "Saving securely…" : "Run AI check"}
          </Button>
        </aside>
      </div>
    </div>
  );
}