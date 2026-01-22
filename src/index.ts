import express, { Request, Response } from "express";
import cors from "cors";

/* ===============================
   APP SETUP
================================ */
const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   DATASETS (STANDARDS-BASED)
================================ */

/*
Reusability thresholds
(WHO / BIS simplified)
*/
const REUSABILITY_LIMITS = {
  ph: { min: 6.5, max: 8.5 },
  turbidity: { max: 10 }, // NTU
  tds: { max: 1000 } // ppm
};

/*
Filtration decision rules
*/
const FILTRATION_RULES = [
  {
    bracket: "F5",
    method: "Reverse Osmosis (RO)",
    check: (tds: number, _t: number) => tds > 1500
  },
  {
    bracket: "F4",
    method: "Ultrafiltration + Activated Carbon",
    check: (tds: number, _t: number) => tds > 1000
  },
  {
    bracket: "F3",
    method: "Coagulation + Sand Filtration",
    check: (_tds: number, turbidity: number) => turbidity > 30
  },
  {
    bracket: "F2",
    method: "Sand + Carbon + Cloth Filtration",
    check: (_tds: number, turbidity: number) => turbidity > 10
  },
  {
    bracket: "F1",
    method: "Sand + Activated Carbon",
    check: (_tds: number, _t: number) => true
  }
];

/* ===============================
   MODEL 1: REUSABILITY CHECK
================================ */
function isReusable(
  ph: number,
  turbidity: number,
  tds: number
): boolean {
  if (ph < REUSABILITY_LIMITS.ph.min || ph > REUSABILITY_LIMITS.ph.max) {
    return false;
  }
  if (turbidity > REUSABILITY_LIMITS.turbidity.max) {
    return false;
  }
  if (tds > REUSABILITY_LIMITS.tds.max) {
    return false;
  }
  return true;
}

/* ===============================
   MODEL 2: FILTRATION SELECTION
================================ */
function selectFiltration(turbidity: number, tds: number) {
  for (const rule of FILTRATION_RULES) {
    if (rule.check(tds, turbidity)) {
      return {
        bracket: rule.bracket,
        method: rule.method
      };
    }
  }
}

/* ===============================
   HEALTH CHECK ROUTE
================================ */
app.get("/", (_req: Request, res: Response) => {
  res.send("Water Quality Backend is running");
});

/* ===============================
   MAIN API — USED BY FRONTEND
================================ */
app.post("/analyze-water", (req: Request, res: Response) => {
  const { ph, turbidity, tds } = req.body;

  /* ---- Validation ---- */
  if (
    typeof ph !== "number" ||
    typeof turbidity !== "number" ||
    typeof tds !== "number"
  ) {
    return res.status(400).json({
      status: "ERROR",
      message: "Invalid or missing parameters: ph, turbidity, tds"
    });
  }

  /* ---- Model 1 ---- */
  const reusable = isReusable(ph, turbidity, tds);

  if (reusable) {
    return res.json({
      status: "OK",
      reusable: "YES",
      tank: "Tank A",
      filtrationBracket: "NONE",
      filtrationMethod: "No advanced filtration required",
      explanation:
        "Averaged water quality parameters fall within acceptable reuse limits."
    });
  }

  /* ---- Model 2 ---- */
  const filtration = selectFiltration(turbidity, tds);

  let explanation =
    "Water exceeds reuse thresholds and requires treatment.";

  if (ph < REUSABILITY_LIMITS.ph.min || ph > REUSABILITY_LIMITS.ph.max) {
    explanation += " pH correction is recommended.";
  }

  return res.json({
    status: "OK",
    reusable: "NO",
    tank: "Tank B",
    filtrationBracket: filtration.bracket,
    filtrationMethod: filtration.method,
    explanation
  });
});

/* ===============================
   SERVER START
================================ */
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
