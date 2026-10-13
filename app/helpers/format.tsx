export const format = {
  aed: (n: number | string, currency = "AED") =>
    `${currency} ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
  date: (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
  dateTime: (d: Date | string) =>
    new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
  currencyFor: (market: string) => (market === "KSA" ? "SAR" : "AED"),
  marketLabel: (m: string) => (m === "DHA" ? "Dubai · DHA" : m === "DOH" ? "Abu Dhabi · DoH" : "Saudi · NPHIES"),
  riskTone: (r: number | null) => (r === null ? "none" : r >= 60 ? "high" : r >= 30 ? "medium" : "low"),
};