import express, { Request, Response } from "express";
import cors from "cors";

/* ===============================
   APP SETUP
================================ */
const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   DATASETS
================================ */

const REUSABILITY_LIMITS = {
  ph: { min: 6.5, max: 8.5 },
  turbidity: { max: 10 },
  tds: { max: 1000 }
};

type FiltrationResult = {
  bracket: string;
  method: string;
};

const FILTRATION_RULES: {
  bracket: string;
  method: string;
  check: (tds: number, turbidity: number) => boolean;
}[] = [
  {
    bracket: "F5",
    method: "Reverse Osmosis (RO)",
    check: (tds) => tds > 1500
  },
  {
    bracket: "F4",
    method: "Ultrafiltration + Activated Carbon",
    check: (tds) => tds > 1000
  },
  {
    bracket: "F3",
    method: "Coagulation + Sand Filtration",
    check: (_tds, turbidity) => turbidity > 30
  },
  {
    bracket: "F2",
    method: "Sand + Carbon + Cloth Filtration",
    check: (_tds, turbidity) => turbidity > 10
  },
  {
    bracket: "F1",
    method: "Sand + Activated Carbon",
    check: () => true
  }
];

/* ===============================
   MODEL 1 — REUSABILITY
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
   MODEL 2 — FILTRATION
================================ */
function selectFiltration(
  turbidity: number,
  tds: number
): FiltrationResult {
  for (const rule of FILTRATION_RULES) {
    if (rule.check(tds, turbidity)) {
      return {
        bracket: rule.bracket,
        method: rule.method
      };
    }
  }

  // ✅ SAFETY FALLBACK (never undefined)
  return {
    bracket: "UNKNOWN",
    method: "Manual inspection required"
  };
}

/* ===============================
   ROUTES
================================ */

app.get("/", (_req: Request, res: Response) => {
  res.send("Water Quality Backend is running");
});

app.post("/analyze-water", (req: Request, res: Response) => {
  const { ph, turbidity, tds } = req.body;

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

  const filtration = selectFiltration(turbidity, tds);

  return res.json({
    status: "OK",
    reusable: "NO",
    tank: "Tank B",
    filtrationBracket: filtration.bracket,
    filtrationMethod: filtration.method,
    explanation:
      "Water exceeds reuse limits and requires treatment before reuse."
  });
});

/* ===============================
   SERVER START
================================ */
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
