import express, { Request, Response } from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   CONFIG
================================ */
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/* ===============================
   TYPES
================================ */
type SensorReading = {
  ph: number;
  turbidity: number;
  tds: number;
  timestamp: number;
};

/* ===============================
   IN-MEMORY BUFFER
================================ */
let readings: SensorReading[] = [];

/* ===============================
   HELPER FUNCTIONS
================================ */
function pruneOldReadings() {
  const cutoff = Date.now() - WINDOW_MS;
  readings = readings.filter(r => r.timestamp >= cutoff);
}

function computeAverage() {
  pruneOldReadings();
  if (readings.length === 0) return null;

  const sum = readings.reduce(
    (acc, r) => {
      acc.ph += r.ph;
      acc.turbidity += r.turbidity;
      acc.tds += r.tds;
      return acc;
    },
    { ph: 0, turbidity: 0, tds: 0 }
  );

  return {
    ph: +(sum.ph / readings.length).toFixed(2),
    turbidity: +(sum.turbidity / readings.length).toFixed(2),
    tds: Math.round(sum.tds / readings.length)
  };
}

/* ===============================
   MODEL 1 — REUSABILITY
================================ */
function isReusable(ph: number, turbidity: number, tds: number): boolean {
  if (ph < 6.5 || ph > 8.5) return false;
  if (turbidity > 10) return false;
  if (tds > 1000) return false;
  return true;
}

/* ===============================
   MODEL 2 — FILTRATION BRACKET
================================ */
function filtrationBracket(turbidity: number, tds: number): string {
  if (tds > 1500) return "F5";
  if (tds >= 1000) return "F4";
  if (turbidity > 30) return "F3";
  if (turbidity > 10) return "F2";
  return "F1";
}

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (_req: Request, res: Response) => {
  res.send("Water Quality Backend running");
});

/* ===============================
   SENSOR INGEST (ESP / MANUAL)
================================ */
app.post("/sensor/data", (req: Request, res: Response) => {
  const { ph, turbidity, tds } = req.body;

  if (
    typeof ph !== "number" ||
    typeof turbidity !== "number" ||
    typeof tds !== "number"
  ) {
    return res.status(400).json({ error: "Invalid sensor data" });
  }

  readings.push({
    ph,
    turbidity,
    tds,
    timestamp: Date.now()
  });

  pruneOldReadings();

  res.json({ status: "stored", count: readings.length });
});

/* ===============================
   RAW CONTINUOUS DATA (LAPTOP)
================================ */
app.get("/sensor/raw", (_req: Request, res: Response) => {
  pruneOldReadings();
  res.json({
    window: "last 5 minutes",
    count: readings.length,
    readings
  });
});

/* ===============================
   AVERAGED DATA (PHONE / REPORT)
================================ */
app.get("/sensor/average", (_req: Request, res: Response) => {
  const avg = computeAverage();
  if (!avg) {
    return res.status(404).json({ error: "No data available" });
  }

  res.json({
    window: "5 minutes",
    average: avg
  });
});

/* ===============================
   ANALYSIS (PREDICTION MODEL)
================================ */
app.post("/analyze-water", (req: Request, res: Response) => {
  const { ph, turbidity, tds } = req.body;

  if (
    typeof ph !== "number" ||
    typeof turbidity !== "number" ||
    typeof tds !== "number"
  ) {
    return res.status(400).json({
      error: "ph, turbidity, and tds must be numbers"
    });
  }

  const reusable = isReusable(ph, turbidity, tds);

  if (reusable) {
    return res.json({
      reusable: "YES",
      tank: "Tank A",
      filtrationBracket: "F1"
    });
  }

  const bracket = filtrationBracket(turbidity, tds);

  return res.json({
    reusable: "NO",
    tank: "Tank B",
    filtrationBracket: bracket
  });
});

/* ===============================
   SERVER START
================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
