import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Anti-abus simple
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 20, // 20 requêtes/minute par IP (à ajuster)
  })
);

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/api/scan", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "imageBase64 manquant" });

    // IMPORTANT: clé OpenAI stockée dans Render (Environment Variables)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY non configurée" });

    const prompt = `Tu analyses une photo de boîte de médicament ou ordonnance manuscrite.
Retourne UNIQUEMENT un JSON valide.
Schéma:
{
  "name": string|null,
  "category": "douleur/fièvre"|"rhume/grippe"|"digestif"|"allergie"|"dermatologie"|"antibiotique"|"vitamines"|"autres"|null,
  "expiryDate": "YYYY-MM-DD"|null,
  "confidence": number
}`;

    // Appel OpenAI (format générique; tu adapteras selon le SDK que tu utilises)
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: `data:image/jpeg;base64,${imageBase64}` }
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: "OpenAI error", details: errText });
    }

    const data = await response.json();

    // Selon le format exact retourné, récupère le texte JSON
    // Ici on suppose que le modèle renvoie du texte JSON dans output_text
    const outputText = data.output_text ?? "";
    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      return res.status(422).json({ error: "JSON invalide", raw: outputText });
    }

    return res.json(parsed);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on", port));
