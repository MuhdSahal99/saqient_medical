import { useMemo } from "react";
import styles from "./EvidenceNote.module.css";

export type EvidenceSpan = { key: string; text: string };

type Segment = { text: string; keys: string[] };

// Renders the de-identified note with every piece of AI evidence highlighted.
// The span tied to the code the user is looking at is emphasised.
export const EvidenceNote = ({
  note,
  spans,
  activeKey,
  onSelect,
  className,
}: {
  note: string;
  spans: EvidenceSpan[];
  activeKey: string | null;
  onSelect?: (key: string) => void;
  className?: string;
}) => {
  const segments = useMemo<Segment[]>(() => {
    const lower = note.toLowerCase();
    const marks: { start: number; end: number; key: string }[] = [];
    for (const s of spans) {
      const needle = s.text.trim().toLowerCase();
      if (needle.length < 4) continue;
      const at = lower.indexOf(needle);
      if (at >= 0) marks.push({ start: at, end: at + needle.length, key: s.key });
    }
    if (!marks.length) return [{ text: note, keys: [] }];
    const cuts = new Set<number>([0, note.length]);
    for (const m of marks) {
      cuts.add(m.start);
      cuts.add(m.end);
    }
    const points = Array.from(cuts).sort((a, b) => a - b);
    const out: Segment[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      out.push({ text: note.slice(a, b), keys: marks.filter((m) => m.start <= a && m.end >= b).map((m) => m.key) });
    }
    return out;
  }, [note, spans]);

  return (
    <div className={`${styles.note} ${className ?? ""}`}>
      {segments.map((s, i) =>
        s.keys.length ? (
          <mark
            key={i}
            data-evidence={s.keys.join(" ")}
            className={`${styles.mark} ${activeKey && s.keys.includes(activeKey) ? styles.active : ""}`}
            onClick={() => onSelect?.(s.keys[0])}
          >
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </div>
  );
};