import React, { useState } from "react";
import ReactDOM from "react-dom/client";

type ApiResponse = {
  status: string;
  reusable: string;
  tank: string;
  filtrationBracket: string;
  filtrationMethod: string;
  explanation: string;
};

function App() {
  const [ph, setPh] = useState("");
  const [turbidity, setTurbidity] = useState("");
  const [tds, setTds] = useState("");
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const analyzeWater = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(
        "https://water-quality-backend-qxd3.onrender.com/analyze-water",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ph: Number(ph),
            turbidity: Number(turbidity),
            tds: Number(tds)
          })
        }
      );

      if (!response.ok) {
        throw new Error("Backend error");
      }

      const data = await response.json();
      setResult(data);
    } catch (e) {
      setError("Failed to analyze water");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial" }}>
      <h1>Water Quality Monitoring System</h1>

      <div>
        <label>pH:</label>
        <input value={ph} onChange={e => setPh(e.target.value)} />
      </div>

      <div>
        <label>Turbidity:</label>
        <input value={turbidity} onChange={e => setTurbidity(e.target.value)} />
      </div>

      <div>
        <label>TDS:</label>
        <input value={tds} onChange={e => setTds(e.target.value)} />
      </div>

      <button onClick={analyzeWater} disabled={loading}>
        {loading ? "Analyzing..." : "Analyze Water"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {result && (
        <div style={{ marginTop: "1rem", border: "1px solid #ccc", padding: "1rem" }}>
          <p><b>Reusable:</b> {result.reusable}</p>
          <p><b>Tank:</b> {result.tank}</p>
          <p><b>Filtration Bracket:</b> {result.filtrationBracket}</p>
          <p><b>Filtration Method:</b> {result.filtrationMethod}</p>
          <p><b>Explanation:</b> {result.explanation}</p>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
