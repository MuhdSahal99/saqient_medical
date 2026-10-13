// Synthetic, de-identified demo encounters. No real patient data.
export type SampleNote = {
  id: string;
  title: string;
  market: "DHA" | "DOH" | "KSA";
  specialty: string;
  encounterType: "outpatient" | "inpatient" | "emergency" | "day_case";
  billedAmount: number;
  submittedCodes: string[];
  note: string;
};

export const sampleNotes: SampleNote[] = [
  {
    id: "mri-back",
    title: "Back pain with MRI order (Dubai)",
    market: "DHA",
    specialty: "Orthopedics",
    encounterType: "outpatient",
    billedAmount: 2350,
    submittedCodes: ["M54.50", "99214", "72148"],
    note: `Patient name: Omar Haddad   MRN: DXB-448812   Phone: +971 50 123 4567
Chief complaint: Low back pain for 3 weeks radiating to the left leg.
History: 42-year-old office worker. Pain started after lifting boxes. Pain radiates down the left buttock and posterior thigh to the calf. Numbness over the left lateral foot. No bladder or bowel symptoms. Taking ibuprofen 400 mg as needed for 1 week with partial relief. No physiotherapy yet.
Exam: Tenderness over L4-L5 paraspinal muscles. Straight leg raise positive on the left at 40 degrees. Reduced left ankle reflex. Power 5/5.
Assessment: Left lumbar radiculopathy, likely L5-S1 disc herniation.
Plan: MRI lumbar spine without contrast ordered. Continue NSAIDs, start physiotherapy. Review after MRI.`,
  },
  {
    id: "knee-oa",
    title: "Knee osteoarthritis injection (Abu Dhabi)",
    market: "DOH",
    specialty: "Orthopedics",
    encounterType: "outpatient",
    billedAmount: 1450,
    submittedCodes: ["M25.561", "20610"],
    note: `Pt: Mrs Fatima Al Mansoori  DOB: 12/03/1961  Emirates ID 784-1961-1234567-1
Follow-up visit for right knee pain for 2 years, worse on stairs.
X-ray right knee last month shows joint space narrowing and osteophytes in the medial compartment, consistent with primary osteoarthritis of the right knee.
Has completed 8 weeks of physiotherapy and regular paracetamol with little improvement.
Exam: crepitus, mild effusion, range of motion 5 to 110 degrees.
Procedure: Intra-articular corticosteroid injection into the right knee under aseptic technique. Tolerated well.
Plan: review in 6 weeks; discuss total knee replacement if no improvement.`,
  },
  {
    id: "sore-throat",
    title: "Sore throat with rapid strep test (Dubai)",
    market: "DHA",
    specialty: "Family medicine",
    encounterType: "outpatient",
    billedAmount: 420,
    submittedCodes: [],
    note: `Name: Rashed Ali   Contact: 055 987 6543
Complaint: sore throat and fever for 2 days.
Exam: temperature 38.6 C, tonsillar exudate, tender anterior cervical lymph nodes, no cough.
Rapid strep test performed in clinic: positive for group A streptococcus.
Assessment: streptococcal pharyngitis.
Plan: amoxicillin 500 mg three times daily for 10 days, fluids, paracetamol. Return if worse.`,
  },
  {
    id: "ksa-diabetes",
    title: "Diabetes and hypertension review (Riyadh)",
    market: "KSA",
    specialty: "Internal medicine",
    encounterType: "outpatient",
    billedAmount: 650,
    submittedCodes: ["E11.65"],
    note: `Patient name: Abdullah Al Qahtani  National ID 1023456789
Follow-up of type 2 diabetes mellitus and essential hypertension.
HbA1c today 7.1 percent, improved from 8.4 percent. No hypoglycaemia. Home blood pressure readings around 128/80.
Exam: BP 130/82, BMI 29, feet normal sensation.
Medications: metformin 1 g twice daily, amlodipine 5 mg daily.
Assessment: type 2 diabetes without complication, controlled. Essential hypertension, controlled.
Plan: continue current medications, repeat HbA1c in 3 months.`,
  },
];