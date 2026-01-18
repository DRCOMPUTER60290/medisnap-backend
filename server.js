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
    max: 20,
  })
);

app.get("/health", (req, res) => res.json({ ok: true }));

function requireAppKey(req, res, next) {
  const secret = process.env.APP_SECRET;
  if (!secret) return next();
  
  const key = req.headers["x-app-key"];
  if (key !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}




app.post("/api/scan", requireAppKey, async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "imageBase64 manquant" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY non configurée" });

    // Appel correct à l'API OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Tu analyses une photo de boîte de médicament. IMPORTANT: Inclus le dosage complet dans le nom (ex: "Doliprane 500mg" PAS "Doliprane").

Retourne UNIQUEMENT un JSON valide:
{
  "name": "nom avec dosage (mg, g, ml, etc.) ou null",
  "category": "douleur/fièvre"|"rhume/grippe"|"digestif"|"allergie"|"dermatologie"|"antibiotique"|"antifongique"|"antiviral"|"cardiovasculaire"|"diabète"|"cholestérol"|"hypertension"|"thyroïde"|"psychiatrie/neurologie"|"anxiolytique"|"antidépresseur"|"somnifère"|"ophtalmologie"|"ORL"|"respiratoire/asthme"|"rhumatologie"|"vitamines/minéraux"|"contraception"|"urologie"|"autres",
  "expiryDate": "YYYY-MM-DD"|null,
  "confidence": 0.0-1.0
}

Règles:
- TOUJOURS inclure le dosage dans le nom
- Cherche la date de péremption (EXP, Péremption)
- Si image floue, retourne name: null`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extrais les informations du médicament. Retourne uniquement JSON.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      return res.status(500).json({ 
        error: "OpenAI error", 
        details: errData.error?.message || "Erreur API" 
      });
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return res.status(500).json({ error: "Pas de réponse OpenAI" });
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return res.status(422).json({ error: "JSON invalide", raw: content });
    }

    return res.json(parsed);
  } catch (e) {
    console.error("Server error:", e);
    return res.status(500).json({ error: "Server error", details: String(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on", port));
