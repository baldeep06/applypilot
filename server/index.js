import express from "express";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
import multer from "multer";
import pdfParse from "pdf-parse";
import PDFDocument from "pdfkit";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from '@supabase/supabase-js';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Tab, TabStopType, TabStop } from "docx";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const upload = multer({ storage: multer.memoryStorage() });

if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing in .env");
  process.exit(1);
}

if (!process.env.SUPABASE_URL) {
  console.error("❌ SUPABASE_URL missing in .env");
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY missing in .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 4096
  }
});

// Helper function to generate PDF from cover letter text
function generatePDFBuffer(coverLetter) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      size: [612, 792]
    });

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Times-Roman');
    doc.fontSize(11);

    // Check if text contains bullets or bold formatting
    const hasBullets = coverLetter.match(/^[*·]\s+/m);
    const hasBold = coverLetter.includes('**');
    
    if (hasBullets || hasBold) {
      // Process line by line with bullet and bold support
      const lines = coverLetter.split('\n');
      let isHeaderSection = true;
      let headerLines = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Detect end of header (when we hit "Dear")
        if (line.trim().startsWith('Dear')) {
          isHeaderSection = false;
          
          // Render header with tight spacing
          if (headerLines.length > 0) {
            // First line is date
            doc.text(headerLines[0], { lineGap: 0 });
            doc.moveDown(0.5); // Small space after date
            
            // Name, phone, email with NO spacing between them
            for (let j = 1; j < headerLines.length; j++) {
              doc.text(headerLines[j], { lineGap: 0 });
            }
            doc.moveDown(0.5); // Small space after contact info
            headerLines = [];
          }
        }
        
        // Accumulate header lines
        if (isHeaderSection && line.trim().length > 0) {
          headerLines.push(line.trim());
          continue;
        }
        
        // Skip empty lines in header
        if (isHeaderSection && line.trim().length === 0) {
          continue;
        }
        
        // Handle empty lines (paragraph breaks)
        if (line.trim().length === 0) {
          doc.moveDown(0.5);
          continue;
        }

        // Check if line starts with bullet
        const bulletMatch = line.match(/^([*·])\s+(.*)$/);
        
        if (bulletMatch) {
          const bulletContent = bulletMatch[2];
          
          // Parse bold formatting and create formatted text
          const parts = bulletContent.split(/(\*\*[^*]+\*\*)/g);
          let formattedParts = [];
          
          for (const part of parts) {
            if (!part) continue;
            
            if (part.startsWith('**') && part.endsWith('**')) {
              formattedParts.push({
                text: part.slice(2, -2),
                bold: true
              });
            } else if (part.trim()) {
              formattedParts.push({
                text: part,
                bold: false
              });
            }
          }
          
          // Save X position and add indent
          const originalX = doc.x;
          doc.x = originalX + 24;
          
          // Render bullet manually with bold support
          const startY = doc.y;
          doc.text('•', originalX + 24, startY, {
            continued: false,
            width: 20
          });
          
          // Render text parts
          doc.x = originalX + 44; // Position after bullet
          doc.y = startY;
          
          for (let i = 0; i < formattedParts.length; i++) {
            const { text, bold } = formattedParts[i];
            if (bold) {
              doc.font('Times-Bold');
            } else {
              doc.font('Times-Roman');
            }
            
            doc.text(text, {
              continued: i < formattedParts.length - 1,
              width: 612 - 144 - 44,
              lineGap: 0
            });
          }
          
          // End line and reset
          doc.font('Times-Roman');
          doc.x = originalX;
          doc.moveDown(0.5);
          
        } else {
          // Regular line - handle bold formatting
          const parts = line.split(/(\*\*[^*]+\*\*)/g);
          let isFirst = true;
          
          for (const part of parts) {
            if (!part) continue;
            
            if (part.startsWith('**') && part.endsWith('**')) {
              const boldText = part.slice(2, -2);
              doc.font('Times-Bold');
              doc.text(boldText, { continued: !isFirst, lineGap: 0 });
              doc.font('Times-Roman');
            } else {
              doc.text(part, { continued: !isFirst, lineGap: 0 });
            }
            isFirst = false;
          }
          
          if (!isFirst) {
            doc.text(''); // End line
          }
          doc.moveDown(0.5);
        }
      }
    } else {
      // Simple text without formatting
      doc.text(coverLetter, {
        align: "left",
        lineGap: 0,
        paragraphGap: 0,
        width: 612 - 144
      });
    }

    doc.end();
  });
}

// Helper function to generate DOCX from cover letter text
async function generateDOCXBuffer(coverLetter) {
  const lines = coverLetter.split('\n');
  const paragraphs = [];
  let isHeaderSection = true;
  let headerLines = [];
  
  // Check if text contains bullets or bold formatting (like PDF code does)
  const hasBullets = coverLetter.match(/^[*·]\s+/m);
  const hasBold = coverLetter.includes('**');
  
  // Helper to create TextRun with Times New Roman 11pt font
  const createTextRun = (text, bold = false) => {
    return new TextRun({
      text: text,
      font: "Times New Roman",
      size: 22, // 11pt in half-points (11 * 2 = 22)
      bold: bold
    });
  };
  
  // Helper to create paragraph with proper spacing (half line = ~6pt = 120 twips)
  const createParagraph = (children, spacingAfter = 120, indent = null) => {
    const paraOptions = {
      children: children,
      spacing: { after: spacingAfter }
    };
    if (indent) {
      paraOptions.indent = indent;
    }
    return new Paragraph(paraOptions);
  };

  if (hasBullets || hasBold) {
    // Process line by line with bullet and bold support (matching PDF logic)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect end of header (when we hit "Dear")
      if (line.trim().startsWith('Dear')) {
        isHeaderSection = false;
        
        // Render header with proper spacing (matching PDF: date with space after, contact info with NO spacing between)
        if (headerLines.length > 0) {
          // First line is date - small space after (matching PDF moveDown(0.5))
          paragraphs.push(createParagraph(
            [createTextRun(headerLines[0].trim())],
            120 // moveDown(0.5) ≈ 6pt = 120 twips
          ));
          
          // Name, phone, email with NO spacing between them (matching PDF lineGap: 0)
          for (let j = 1; j < headerLines.length; j++) {
            paragraphs.push(createParagraph(
              [createTextRun(headerLines[j].trim())],
              0 // NO spacing between contact info lines
            ));
          }
          
          // Small space after contact info (matching PDF moveDown(0.5))
          paragraphs.push(createParagraph(
            [createTextRun("")],
            120 // moveDown(0.5) ≈ 6pt = 120 twips
          ));
          headerLines = [];
        }
        // Continue to process the "Dear" line below (don't skip it)
      }
      
      // Accumulate header lines
      if (isHeaderSection && line.trim().length > 0) {
        headerLines.push(line.trim());
        continue;
      }
      
      // Skip empty lines in header
      if (isHeaderSection && line.trim().length === 0) {
        continue;
      }
      
      // Handle empty lines (paragraph breaks) - matching PDF moveDown(0.5)
      if (line.trim().length === 0) {
        paragraphs.push(createParagraph([createTextRun("")], 120));
        continue;
      }

      // Check if line starts with bullet
      const bulletMatch = line.match(/^([*·])\s+(.*)$/);
      
      if (bulletMatch) {
        const bulletContent = bulletMatch[2];
        
        // Parse bold formatting and create formatted text
        const parts = bulletContent.split(/(\*\*[^*]+\*\*)/g);
        const textRuns = [];
        
        for (const part of parts) {
          if (!part) continue;
          
          if (part.startsWith('**') && part.endsWith('**')) {
            textRuns.push(createTextRun(part.slice(2, -2), true));
          } else if (part.trim()) {
            textRuns.push(createTextRun(part));
          }
        }
        
        // Only add paragraph if there are text runs
        if (textRuns.length > 0) {
          // Add bullet character and tab to properly space text at 44pt (matching PDF)
          textRuns.unshift(new Tab());
          textRuns.unshift(createTextRun("•"));
          
          // Indent to match PDF: bullet at 24pt, text at 44pt (20pt further)
          // Use left indent = 24pt (where bullet is), tab stop at 44pt from left margin
          paragraphs.push(new Paragraph({
            children: textRuns,
            spacing: { after: 120 }, // moveDown(0.5) after bullet
            indent: { 
              left: 480   // 24pt = 480 twips (where bullet starts)
            },
            tabStops: [
              {
                type: TabStopType.LEFT,
                position: 880 // 44pt = 880 twips from left margin (where text should start, matching PDF)
              }
            ]
          }));
        }
      } else {
        // Regular line - handle bold formatting
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        const textRuns = [];
        
        for (const part of parts) {
          if (!part) continue;
          
          if (part.startsWith('**') && part.endsWith('**')) {
            textRuns.push(createTextRun(part.slice(2, -2), true));
          } else {
            textRuns.push(createTextRun(part));
          }
        }
        
        // Only add paragraph if there are text runs
        if (textRuns.length > 0) {
          paragraphs.push(createParagraph(textRuns, 120)); // moveDown(0.5) after regular lines
        }
      }
    }
  } else {
    // Simple text without formatting - split by newlines and create paragraphs
    // Still handle header spacing properly
    let simpleHeaderSection = true;
    let simpleHeaderLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect end of header (when we hit "Dear")
      if (line.trim().startsWith('Dear')) {
        simpleHeaderSection = false;
        
        // Render header with proper spacing (matching PDF)
        if (simpleHeaderLines.length > 0) {
          // First line is date - small space after
          paragraphs.push(createParagraph(
            [createTextRun(simpleHeaderLines[0].trim())],
            120
          ));
          
          // Name, phone, email with NO spacing between them
          for (let j = 1; j < simpleHeaderLines.length; j++) {
            paragraphs.push(createParagraph(
              [createTextRun(simpleHeaderLines[j].trim())],
              0 // NO spacing between contact info lines
            ));
          }
          
          // Small space after contact info
          paragraphs.push(createParagraph(
            [createTextRun("")],
            120
          ));
          simpleHeaderLines = [];
        }
      }
      
      // Accumulate header lines
      if (simpleHeaderSection && line.trim().length > 0) {
        simpleHeaderLines.push(line.trim());
        continue;
      }
      
      // Skip empty lines in header
      if (simpleHeaderSection && line.trim().length === 0) {
        continue;
      }
      
      // Handle empty lines (paragraph breaks)
      if (line.trim().length === 0) {
        paragraphs.push(createParagraph([createTextRun("")], 120));
      } else {
        paragraphs.push(createParagraph([createTextRun(line.trim())], 120));
      }
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: paragraphs
    }]
  });

  return await Packer.toBuffer(doc);
}

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(' ')[1];

  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      console.error(`Google API error: ${response.status} ${response.statusText}`);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const userInfo = await response.json();
    
    if (!userInfo.email) {
      console.error("Google API response missing email:", userInfo);
      return res.status(401).json({ error: "User email not found in token" });
    }

    req.userEmail = userInfo.email;

    const { error } = await supabase
      .from('users')
      .upsert({ email: userInfo.email }, { onConflict: 'email' });

    if (error) {
      console.error("Error upserting user:", error);
    }

    next();
  } catch (err) {
    console.error("Token verification error:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
}

app.post("/upload-resume", verifyToken, upload.single("resume"), async (req, res) => {
  try {
    if (!req.userEmail) {
      console.error("req.userEmail is missing in upload-resume endpoint");
      return res.status(401).json({ error: "User authentication failed" });
    }

    const resumeFile = req.file;
    if (!resumeFile) {
      return res.status(400).json({ error: "No resume file provided" });
    }

    const storagePath = `${req.userEmail}/resume.pdf`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(storagePath, resumeFile.buffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return res.status(500).json({ 
        error: `Failed to upload resume to storage: ${uploadError.message || uploadError}` 
      });
    }

    const { error: dbError } = await supabase
      .from('resumes')
      .upsert({
        user_email: req.userEmail,
        filename: resumeFile.originalname,
        storage_path: storagePath,
        file_size: resumeFile.size,
        uploaded_at: new Date().toISOString()
      }, { onConflict: 'user_email' });

    if (dbError) {
      console.error("Database error:", dbError);
      return res.status(500).json({ 
        error: `Failed to save resume metadata: ${dbError.message || dbError}` 
      });
    }

    console.log(`✅ Resume saved for ${req.userEmail}`);
    res.json({ success: true, filename: resumeFile.originalname });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.get("/resume-status", verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('resumes')
      .select('filename, uploaded_at')
      .eq('user_email', req.userEmail)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("Database error:", error);
      return res.status(500).json({ error: "Failed to check resume status" });
    }

    res.json({
      hasResume: !!data,
      filename: data?.filename || null,
      uploadedAt: data?.uploaded_at || null
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.post("/generate", verifyToken, async (req, res) => {
  try {
    const { jobText, templateType } = req.body;

    if (!jobText) {
      return res.status(400).json({ error: "Missing jobText" });
    }

    let templateFile;
    if (templateType === "short") {
      templateFile = "./templates/shorttemplate.txt";
    } else if (templateType === "bullet") {
      templateFile = "./templates/bullettemplate.txt";
    } else {
      templateFile = "./templates/defaulttemplate.txt";
    }

    let template;
    try {
      template = fs.readFileSync(templateFile, "utf-8");
    } catch (err) {
      console.error(`Error loading template ${templateFile}:`, err);
      return res.status(500).json({ error: "Failed to load template" });
    }

    const { data: resumeData, error: resumeError } = await supabase
      .from('resumes')
      .select('storage_path')
      .eq('user_email', req.userEmail)
      .single();

    if (resumeError || !resumeData) {
      return res.status(400).json({ error: "No resume saved. Please upload a resume first." });
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('resumes')
      .download(resumeData.storage_path);

    if (downloadError) {
      console.error("Storage download error:", downloadError);
      return res.status(500).json({ error: "Failed to retrieve resume" });
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    let resumeText;
    try {
      const pdfData = await pdfParse(buffer);
      resumeText = pdfData.text;
      if (!resumeText || resumeText.trim().length === 0) {
        return res.status(400).json({ error: "Could not extract text from resume" });
      }
    } catch (err) {
      console.error("PDF parsing error:", err);
      return res.status(400).json({ error: "Failed to parse resume: " + err.message });
    }

    const today = new Date().toLocaleDateString('en-US', { 
      timeZone: 'America/New_York',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const prompt = template
      .replace("{{TODAY_DATE}}", today)
      .replace("{{JOB_TEXT}}", jobText)
      .replace("{{RESUME_TEXT}}", resumeText);

    console.log(`📝 Generating cover letter for ${req.userEmail}`);

    const result = await model.generateContent(prompt);
    const response = result.response;
    let coverLetter = "";
    
    try {
      coverLetter = response.text();
    } catch (err) {
      if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
        coverLetter = response.candidates[0].content.parts[0].text;
      }
    }

    if (!coverLetter || coverLetter.trim().length === 0) {
      return res.status(500).json({ error: "No text returned from Gemini" });
    }

    // Return cover letter text as JSON
    res.json({ success: true, coverLetter });
  } catch (err) {
    console.error("Server error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
});

app.post("/generate-pdf", verifyToken, async (req, res) => {
  try {
    const { coverLetter } = req.body;

    if (!coverLetter) {
      return res.status(400).json({ error: "Missing coverLetter text" });
    }

    const pdfBuffer = await generatePDFBuffer(coverLetter);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=cover-letter.pdf");
    res.send(pdfBuffer);
  } catch (err) {
    console.error("PDF generation error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
});

app.post("/generate-docx", verifyToken, async (req, res) => {
  try {
    const { coverLetter } = req.body;

    if (!coverLetter) {
      return res.status(400).json({ error: "Missing coverLetter text" });
    }

    const docxBuffer = await generateDOCXBuffer(coverLetter);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", "attachment; filename=cover-letter.docx");
    res.send(docxBuffer);
  } catch (err) {
    console.error("DOCX generation error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
