import express from "express";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
import multer from "multer";
import pdfParse from "pdf-parse";
import PDFDocument from "pdfkit";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Configure multer for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

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
    maxOutputTokens: 4096
  }
});

app.post("/generate", upload.single("resume"), async (req, res) => {
  try {
    const { jobText } = req.body;
    const resumeFile = req.file;

    if (!jobText) {
      return res.status(400).json({ error: "Missing jobText" });
    }

    if (!resumeFile) {
      return res.status(400).json({ error: "Missing resume file" });
    }

    // Extract text from PDF
    let resumeText;
    try {
      const pdfData = await pdfParse(resumeFile.buffer);
      resumeText = pdfData.text;
      if (!resumeText || resumeText.trim().length === 0) {
        return res.status(400).json({ error: "Could not extract text from PDF" });
      }
      console.log("📄 Extracted resume text length:", resumeText.length);
      console.log("📄 First 300 chars of resume:", resumeText.substring(0, 300));
    } catch (err) {
      console.error("PDF parsing error:", err);
      return res.status(400).json({ error: "Failed to parse PDF: " + err.message });
    }

    // Generate cover letter using template
    const prompt = TEMPLATE
      .replace("{{JOB_TEXT}}", jobText)
      .replace("{{RESUME_TEXT}}", resumeText);

    console.log("📝 Prompt length:", prompt.length);
    console.log("📄 Resume text length:", resumeText.length);

    // call Gemini via SDK
    const result = await model.generateContent(prompt);
    const response = result.response;
    
    // Check if response was truncated
    const finishReason = response.candidates?.[0]?.finishReason;
    console.log("🔍 Response details:", {
      finishReason,
      candidates: response.candidates?.length,
      candidate0: response.candidates?.[0]
    });
    
    if (finishReason === "MAX_TOKENS") {
      console.warn("⚠️ Response was truncated due to MAX_TOKENS limit - consider increasing maxOutputTokens");
    }
    
    // Extract text - try multiple methods
    let coverLetter = "";
    try {
      coverLetter = response.text();
    } catch (err) {
      console.error("Error extracting text with .text():", err);
      // Fallback: try to get text from candidates
      if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
        coverLetter = response.candidates[0].content.parts[0].text;
      }
    }

    console.log("✅ Cover letter generated, length:", coverLetter.length);
    console.log("📋 Finish reason:", finishReason);
    console.log("📋 Full cover letter:", coverLetter);
    console.log("📋 Last 200 chars:", coverLetter.substring(Math.max(0, coverLetter.length - 200)));

    if (!coverLetter || coverLetter.trim().length === 0) {
      console.error("❌ No text returned from model:", JSON.stringify(result));
      return res.status(500).json({ error: "No text returned from Gemini", raw: result });
    }

    // Generate PDF from cover letter
    const doc = new PDFDocument({
      margins: { top: 72, bottom: 72, left: 72, right: 72 }
    });

    // Set response headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=cover-letter.pdf");

    // Pipe PDF to response
    doc.pipe(res);

    // Add cover letter text to PDF with proper formatting
    doc.fontSize(11);
    doc.text(coverLetter, {
      align: "left",
      paragraphGap: 5
    });

    doc.end();
  } catch (err) {
    console.error("Server error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
