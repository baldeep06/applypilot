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

// CORS configuration - for prod
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests from Chrome extensions
    const allowedOrigins = [
      'chrome-extension://', // Chrome extensions
      process.env.ALLOWED_ORIGIN, 
    ].filter(Boolean);
    
    // add restriction in prod
    if (process.env.NODE_ENV === 'production') {
      // Allow Chrome extensions (origin is null for extension requests)
      if (!origin || origin.startsWith('chrome-extension://')) {
        callback(null, true);
      } else if (process.env.ALLOWED_ORIGIN && origin === process.env.ALLOWED_ORIGIN) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      // In development, allow all origins
      callback(null, true);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
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

// env variable presence check - gemini, supabase, service role keys
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

// initializing gemini llm model for cover letters
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 4096
  }
});

// to extract candidate name from resume
async function extractCandidateName(resumeText) {
  try {
    // simple extraction try
    const firstLine = resumeText.split('\n')[0].trim();
    // first line in resume may look like name - check and if so, extract and save
    if (firstLine.match(/^[A-Za-z\s-]{2,50}$/) && firstLine.split(/\s+/).length >= 2 && firstLine.split(/\s+/).length <= 4) {
      return firstLine;
    }
    
    // if unable, use gemini llm to extract
    const prompt = `Extract the candidate's full name from this resume text. Return ONLY the person's actual name (first name + last name, optionally middle name), nothing else.

CRITICAL RULES:
- Return ONLY the name (2-4 words maximum, typically first and last name)
- DO NOT include job titles, company names, role descriptions, or any other text
- The name should look like a real person's name (e.g., "John Smith", "Mary Jane Watson", "Aadit Shah")
- If you can't find a clear name, return "Candidate"
- Validate: Does the extracted text contain ONLY a person's name with no additional information?

Resume text:
${resumeText.substring(0, 1000)}

Name:`;
    // error handling for name
    const result = await model.generateContent(prompt);
    const name = result.response.text().trim();
    return name || "Candidate";
  } catch (err) {
    console.error("Error extracting candidate name:", err);
    return "Candidate";
  }
}

// to extract company and position from job posting - using  llm, prompt provided vefore
async function extractJobInfo(jobText) {
  try {
    const prompt = `Extract the company name and job position/title from this job posting. Be precise and extract only the essential information.

IMPORTANT RULES:
1. For company name: Extract ONLY the core company/organization name. Do NOT include:
   - Program names (e.g., "Summer Student Opportunities", "Co-op Program")
   - Years (e.g., "2026", "2025")
   - Department names (e.g., "Capital Markets", "QTS")
   - Location details
   - Any descriptive text after the company name
   
   Examples:
   - "RBC 2026 Summer Student Opportunities" → "RBC"
   - "Google Software Engineer Intern 2025" → "Google"
   - "Microsoft Azure Cloud Solutions" → "Microsoft"
   - "TD Bank Capital Markets Division" → "TD Bank"

2. For position/job title: Extract ONLY the core, standardized job title. This is critical for filename generation.
   
   EXTRACTION RULES:
   - Extract the PRIMARY job title/role name - the essential role identifier
   - Remove technical stack qualifiers that appear before the main title (e.g., "Backend", "Frontend", "Full Stack" if redundant)
   - Remove team names, department names, location details, work type (Remote, Hybrid, Full-time)
   - Keep it concise: typically 2-4 words - just the essential role name
   - Standardize common variations (e.g., "Developer" and "Engineer" are often interchangeable, choose the most common form)
   
   CRITICAL EXAMPLES - follow these patterns exactly:
   - "Software Developer Intern, Backend" → "Software Developer Intern, Backend"
   - "Data Analyst, Remote" → "Data Analyst"
   - "Product Manager - Consumer Products" → "Product Manager"
   - "Full Stack Engineer, Frontend Focus" → "Full Stack Engineer" (keep "Full Stack" as it's part of the title, remove ", Frontend Focus")
   
   Think: What is the core role name that would appear on a business card or resume? Extract that and nothing more.

Job posting:
${jobText.substring(0, 2000)}

Return ONLY a JSON object with "company" and "position" fields. No other text.
Example format: {"company": "RBC", "position": "Software Developer"}`;
    
    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();
    
    // Extract JSON from response (might be wrapped in markdown code blocks)
    // below, the job posting is cleaned up for cover letter purposes, removing extra fluff
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jobInfo = JSON.parse(jsonMatch[0]);
      // Clean up company name - remove common suffixes/prefixes that might have slipped through
      let company = (jobInfo.company || "Company").trim();
      // Remove year patterns
      company = company.replace(/\s+\d{4}\s*/g, ' ').trim();
      // Remove common program indicators, sseason, etc
      company = company.replace(/\s+(Summer|Winter|Spring|Fall|Co-op|Coop|Student|Opportunities|Program).*/gi, '').trim();
      // Take only the first meaningful part (before common separators like dash, comma for departments)
      company = company.split(/[-–—,]/)[0].trim();
      
      // Clean up position name - safety net to remove qualifiers that might have slipped through
      let position = (jobInfo.position || "Position").trim();
      // Remove everything after comma (qualifiers like ", Backend", ", Remote", ", Full-time", etc.)
      position = position.split(',')[0].trim();
      // Remove everything after dash/em-dash/en-dash (qualifiers like "- Backend", " - Remote")
      position = position.split(/[-–—]/)[0].trim();
      // Remove everything in parentheses (qualifiers like "(Remote)", "(Backend)", etc.)
      position = position.replace(/\s*\([^)]*\)\s*/g, '').trim();
      // Remove extra whitespace
      position = position.replace(/\s+/g, ' ').trim();
      
      return {
        company: company || "Company",
        position: position || "Position"
      };
    }
    // the formatted job info
    return { company: "Company", position: "Position" };
  } catch (err) {
    console.error("Error extracting job info:", err);
    return { company: "Company", position: "Position" };
  }
}

// to cleanup filename for cover letter
function sanitizeFilename(text) {
  return text
    .replace(/[<>:"/\\|?*]/g, '') // get rid of invalid characters
    .replace(/\s+/g, ' ') // whitespace handling
    .trim()
    .substring(0, 100); // length of fllename
}

// to generate cover letter in PDF format
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

    const hasBullets = coverLetter.match(/^[*·]\s+/m);
    const hasBold = coverLetter.includes('**');

    // for bulleted templates
    if (hasBullets || hasBold) {
      // line by line
      const lines = coverLetter.split('\n');
      let isHeaderSection = true;
      let headerLines = [];
      
      const bulletIndices = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().match(/^[*·]\s+/)) {
          bulletIndices.push(i);
        }
      }
      const lastBulletIndex = bulletIndices.length > 0 ? bulletIndices[bulletIndices.length - 1] : -1;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isLastBullet = (i === lastBulletIndex);
        
        if (line.trim().startsWith('Dear')) {
          isHeaderSection = false;
          
          if (headerLines.length > 0) {
            // First line is date
            doc.text(headerLines[0], { lineGap: 0 });
            doc.moveDown(1); // Full space after date
            
            // Name, phone, email 
            for (let j = 1; j < headerLines.length; j++) {
              doc.text(headerLines[j], { lineGap: 0 });
            }
            doc.moveDown(1); 
            headerLines = [];
          }
        }
        
        if (isHeaderSection && line.trim().length > 0) {
          headerLines.push(line.trim());
          continue;
        }
        
        if (isHeaderSection && line.trim().length === 0) {
          continue;
        }

        if (line.trim().length === 0) {
          if (i > 0 && lines[i-1].trim().toLowerCase().startsWith('sincerely')) {
            continue; 
          }
          doc.moveDown(1);
          continue;
        }

        const bulletMatch = line.match(/^([*·])\s+(.*)$/);
        
        if (bulletMatch) {
          const bulletContent = bulletMatch[2];
          
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
          
          const originalX = doc.x;
          doc.x = originalX + 24;
          
          const startY = doc.y;
          doc.text('•', originalX + 24, startY, {
            continued: false,
            width: 20
          });
          
          doc.x = originalX + 44; 
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
          
          doc.font('Times-Roman');
          doc.x = originalX;
          if (!isLastBullet) {
            doc.moveDown(1); 
          }
          
        } else {
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
          
          const isSincerelyLine = line.trim().toLowerCase().startsWith('sincerely');
          if (!isSincerelyLine) {
          }
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
  
  // Check if text contains bullets 
  const hasBullets = coverLetter.match(/^[*·]\s+/m);
  const hasBold = coverLetter.includes('**');
  
  const createTextRun = (text, bold = false) => {
    return new TextRun({
      text: text,
      font: "Times New Roman",
      size: 22, 
      bold: bold
    });
  };


  const createParagraph = (children, spacingAfter = 0, indent = null) => {
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
    const bulletIndices = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().match(/^[*·]\s+/)) {
        bulletIndices.push(i);
      }
    }
    const lastBulletIndex = bulletIndices.length > 0 ? bulletIndices[bulletIndices.length - 1] : -1;
    
    // line by line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isLastBullet = (i === lastBulletIndex);
      
      // Detect end of header (when we hit "Dear")
      if (line.trim().startsWith('Dear')) {
        isHeaderSection = false;
        
        if (headerLines.length > 0) {
          
          paragraphs.push(createParagraph(
            [createTextRun(headerLines[0].trim())],
            0
          ));
          
          paragraphs.push(createParagraph(
            [createTextRun("")],
            0
          ));
          
          // Name, phone, email 
          for (let j = 1; j < headerLines.length; j++) {
            paragraphs.push(createParagraph(
              [createTextRun(headerLines[j].trim())],
              0
            ));
          }
          
          paragraphs.push(createParagraph(
            [createTextRun("")],
            0 
          ));
          headerLines = [];
        }
      }
      
      if (isHeaderSection && line.trim().length > 0) {
        headerLines.push(line.trim());
        continue;
      }
      
      if (isHeaderSection && line.trim().length === 0) {
        continue;
      }
      
      if (line.trim().length === 0) {
        paragraphs.push(createParagraph([createTextRun("")], 0));
        continue;
      }

      const bulletMatch = line.match(/^([*·])\s+(.*)$/);
      
      if (bulletMatch) {
        const bulletContent = bulletMatch[2];
        
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
        
        if (textRuns.length > 0) {
          textRuns.unshift(new Tab());
          textRuns.unshift(createTextRun("•     "));
          
          paragraphs.push(new Paragraph({
            children: textRuns,
            spacing: { after: isLastBullet ? 0 : 264 }, 
            indent: { 
              left: 720,      
              hanging: 360    
            }
          }));
        }
      } else {

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
        
        if (textRuns.length > 0) {
          paragraphs.push(createParagraph(textRuns, 0)); // Standard line spacing
        }
      }
    }
  } else {

    let simpleHeaderSection = true;
    let simpleHeaderLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.trim().startsWith('Dear')) {
        simpleHeaderSection = false;
        
        if (simpleHeaderLines.length > 0) {
          paragraphs.push(createParagraph(
            [createTextRun(simpleHeaderLines[0].trim())],
            0
          ));
          
          paragraphs.push(createParagraph(
            [createTextRun("")],
            0
          ));
          
          // Name, phone, email 
          for (let j = 1; j < simpleHeaderLines.length; j++) {
            paragraphs.push(createParagraph(
              [createTextRun(simpleHeaderLines[j].trim())],
              0 // NO spacing between contact info lines
            ));
          }
          
          paragraphs.push(createParagraph(
            [createTextRun("")],
            0
          ));
          simpleHeaderLines = [];
        }
      }
      
      if (simpleHeaderSection && line.trim().length > 0) {
        simpleHeaderLines.push(line.trim());
        continue;
      }
      
      if (simpleHeaderSection && line.trim().length === 0) {
        continue;
      }
      
      // Handle empty lines (paragraph breaks) - standard single line spacing
      if (line.trim().length === 0) {
        paragraphs.push(createParagraph([createTextRun("")], 0));
      } else {
        paragraphs.push(createParagraph([createTextRun(line.trim())], 0));
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

// token verify for user auth, google api OAuth
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

// to upload resume to SupaBase storage
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

// check status of resume with SupaBase
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

// post request to generate cover letter
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

    // Extract info for file name
    const candidateName = await extractCandidateName(resumeText);
    const jobInfo = await extractJobInfo(jobText);

    // Return cover letter text and data in json format
    res.json({ 
      success: true, 
      coverLetter,
      metadata: {
        candidateName: candidateName,
        company: jobInfo.company,
        position: jobInfo.position
      }
    });
  } catch (err) {
    console.error("Server error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
});

// post request to generate cover letter in PDF format
app.post("/generate-pdf", verifyToken, async (req, res) => {
  try {
    const { coverLetter, metadata } = req.body;

    if (!coverLetter) {
      return res.status(400).json({ error: "Missing coverLetter text" });
    }

    const pdfBuffer = await generatePDFBuffer(coverLetter);

    // Generate filename from metadata and logic as previously shown
    let filename = "cover-letter.pdf";
    if (metadata && metadata.candidateName && metadata.company && metadata.position) {
      const name = sanitizeFilename(metadata.candidateName);
      const company = sanitizeFilename(metadata.company);
      const position = sanitizeFilename(metadata.position);
      
      if (name !== "Candidate" && company !== "Company" && position !== "Position") {
        filename = `${name} - ${company} ${position}.pdf`;
      }
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("PDF generation error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
});

// post request to generate cover letter in DOCX format
app.post("/generate-docx", verifyToken, async (req, res) => {
  try {
    const { coverLetter, metadata } = req.body;

    if (!coverLetter) {
      return res.status(400).json({ error: "Missing coverLetter text" });
    }

    const docxBuffer = await generateDOCXBuffer(coverLetter);

    // Generate filename from previously shown logic
    let filename = "cover-letter.docx";
    if (metadata && metadata.candidateName && metadata.company && metadata.position) {
      const name = sanitizeFilename(metadata.candidateName);
      const company = sanitizeFilename(metadata.company);
      const position = sanitizeFilename(metadata.position);

      if (name !== "Candidate" && company !== "Company" && position !== "Position") {
        filename = `${name} - ${company} ${position}.docx`;
      }
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(docxBuffer);
  } catch (err) {
    console.error("DOCX generation error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
});

// server running on port 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
