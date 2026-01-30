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

type SystemPhase =
  | "IDLE"
  | "COLLECTING"
  | "ANALYZED"
  | "TRANSFERRING_MAIN"
  | "POST_FILTRATION"
  | "COMPLETE";

type PumpCommand =
  | "START_PUMP_A"
  | "START_PUMP_B"
  | "START_PUMP_C"
  | "STOP_ALL";

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

let systemPhase: SystemPhase = "IDLE";

let lastPrediction: PredictionResult | null = null;

let pendingPumpCommand: PumpCommand | null = null;
let commandDelivered = false; // 🔧 FIX: prevent repeated execution

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

function filtrationBracket(turbidity: number, tds: number): PredictionResult["bracket"] {
  if (tds > 1500) return "F5";
  if (tds >= 1000) return "F4";
  if (turbidity > 30) return "F3";
  if (turbidity > 10) return "F2";
  return "F1";
}

function filtrationMethod(bracket: string): string {
  switch (bracket) {
    case "F1": return "Sediment + Carbon polishing";
    case "F2": return "Sand + Carbon filtration";
    case "F3": return "Coagulation + Sand filtration";
    case "F4": return "Advanced treatment (discard)";
    case "F5": return "RO / Disposal";
    default: return "Unknown";
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
app.post("/ingest", (req, res) => {
  const { ph, turbidity, tds } = req.body;

  if (
    typeof ph !== "number" ||
    typeof turbidity !== "number" ||
    typeof tds !== "number"
  ) {
    return res.status(400).json({ error: "Invalid sensor data" });
  }
if (sessionReadings.length >= BATCH_SIZE) {
  return res.json({
    status: "ignored",
    reason: "batch_complete",
    collected: sessionReadings.length,
    phase: systemPhase,
  });
}
  // ✅ Only collect during COLLECTING phase
  if (systemPhase === "COLLECTING") {
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
    phase: systemPhase,
  });
});

/* ======================================================
   2️⃣ SESSION CONTROL
====================================================== */
app.post("/session/start", (_req, res) => {
  sessionReadings = [];
  session.active = true;
  session.completed = false;
  session.startedAt = Date.now();
  systemPhase = "COLLECTING";
  lastPrediction = null;
  pendingPumpCommand = null;
  commandDelivered = false;

  res.json({ status: "session_started", batchSize: BATCH_SIZE });
});

app.post("/session/reset", (_req, res) => {
  session.active = false;
  session.completed = false;
  session.startedAt = null;
  sessionReadings = [];
  systemPhase = "IDLE";
  lastPrediction = null;
  pendingPumpCommand = null;
  commandDelivered = false;

  res.json({ status: "session_reset" });
});

app.get("/session/status", (_req, res) => {
  res.json({
    active: session.active,
    completed: session.completed,
    collected: sessionReadings.length,
    phase: systemPhase,
  });
});

app.get("/session/readings", (_req, res) => {
  res.json({
    readings: sessionReadings.map(r => ({
      ph: r.ph,
      turbidity: r.turbidity,
      tds: r.tds,
      timestamp: r.timestamp,
    })),
  });
});

/* ======================================================
   3️⃣ ANALYZE WATER
====================================================== */
app.post("/analyze-water", (_req, res) => {
  // 🔧 FIX: prevent re-analysis
 if (systemPhase !== "COLLECTING") {
  return res.status(400).json({
    error: "Analysis not allowed in current phase",
    phase: systemPhase,
  });
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

  session.active = false;
  session.completed = true;
  systemPhase = "ANALYZED";

  res.json({ ...lastPrediction, average: avg });
});

/* ======================================================
   4️⃣ PREDICTION FETCH
====================================================== */
app.get("/prediction/latest", (_req, res) => {
  if (!lastPrediction) {
    return res.status(404).json({ error: "No prediction available" });
  }
  res.json(lastPrediction);
});

/* ======================================================
   5️⃣ EVENT-BASED PUMP COMMANDS
====================================================== */
app.post("/pump/command", (req, res) => {
  const { command } = req.body;

  if (!["START_PUMP_A", "START_PUMP_B", "START_PUMP_C", "STOP_ALL"].includes(command)) {
    return res.status(400).json({ error: "Invalid command" });
  }

  // 🔧 FIX: STOP_ALL allowed anytime
  if (systemPhase !== "ANALYZED" && command !== "STOP_ALL") {
    return res.status(400).json({ error: "Invalid system phase" });
  }

  pendingPumpCommand = command;
  commandDelivered = false;

  // 🔧 FIX: correct phase transitions
  if (command === "STOP_ALL") {
    systemPhase = "IDLE";
  } else if (command === "START_PUMP_C") {
    systemPhase = "POST_FILTRATION";
  } else {
    systemPhase = "TRANSFERRING_MAIN";
  }

  res.json({ status: "command_queued", command });
});

/* ======================================================
   6️⃣ ESP FETCHES COMMAND (ONE-TIME)
====================================================== */
app.get("/pump/command", (_req, res) => {
  if (!pendingPumpCommand || commandDelivered) {
    return res.json({ command: null });
  }

  commandDelivered = true;
  res.json({ command: pendingPumpCommand });
});

/* ======================================================
   7️⃣ ESP ACKNOWLEDGES COMMAND
====================================================== */
app.post("/pump/ack", (_req, res) => {
  pendingPumpCommand = null;
  commandDelivered = false;
  systemPhase = "IDLE";

  res.json({ status: "acknowledged" });
});

/* ===============================
   SERVER
================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
