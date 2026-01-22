import express from "express";
import cors from "cors";

/* ================= BASIC SETUP ================= */

const app = express();
app.use(cors());
app.use(express.json());

/* ================= DATASET (STANDARDS-BASED) ================= */

/*
Reusability limits
(Source: WHO / BIS simplified for academic use)
*/
const REUSABILITY_LIMITS = {
  ph: { min: 6.5, max: 8.5 },
  turbidity: { max: 10 }, // NTU
  tds: { max: 1000 } // ppm
};

/*
Filtration decision dataset
*/
const FILTRATION_RULES = [
  {
    bracket: "F5",
    condition: (tds: number) => tds > 1500,
    method: "Reverse Osmosis (RO)"
  },
  {
    bracket: "F4",
    condition: (tds: number) => tds > 1000,
    method: "Ultrafiltration + Activated Carbon"
  },
  {
    bracket: "F3",
    condition: (_tds: number, turbidity: number) => turbidity > 30,
    method: "Coagulation + Sand Filtration"
  },
  {
    bracket: "F2",
    condition: (_tds: number, turbidity: number) => turbidity > 10,
    method: "Sand + Carbon + Cloth Filtration"
  },
  {
    bracket: "F1",
    condition: () => true,
    method: "Sand + Activated Carbon"
  }
];

/* ================= MODEL 1: REUSABILITY ================= */

function isReusable(ph: number, turbidity: number, tds: number): boolean {
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

/* ================= MODEL 2: FILTRATION ================= */

function selectFiltration(turbidity: number, tds: number) {
  for (const rule of FILTRATION_RULES) {
    if (rule.condition(tds, turbidity)) {
      return {
        bracket: rule.bracket,
        method: rule.method
      };
    }
  }
}

/* ================= HEALTH CHECK ================= */

app.get("/", (_req, res) => {
  res.send("Water Quality Backend is running");
});

/* ================= MAIN API ================= */
/*
THIS IS THE ONLY API YOUR FRONTEND USES
Called from HOME PAGE
*/

app.post("/analyze-water", (req, res) => {
  const { ph, turbidity, tds } = req.body;

  /* ---- Validation ---- */
  if (
    typeof ph !== "number" ||
    typeof turbidity !== "number" ||
    typeof tds !== "number"
  ) {
    return res.status(400).json({
      status: "ERROR",
      message: "Invalid or missing parameters (ph, turbidity, tds)"
    });
  }

  /* ---- Model 1 ---- */
  const reusable = isReusable(ph, turbidity, tds);

  /* ---- If reusable ---- */
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

/* ================= SERVER START ================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  co
