import express from "express";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const TEMPLATE = fs.readFileSync("./templates/default.txt", "utf-8");

// require API key
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing in .env");
  process.exit(1);
}

// init client + model
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 800
  }
});

app.post("/generate", async (req, res) => {
  try {
    const { jobText, resumeText } = req.body;
    if (!jobText || !resumeText) {
      return res.status(400).json({ error: "Missing jobText or resumeText" });
    }

    const prompt = TEMPLATE
      .replace("{{JOB_TEXT}}", jobText)
      .replace("{{RESUME_TEXT}}", resumeText);

    // call Gemini via SDK
    const result = await model.generateContent(prompt);
    // SDK response accessor may vary; this follows the SDK pattern used earlier
    const coverLetter = result?.response?.text?.() || result?.response?.output?.[0]?.content?.[0]?.text || "";

    if (!coverLetter) {
      console.error("❌ No text returned from model:", JSON.stringify(result));
      return res.status(500).json({ error: "No text returned from Gemini", raw: result });
    }

    res.json({ coverLetter });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
