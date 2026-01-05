# ApplyPilot

ApplyPilot is a Chrome extension that streamlines the job application process by automatically generating high-quality, personalized cover letters using AI. Upload your resume once, browse job postings, and generate tailored cover letters in seconds.

---

## ✨ Product Features

### 🎯 AI Cover Letter Generation
- Automatically generates personalized cover letters using Google Gemini AI  
- Matches your resume to the job description on the current webpage  
- Produces natural, professional, application-ready writing  

### 📝 Multiple Templates
Choose the format that best fits the application:
- **Standard** – Traditional, full-length cover letter (250–300 words)
- **Short** – Concise version for quick applications (150–200 words)
- **Bullet** – Highlights experience with structured bullet points (250–300 words)

### 📄 Export Options
- Download cover letters as **PDF** or **DOCX**
- Smart filenames generated automatically  
  *(e.g., John Doe – Google Software Engineer.pdf)*

### 🔐 Security & Privacy
- Google OAuth authentication  
- Resumes stored securely in cloud storage  
- Token-based API authentication  
- No resumes or cover letters shared with third parties  

---

## 🛠️ How It Works

1. Sign in with your Google account  
2. Upload your resume (PDF)  
3. Navigate to a job posting  
4. Open ApplyPilot and select a template  
5. Generate and download your cover letter  

---

## 🧱 Tech Stack

### Chrome Extension
- Manifest V3  
- Vanilla JavaScript  
- Chrome Identity API  
- Chrome Storage & Scripting APIs  

### Backend
- Node.js + Express  
- Google Gemini AI (gemini-2.5-flash)  
- Supabase (PostgreSQL + file storage)  

### Document Generation
- PDF generation with professional formatting  
- Editable DOCX output  

---

## 📌 Notes

- ApplyPilot assists with drafting cover letters but does not auto-submit applications  
- Generated content is fully editable before submission  
- Designed to support ethical, user-driven job applications  

---

## 📧 Support

For questions or issues, please contact support through the Chrome Web Store listing.
