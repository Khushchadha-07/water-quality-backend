"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var cors_1 = __importDefault(require("cors"));
var app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
/* ======================================================
   MODEL 1 — REUSABILITY CLASSIFICATION
====================================================== */
function classifyReusability(ph, turbidity, tds) {
    if (ph < 6.5 || ph > 8.5)
        return false;
    if (turbidity > 10)
        return false;
    if (tds > 1000)
        return false;
    return true;
}
/* ======================================================
   MODEL 2 — FILTRATION BRACKET SELECTION
====================================================== */
function selectFiltrationBracket(turbidity, tds) {
    if (tds > 1500) {
        return { bracket: "F5", method: "Reverse Osmosis (RO)" };
    }
    if (tds >= 1000 && tds <= 1500) {
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
/* ======================================================
   HEALTH CHECK
====================================================== */
app.get("/", function (_req, res) {
    res.send("Water Quality Backend is running");
});
/* ======================================================
   MAIN API
====================================================== */
app.post("/analyze-water", function (req, res) {
    var _a = req.body, ph = _a.ph, turbidity = _a.turbidity, tds = _a.tds;
    if (ph === undefined || turbidity === undefined || tds === undefined) {
        return res.status(400).json({
            error: "Missing parameters. Required: ph, turbidity, tds"
        });
    }
    var reusable = classifyReusability(ph, turbidity, tds);
    if (reusable) {
        return res.json({
            status: "OK",
            reusable: "YES",
            tank: "Tank A",
            filtrationBracket: "NONE",
            filtrationMethod: "Basic Filtration Only",
            explanation: "All water quality parameters are within acceptable reuse limits."
        });
    }
    var filtration = selectFiltrationBracket(turbidity, tds);
    var note = "Water exceeds reuse limits and requires treatment.";
    if (ph < 6.5 || ph > 8.5) {
        note += " pH adjustment is recommended.";
    }
    return res.json({
        status: "OK",
        reusable: "NO",
        tank: "Tank B",
        filtrationBracket: filtration.bracket,
        filtrationMethod: filtration.method,
        explanation: note
    });
});
/* ======================================================
   SERVER START
====================================================== */
var PORT = process.env.PORT
    ? parseInt(process.env.PORT)
    : 8080;
app.listen(PORT, "0.0.0.0", function () {
    console.log("Backend server running on port ".concat(PORT));
});
//# sourceMappingURL=index.js.map