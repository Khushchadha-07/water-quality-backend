import express, { Request, Response } from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   CONFIG
================================ */
const BATCH_SIZE = 10;

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
  completed: boolean;
  startedAt: number | null;
};

type TankLevels = {
  tankA: number; // percentage 0–100
  tankB: number; // percentage 0–100
  updatedAt: number | null;
};

type PumpState = {
  pumpA: boolean;
  pumpB: boolean;
};

/* ===============================
   IN-MEMORY STATE
================================ */
let sessionReadings: SensorReading[] = [];

let session: SessionState = {
  active: false,
  completed: false,
  startedAt: null,
};

let tankLevels: TankLevels = {
  tankA: 0,
  tankB: 0,
  updatedAt: null,
};

let pumpState: PumpState = {
  pumpA: false,
  pumpB: false,
};

/* ===============================
   HELPERS
================================ */
function computeAverage(readings: SensorReading[]) {
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
app.get("/", (_req, res) => {
  res.send("Water IQ Backend Running");
});

/* ======================================================
   1️⃣ INGEST — ESP WATER QUALITY DATA
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

  if (session.active && !session.completed) {
    sessionReadings.push({
      ph,
      turbidity,
      tds,
      timestamp: Date.now(),
    });
  }

  res.json({
    status: "received",
    sessionActive: session.active,
    sessionCount: sessionReadings.length,
  });
});

/* ======================================================
   2️⃣ SESSION START — FRONTEND GATE
====================================================== */
app.post("/session/start", (_req: Request, res: Response) => {
  session.active = true;
  session.completed = false;
  session.startedAt = Date.now();
  sessionReadings = [];

  res.json({
    status: "session_started",
    batchSize: BATCH_SIZE,
  });
});

/* ======================================================
   3️⃣ SESSION RESET
====================================================== */
app.post("/session/reset", (_req: Request, res: Response) => {
  session.active = false;
  session.completed = false;
  session.startedAt = null;
  sessionReadings = [];

  res.json({
    status: "session_reset",
  });
});

/* ======================================================
   4️⃣ SESSION STATUS
====================================================== */
app.get("/session/status", (_req: Request, res: Response) => {
  res.json({
    active: session.active,
    completed: session.completed,
    collected: sessionReadings.length,
  });
});

/* ======================================================
   5️⃣ SESSION READINGS — LIVE VIEW
====================================================== */
app.get("/session/readings", (_req: Request, res: Response) => {
  const avg =
    sessionReadings.length > 0 ? computeAverage(sessionReadings) : null;

  res.json({
    active: session.active,
    completed: session.completed,
    collected: sessionReadings.length,
    readings: sessionReadings,
    average: avg,
  });
});

/* ======================================================
   6️⃣ ANALYZE WATER — SUGGEST TANK ONLY
====================================================== */
app.post("/analyze-water", (_req: Request, res: Response) => {
  if (!session.active) {
    return res.status(400).json({ error: "Session not started" });
  }

  if (sessionReadings.length < BATCH_SIZE) {
    return res.status(400).json({
      error: "Insufficient data",
      required: BATCH_SIZE,
      current: sessionReadings.length,
    });
  }

  const avg = computeAverage(sessionReadings);
  const reusable = isReusable(avg.ph, avg.turbidity, avg.tds);

  session.completed = true;
  session.active = false;

  if (reusable) {
    return res.json({
      reusable: "YES",
      suggestedTank: "A",
      filtrationBracket: "F1",
      average: avg,
    });
  }

  return res.json({
    reusable: "NO",
    suggestedTank: "B",
    filtrationBracket: filtrationBracket(avg.turbidity, avg.tds),
    average: avg,
  });
});

/* ======================================================
   7️⃣ MANUAL PUMP CONTROL — ON
====================================================== */
app.post("/pump/on", (req: Request, res: Response) => {
  const { tank } = req.body;

  if (tank !== "A" && tank !== "B") {
    return res.status(400).json({ error: "Invalid tank selection" });
  }

  pumpState.pumpA = tank === "A";
  pumpState.pumpB = tank === "B";

  res.json({
    status: "pump_on",
    activePump: tank,
    pumpState,
  });
});

/* ======================================================
   8️⃣ MANUAL PUMP CONTROL — OFF
====================================================== */
app.post("/pump/off", (_req: Request, res: Response) => {
  pumpState.pumpA = false;
  pumpState.pumpB = false;

  res.json({
    status: "pump_off",
    pumpState,
  });
});

/* ======================================================
   9️⃣ PUMP STATUS — ESP + FRONTEND POLL
====================================================== */
app.get("/pump/status", (_req: Request, res: Response) => {
  res.json(pumpState);
});

/* ======================================================
   10️⃣ (OPTIONAL) TANK LEVEL INGEST
====================================================== */
app.post("/tank-levels/ingest", (req: Request, res: Response) => {
  const { tankA, tankB } = req.body;

  if (
    typeof tankA !== "number" ||
    typeof tankB !== "number" ||
    tankA < 0 || tankA > 100 ||
    tankB < 0 || tankB > 100
  ) {
    return res.status(400).json({ error: "Invalid tank levels" });
  }

  tankLevels = {
    tankA,
    tankB,
    updatedAt: Date.now(),
  };

  res.json({ status: "tank_levels_updated" });
});

/* ======================================================
   11️⃣ (OPTIONAL) TANK LEVEL FETCH
====================================================== */
app.get("/tank-levels", (_req: Request, res: Response) => {
  res.json(tankLevels);
});

/* ===============================
   SERVER START
================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
