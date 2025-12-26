# ApplyPilot

**ApplyPilot** is a Chrome extension that revolutionizes the job application process by automatically generating personalized cover letters using AI. Simply upload your resume, browse job postings, and let ApplyPilot create professional, tailored cover letters in seconds.

## ✨ Features

### 🎯 Core Functionality
- **AI-Powered Cover Letter Generation**: Leverages Google's Gemini AI to create personalized cover letters based on your resume and job posting
- **Resume Upload & Storage**: Securely upload and store your resume (PDF format) with Google OAuth authentication
- **Job Posting Parsing**: Automatically extracts and analyzes job descriptions from the current webpage
- **Multiple Export Formats**: Download cover letters as PDF or DOCX files
- **Smart Filename Generation**: Automatically names files using candidate name, company, and position (e.g., `John Doe - Google Software Engineer.pdf`)

### 📝 Template Options
Choose from three professional cover letter templates:
- **Standard Template**: Traditional format perfect for most applications (250-300 words)
- **Short Template**: Concise version ideal for quick applications (150-200 words)
- **Bullet Template**: Highlights key experiences with bullet points for impact (250-300 words)

### 🔒 Security & Privacy
- **Google OAuth Integration**: Secure authentication using your Google account
- **Cloud Storage**: Resumes stored securely in Supabase
- **Token-Based Authentication**: All API requests are authenticated

## 🛠️ Tech Stack

### Frontend (Chrome Extension)
- **Manifest V3**: Modern Chrome extension architecture
- **Vanilla JavaScript**: Lightweight, no framework dependencies
- **Chrome Identity API**: OAuth authentication
- **Chrome Storage API**: Local data persistence
- **Chrome Scripting API**: Web page content extraction

### Backend (Node.js Server)
- **Express.js**: RESTful API server
- **Google Gemini AI**: Cover letter generation using `gemini-2.5-flash` model
- **Supabase**: Database and file storage
  - PostgreSQL database for user and resume metadata
  - Supabase Storage for PDF resume files
- **PDF Generation**: 
  - `pdfkit`: PDF creation and formatting
  - `pdf-parse`: Resume text extraction
- **DOCX Generation**: `docx` library for Word document creation
- **File Upload**: `multer` for handling file uploads

### Infrastructure
- **Authentication**: Google OAuth 2.0
- **Database**: Supabase (PostgreSQL)
- **File Storage**: Supabase Storage
- **API**: RESTful Express.js endpoints

## 📋 Prerequisites

Before you begin, ensure you have:
- Node.js (v14 or higher)
- npm or yarn package manager
- Google Cloud Platform account (for Gemini API key)
- Supabase account (for database and storage)
- Google OAuth credentials (for authentication)

## 🔧 Installation

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/applypilot.git
cd applypilot
```

### 2. Install Dependencies

#### Server Dependencies
```bash
cd server
npm install
```

### 3. Environment Setup

Create a `.env` file in the `server` directory:

```env
# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
# OR
SUPABASE_KEY=your_supabase_anon_key

# Server Configuration
PORT=3000
```

### 4. Supabase Setup

1. Create a new Supabase project
2. Set up the following database tables:

#### `users` table
```sql
CREATE TABLE users (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### `resumes` table
```sql
CREATE TABLE resumes (
  user_email TEXT PRIMARY KEY REFERENCES users(email),
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_at TIMESTAMP DEFAULT NOW()
);
```

3. Create a storage bucket named `resumes` with public access disabled

### 5. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized JavaScript origins and redirect URIs
6. Update `manifest.json` with your client ID

### 6. Load Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `applypilot` directory (root folder, not server)
5. The extension should now appear in your extensions list

## 🚀 Usage

### Starting the Server

```bash
cd server
npm start
```

The server will run on `http://localhost:3000` (or your configured PORT).

### Using the Extension

1. **Sign In**: Click the ApplyPilot icon and sign in with your Google account
2. **Upload Resume**: Upload your resume (PDF format) - it will be securely stored
3. **Browse Jobs**: Navigate to any job posting webpage
4. **Generate Cover Letter**: 
   - Click the ApplyPilot icon
   - Select your preferred template (Standard, Short, or Bullet)
   - Click "Generate Cover Letter"
5. **Download**: After generation completes, download as PDF or DOCX

## 📁 Project Structure

```
applypilot/
├── manifest.json          # Chrome extension manifest
├── popup.html             # Extension popup UI
├── popup.js               # Extension frontend logic
├── icon.png               # Extension icon
├── server/
│   ├── index.js           # Express server and API endpoints
│   ├── package.json       # Server dependencies
│   └── templates/
│       ├── defaulttemplate.txt    # Standard template prompt
│       ├── shorttemplate.txt      # Short template prompt
│       └── bullettemplate.txt     # Bullet template prompt
└── README.md              # This file
```

## 🔌 API Endpoints

### Authentication
All endpoints require Bearer token authentication (Google OAuth token).

#### `POST /upload-resume`
Upload and store a resume PDF file.

**Request**: `multipart/form-data` with `resume` field

**Response**:
```json
{
  "success": true,
  "filename": "resume.pdf"
}
```

#### `GET /resume-status`
Check if user has an uploaded resume.

**Response**:
```json
{
  "hasResume": true,
  "filename": "resume.pdf",
  "uploadedAt": "2024-01-01T00:00:00.000Z"
}
```

#### `POST /generate`
Generate cover letter text using AI.

**Request**:
```json
{
  "jobText": "Job description text...",
  "templateType": "default" // or "short" or "bullet"
}
```

**Response**:
```json
{
  "success": true,
  "coverLetter": "Generated cover letter text...",
  "metadata": {
    "candidateName": "John Doe",
    "company": "Google",
    "position": "Software Engineer"
  }
}
```

#### `POST /generate-pdf`
Generate PDF file from cover letter text.

**Request**:
```json
{
  "coverLetter": "Cover letter text...",
  "metadata": {
    "candidateName": "John Doe",
    "company": "Google",
    "position": "Software Engineer"
  }
}
```

**Response**: PDF file download

#### `POST /generate-docx`
Generate DOCX file from cover letter text.

**Request**:
```json
{
  "coverLetter": "Cover letter text...",
  "metadata": {
    "candidateName": "John Doe",
    "company": "Google",
    "position": "Software Engineer"
  }
}
```

**Response**: DOCX file download

## 🎨 Features in Detail

### Template System
Each template is carefully crafted with specific guidelines:
- **Word limits** to ensure appropriate length
- **Formatting rules** for professional appearance
- **Content guidelines** to maintain quality
- **Spacing and structure** optimized for readability

### AI Generation
The extension uses advanced prompt engineering to:
- Extract relevant information from job postings
- Match your experience with job requirements
- Generate natural, human-like text
- Maintain appropriate tone and professionalism

### File Formatting
- **PDF**: Professional formatting with Times New Roman font, proper margins, and consistent spacing
- **DOCX**: Fully editable Word documents with identical formatting to PDF versions

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Google Gemini AI for powerful language generation
- Supabase for backend infrastructure
- The open-source community for excellent libraries

## 📧 Support

For issues, questions, or suggestions, please open an issue on GitHub.
