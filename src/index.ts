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

type PumpState = {
  pumpA: boolean; // Main → Tank A (Reusable)
  pumpB: boolean; // Main → Tank B (Discard)
  pumpC: boolean; // Tank A → Tank C (Post-filtration)
};

type PredictionResult = {
  bracket: "F1" | "F2" | "F3" | "F4" | "F5";
  reusable: boolean;
  suggestedTank: "A" | "B";
  filtrationMethod: string;
  decidedAt: number;
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

let pumpState: PumpState = {
  pumpA: false,
  pumpB: false,
  pumpC: false,
};

let lastPrediction: PredictionResult | null = null;

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
   FILTRATION BRACKET
================================ */
function filtrationBracket(turbidity: number, tds: number): PredictionResult["bracket"] {
  if (tds > 1500) return "F5";
  if (tds >= 1000) return "F4";
  if (turbidity > 30) return "F3";
  if (turbidity > 10) return "F2";
  return "F1";
}

function filtrationMethod(bracket: string): string {
  switch (bracket) {
    case "F1":
      return "Sediment + Carbon polishing";
    case "F2":
      return "Sand + Carbon filtration";
    case "F3":
      return "Coagulation + Sand filtration";
    case "F4":
      return "Ultrafiltration (not reusable)";
    case "F5":
      return "RO / Advanced treatment (discard)";
    default:
      return "Unknown";
  }
}

/* ===============================
   HEALTH
================================ */
app.get("/", (_req, res) => {
  res.send("Water IQ Backend Running");
});

/* ======================================================
   1️⃣ INGEST SENSOR DATA (ESP)
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
    collected: sessionReadings.length,
  });
});

/* ======================================================
   2️⃣ SESSION CONTROL
====================================================== */
app.post("/session/start", (_req, res) => {
  session.active = true;
  session.completed = false;
  session.startedAt = Date.now();
  sessionReadings = [];
  lastPrediction = null;

  res.json({ status: "session_started", batchSize: BATCH_SIZE });
});

app.post("/session/reset", (_req, res) => {
  session.active = false;
  session.completed = false;
  session.startedAt = null;
  sessionReadings = [];
  lastPrediction = null;

  res.json({ status: "session_reset" });
});

app.get("/session/status", (_req, res) => {
  res.json({
    active: session.active,
    completed: session.completed,
    collected: sessionReadings.length,
  });
});

app.get("/session/readings", (_req, res) => {
  const avg =
    sessionReadings.length > 0 ? computeAverage(sessionReadings) : null;

  res.json({
    active: session.active,
    completed: session.completed,
    readings: sessionReadings,
    average: avg,
  });
});

/* ======================================================
   3️⃣ ANALYZE WATER (CORE LOGIC)
====================================================== */
app.post("/analyze-water", (_req, res) => {
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
  const bracket = filtrationBracket(avg.turbidity, avg.tds);

  const reusable = bracket === "F1" || bracket === "F2";
  const suggestedTank = reusable ? "A" : "B";

  lastPrediction = {
    bracket,
    reusable,
    suggestedTank,
    filtrationMethod: filtrationMethod(bracket),
    decidedAt: Date.now(),
  };

  session.completed = true;
  session.active = false;

  res.json({
    ...lastPrediction,
    average: avg,
  });
});

/* ======================================================
   4️⃣ PREDICTION FETCH (FRONTEND + ESP LCD)
====================================================== */
app.get("/prediction/latest", (_req, res) => {
  if (!lastPrediction) {
    return res.status(404).json({ error: "No prediction available" });
  }
  res.json(lastPrediction);
});

/* ======================================================
   5️⃣ PUMP CONTROL (MANUAL, FRONTEND)
====================================================== */
app.post("/pump/on", (req: Request, res: Response) => {
  const { pump } = req.body;

  if (!["A", "B", "C"].includes(pump)) {
    return res.status(400).json({ error: "Invalid pump" });
  }

  pumpState = {
    pumpA: pump === "A",
    pumpB: pump === "B",
    pumpC: pump === "C",
  };

  res.json({ status: "pump_on", pumpState });
});

app.post("/pump/off", (req: Request, res: Response) => {
  const { pump } = req.body;

  if (!["A", "B", "C"].includes(pump)) {
    return res.status(400).json({ error: "Invalid pump" });
  }

  pumpState[`pump${pump}` as keyof PumpState] = false;

  res.json({ status: "pump_off", pumpState });
});

app.get("/pump/status", (_req, res) => {
  res.json(pumpState);
});

/* ===============================
   SERVER
================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
