import express, { Request, Response } from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   CONFIG
================================ */
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MIN_BATCH_SIZE = 10;

/* ===============================
   TYPES
================================ */
type SensorReading = {
  ph: number;
  turbidity: number;
  tds: number;
  timestamp: number;
};

type SessionState = {
  active: boolean;
  startedAt: number | null;
};

/* ===============================
   IN-MEMORY STORAGE
================================ */
let rawReadings: SensorReading[] = []; // always growing (windowed)
let sessionReadings: SensorReading[] = []; // ONLY valid batch
let session: SessionState = {
  active: false,
  startedAt: null,
};

/* ===============================
   HELPERS
================================ */
function pruneOldReadings() {
  const cutoff = Date.now() - WINDOW_MS;
  rawReadings = rawReadings.filter(r => r.timestamp >= cutoff);
}

function computeAverage(readings: SensorReading[]) {
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
    tds: Math.round(sum.tds / readings.length),
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

/* ======================================================
   1️⃣ INGEST — ESP SENDS DATA ALWAYS
====================================================== */
app.post("/ingest", (req: Request, res: Response) => {
  const { ph, turbidity, tds } = req.body;

  if (
    typeof ph !== "number" ||
    typeof turbidity !== "number" ||
    typeof tds !== "number"
  ) {
    return res.status(400).json({ error: "Invalid sensor data" });
  }

  const reading: SensorReading = {
    ph,
    turbidity,
    tds,
    timestamp: Date.now(),
  };

  rawReadings.push(reading);
  pruneOldReadings();

  // ONLY store in session buffer if session is active
  if (session.active) {
    sessionReadings.push(reading);
  }

  res.json({
    status: "ingested",
    sessionActive: session.active,
    rawCount: rawReadings.length,
    sessionCount: sessionReadings.length,
  });
});

/* ======================================================
   2️⃣ LATEST — FRONTEND LIVE VIEW
====================================================== */
app.get("/latest", (_req: Request, res: Response) => {
  pruneOldReadings();

  const latest = rawReadings[rawReadings.length - 1] || null;

  res.json({
    sessionActive: session.active,
    latest,
  });
});

/* ======================================================
   3️⃣ SESSION START — THE GATE
====================================================== */
app.post("/session/start", (_req: Request, res: Response) => {
  session.active = true;
  session.startedAt = Date.now();
  sessionReadings = []; // 🔥 wipe garbage

  res.json({
    status: "session_started",
    startedAt: session.startedAt,
  });
});

/* ======================================================
   4️⃣ SESSION STATUS (DEBUG / UI)
====================================================== */
app.get("/session/status", (_req: Request, res: Response) => {
  res.json({
    active: session.active,
    startedAt: session.startedAt,
    batchSize: sessionReadings.length,
  });
});

/* ======================================================
   5️⃣ ANALYSIS — DECISION + PUMP LOGIC
====================================================== */
app.post("/analyze-water", (_req: Request, res: Response) => {
  if (!session.active) {
    return res.status(400).json({
      error: "Session not started. Deploy Live Sensors first.",
    });
  }

  if (sessionReadings.length < MIN_BATCH_SIZE) {
    return res.status(400).json({
      error: "Not enough data for analysis",
      required: MIN_BATCH_SIZE,
      current: sessionReadings.length,
    });
  }

  const avg = computeAverage(sessionReadings);
  if (!avg) {
    return res.status(500).json({ error: "Average failed" });
  }

  const reusable = isReusable(avg.ph, avg.turbidity, avg.tds);

  if (reusable) {
    return res.json({
      reusable: "YES",
      tank: "Tank A",
      filtrationBracket: "F1",
      average: avg,
      pump: "PUMP_A_ON",
    });
  }

  const bracket = filtrationBracket(avg.turbidity, avg.tds);

  return res.json({
    reusable: "NO",
    tank: "Tank B",
    filtrationBracket: bracket,
    average: avg,
    pump: "PUMP_B_ON",
  });
});

/* ===============================
   SERVER START
================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
