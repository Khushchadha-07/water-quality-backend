import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   MODEL 1 — REUSABILITY CHECK
================================ */
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

/* ===============================
   MODEL 2 — FILTRATION SELECTION
================================ */
function selectFiltration(turbidity: number, tds: number) {
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
    return { bracket: "F2", method: "Sand + Carbon + Cloth" };
  }
  return { bracket: "F1", method: "Sand + Activated Carbon" };
}

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.send("Water Quality Backend is running");
});

/* ===============================
   MAIN API
================================ */
app.post("/analyze-water", (req, res) => {
  const { ph, turbidity, tds } = req.body;

  if (ph === undefined || turbidity === undefined || tds === undefined) {
    return res.status(400).json({
      error: "Missing parameters: ph, turbidity, tds"
    });
  }

  const reusable = classifyReusability(ph, turbidity, tds);

  if (reusable) {
    return res.json({
      reusable: "YES",
      tank: "Tank A",
      filtration: "Basic Filtration",
      explanation: "Water parameters are within reuse limits"
    });
  }

  const filtration = selectFiltration(turbidity, tds);

  return res.json({
    reusable: "NO",
    tank: "Tank B",
    filtrationBracket: filtration.bracket,
    filtrationMethod: filtration.method,
    explanation: "Water exceeds reuse limits and requires treatment"
  });
});

/* ===============================
   SERVER START
================================ */
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
