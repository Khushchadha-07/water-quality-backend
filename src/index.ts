import express, { Request, Response } from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req: Request, res: Response) => {
  res.send("Water Quality Backend is running");
});

app.post("/analyze-water", (req: Request, res: Response) => {
  const { ph, turbidity, tds } = req.body;

  if (ph == null || turbidity == null || tds == null) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const reusable =
    ph >= 6.5 && ph <= 8.5 &&
    turbidity <= 10 &&
    tds <= 1000;

  if (reusable) {
    return res.json({
      reusable: true,
      tank: "Tank A",
      filtration: "Basic filtration"
    });
  }

  let filtration = "Sand + Activated Carbon";

  if (tds > 1500) filtration = "Reverse Osmosis";
  else if (tds >= 1000) filtration = "Ultrafiltration";
  else if (turbidity > 30) filtration = "Coagulation + Sand";
  else if (turbidity > 10) filtration = "Sand + Carbon + Cloth";

  res.json({
    reusable: false,
    tank: "Tank B",
    filtration
  });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
