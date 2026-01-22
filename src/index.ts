import express, { Request, Response } from "express";
import cors from "cors";

const app = express();

/* ===================== MIDDLEWARE ===================== */
app.use(cors());
app.use(express.json());

/* ===================== MODEL 1 =====================
   Reusability Classification
==================================================== */
function classifyReusability(
  ph: number,
  turbidity: number,
  tds: number
): boolean {
  if (ph < 6.5 || ph > 8.5) return false;
  if (turbidity > 10) return false;
  if (tds > 1000) return false;
  return true;
}

/* ===================== MODEL 2 =====================
   Filtration Bracket Selection
==================================================== */
function selectFiltrationBracket(
  turbidity: number,
  tds: number
): { bracket: string; method: string } {
  if (tds > 1500) {
    return { bracket: "F5", method: "Reverse Osmosis (RO)" };
  }

  if (tds >= 1000) {
    return { bracket: "F4", method: "Carbon + Ultrafiltration" };
  }

  if (turbidity > 30) {
    return { bracket: "F3", method: "Coagulation + Sand Filtration" };
  }

  if (turbidity > 10) {
    return { bracket: "F2", method: "Sand + Carbon + Cloth Filtration" };
  }

  return { bracket: "F1", method: "Sand + Activated Carbon" };
}

/* ===================== HEALTH CHECK ===================== */
app.get("/", (_req: Request, res: Response) => {
  res.send("Water Quality Backend is running");
});

/* ===================== MAIN API ===================== */
app.post("/analyze-water", (req: Request, res: Response) => {
  const { ph, turbidity, tds } = req.body;

  if (
    typeof ph !== "number" ||
    typeof turbidity !== "number" ||
    typeof tds !== "number"
  ) {
    return res.status(400).json({
      error: "Invalid input. ph, turbidity, and tds must be numbers."
    });
  }

  const reusable = classifyReusability(ph, turbidity, tds);

  if (reusable) {
    return res.json({
      status: "OK",
      reusable: "YES",
      tank: "Tank A",
      filtrationBracket: "NONE",
      filtrationMethod: "Basic Filtration",
      explanation:
        "All parameters are within acceptable reuse limits."
    });
  }

  const filtration = selectFiltrationBracket(turbidity, tds);

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

/* ===================== SERVER START ===================== */
const PORT: number = process.env.PORT
  ? parseInt(process.env.PORT)
  : 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend server running on port ${PORT}`);
});
