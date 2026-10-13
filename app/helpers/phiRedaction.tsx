// Deterministic PHI redaction. Runs at ingest, before anything is stored or
// sent to a model, and again at the start of every pipeline run as a guard.
// It is intentionally conservative: it would rather remove a non-PHI token
// than let an identifier through.

export type RedactionResult = {
  text: string;
  count: number;
  types: Record<string, number>;
};

type Pattern = { type: string; re: RegExp; replace: string };

const PATTERNS: Pattern[] = [
  { type: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replace: "[EMAIL]" },
  { type: "emirates_id", re: /\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d\b/g, replace: "[EMIRATES_ID]" },
  { type: "national_id", re: /\b[12]\d{9}\b/g, replace: "[NATIONAL_ID]" },
  {
    type: "phone",
    re: /(?:\+|00)?(?:971|966)[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{4}\b|\b05\d[\s-]?\d{3}[\s-]?\d{4}\b/g,
    replace: "[PHONE]",
  },
  {
    type: "mrn",
    re: /\b(MRN|Medical Record(?: Number| No\.?)?|File No\.?|Patient ID)\s*[:#]?\s*[A-Z0-9][A-Z0-9-]{3,}\b/gi,
    replace: "$1: [MRN]",
  },
  {
    type: "passport",
    re: /\b(Passport(?: No\.?| Number)?)\s*[:#]?\s*[A-Z0-9]{6,9}\b/gi,
    replace: "$1: [PASSPORT]",
  },
  {
    type: "dob",
    re: /\b(DOB|D\.O\.B\.?|Date of birth)\s*[:-]?\s*\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/gi,
    replace: "$1: [DOB]",
  },
  {
    type: "name",
    re: /\b(Patient(?: name)?|Name|Pt|Guardian|Father|Mother)[ \t]*[:-][ \t]*(?:Mr|Mrs|Ms|Miss)?\.?[ \t]*[A-Z][a-z][a-zA-Z'-]*(?:[ \t](?:(?:bin|bint|al|Al|el|El)\b|[A-Z][a-z][a-zA-Z'-]*)){0,4}/g,
    replace: "$1: [NAME]",
  },
  {
    type: "name",
    re: /\b(Mr|Mrs|Ms|Miss|Sheikh|Sheikha)\.?[ \t]+[A-Z][a-z][a-zA-Z'-]*(?:[ \t](?:(?:bin|bint|al|Al)\b|[A-Z][a-z][a-zA-Z'-]*)){0,3}/g,
    replace: "$1 [NAME]",
  },
];

export function phiRedaction(input: string): RedactionResult {
  let text = input;
  let count = 0;
  const types: Record<string, number> = {};
  for (const p of PATTERNS) {
    text = text.replace(p.re, (...args) => {
      count += 1;
      types[p.type] = (types[p.type] ?? 0) + 1;
      const groups = args.slice(1, -2) as string[];
      return p.replace.replace(/\$(\d)/g, (_, i) => groups[Number(i) - 1] ?? "");
    });
  }
  return { text, count, types };
}