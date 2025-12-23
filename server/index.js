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

const TEMPLATE = fs.readFileSync("./templates/defaulttemplate.txt", "utf-8");

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
    // Standard US Letter: 8.5" x 11" = 612 x 792 points
    // 3/4 of page = 594 points
    const pageHeight = 792;
    const topMargin = 72;
    const bottomMargin = 72;
    const maxHeight = (pageHeight * 0.75) - topMargin; // Maximum height (3/4 page minus top margin)
    const pageWidth = 612 - 144; // Total width minus left and right margins
    
    // Function to measure text height using a temporary document
    const measureTextHeight = (text, fontSize, lineGap, paragraphGap) => {
      const buffer = [];
      const measureDoc = new PDFDocument({
        margins: { top: topMargin, bottom: bottomMargin, left: 72, right: 72 },
        size: [612, pageHeight]
      });
      measureDoc.on('data', buffer.push.bind(buffer));
      
      measureDoc.fontSize(fontSize);
      const startY = measureDoc.y;
      measureDoc.text(text, {
        align: "left",
        lineGap: lineGap,
        paragraphGap: paragraphGap,
        width: pageWidth
      });
      const endY = measureDoc.y;
      measureDoc.end();
      
      return endY - startY;
    };
    
    // Find optimal font size and spacing
    let fontSize = 11;
    let lineGap = 4;
    let paragraphGap = 4;
    let textHeight = measureTextHeight(coverLetter, fontSize, lineGap, paragraphGap);
    
    // Adjust if content exceeds 3/4 page
    while (textHeight > maxHeight && fontSize >= 9) {
      if (fontSize > 10) {
        fontSize -= 0.5;
      } else if (lineGap > 2) {
        lineGap -= 1;
        paragraphGap -= 1;
      } else {
        fontSize -= 0.5;
      }
      textHeight = measureTextHeight(coverLetter, fontSize, lineGap, paragraphGap);
    }
    
    // Create the actual PDF document
    const doc = new PDFDocument({
      margins: { top: topMargin, bottom: bottomMargin, left: 72, right: 72 },
      size: [612, pageHeight]
    });

    // Set response headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=cover-letter.pdf");

    // Pipe PDF to response
    doc.pipe(res);

    // Add cover letter text to PDF with calculated formatting
    doc.fontSize(fontSize);
    doc.text(coverLetter, {
      align: "left",
      lineGap: lineGap,
      paragraphGap: paragraphGap,
      width: pageWidth
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
