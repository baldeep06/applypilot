# Cover Letter Template System - How It Works

## Current System (Simple)

**Flow:**
1. `default.txt` = **PROMPT** sent to LLM
2. Variables like `{{JOB_TEXT}}` and `{{RESUME_TEXT}}` are replaced with actual values
3. LLM generates **ENTIRE** cover letter from scratch
4. Generated text is put into PDF

**Current `default.txt` structure:**
```
[Instructions to LLM]
Job Information: {{JOB_TEXT}}
Candidate Resume: {{RESUME_TEXT}}
[More instructions]
```

---

## Proposed Hybrid System (Recommended)

### Architecture Overview

**Three Components:**
1. **Hard-coded template** (`default.txt`) - Structure, formatting, static parts
2. **Variable extraction** - Parse resume/company to get: name, email, phone, company name, etc.
3. **LLM generation** - Only generate the body paragraphs (not the whole letter)

### How It Would Work

#### Step 1: Extract Variables from Resume & Job Posting

```javascript
// Extract from resume (using regex or LLM extraction)
const candidateInfo = {
  name: "Aadit Shah",           // Extract from resume
  email: "aadit.shah@...",       // Extract from resume
  phone: "(647) 994-8661",      // Extract from resume
  address: "..."                 // Extract from resume (optional)
};

// Extract from job posting
const companyInfo = {
  companyName: "Stripe",         // Extract from jobText
  hiringManager: "Hiring Team",  // Extract or default
  companyAddress: "..."          // Extract if available
};
```

#### Step 2: Template Structure (`default.txt`)

**Option A: Template with LLM-generated body**
```
{{CANDIDATE_NAME}}
{{CANDIDATE_ADDRESS}}
{{CANDIDATE_PHONE}}
{{CANDIDATE_EMAIL}}

{{DATE}}

{{COMPANY_NAME}}
{{COMPANY_ADDRESS}}

Dear {{SALUTATION}},

{{BODY}}  <-- LLM generates ONLY this part

Sincerely,
{{CANDIDATE_NAME}}
```

**Option B: Separate prompt for body generation**
```
default.txt (body prompt):
---
Write 3-4 professional paragraphs for a cover letter.

Job Information:
{{JOB_TEXT}}

Candidate Resume:
{{RESUME_TEXT}}

Instructions:
- Focus on fit and motivation
- Do not repeat resume verbatim
- 3-4 paragraphs max
---
```

#### Step 3: Processing Flow

```javascript
// 1. Extract variables
const candidateInfo = extractFromResume(resumeText);
const companyInfo = extractFromJobPosting(jobText);

// 2. Generate body using LLM (only the body paragraphs)
const bodyPrompt = BODY_TEMPLATE
  .replace("{{JOB_TEXT}}", jobText)
  .replace("{{RESUME_TEXT}}", resumeText);
const bodyParagraphs = await generateWithLLM(bodyPrompt);

// 3. Assemble final letter
const finalLetter = COVER_LETTER_TEMPLATE
  .replace("{{CANDIDATE_NAME}}", candidateInfo.name)
  .replace("{{CANDIDATE_EMAIL}}", candidateInfo.email)
  .replace("{{CANDIDATE_PHONE}}", candidateInfo.phone)
  .replace("{{DATE}}", new Date().toLocaleDateString())
  .replace("{{COMPANY_NAME}}", companyInfo.companyName)
  .replace("{{SALUTATION}}", companyInfo.hiringManager || "Hiring Manager")
  .replace("{{BODY}}", bodyParagraphs)
  .replace("{{CANDIDATE_NAME}}", candidateInfo.name); // For signature
```

---

## Variable Extraction Methods

### Method 1: Regex/Pattern Matching (Simple)
```javascript
function extractFromResume(resumeText) {
  const email = resumeText.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] || "";
  const phone = resumeText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0] || "";
  // Name is usually first line or after "Name:" pattern
  const name = resumeText.split('\n')[0].trim();
  return { name, email, phone };
}
```

### Method 2: LLM Extraction (More Accurate)
```javascript
async function extractFromResume(resumeText) {
  const prompt = `Extract the following information from this resume:
  
  ${resumeText}
  
  Return as JSON:
  {
    "name": "...",
    "email": "...",
    "phone": "...",
    "address": "..."
  }`;
  
  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
}
```

### Method 3: Hybrid (Regex + LLM fallback)
- Try regex first (fast)
- If missing fields, use LLM extraction

---

## Template File Structure Options

### Option 1: Single Template File
```
default.txt:
---
{{HEADER}}
{{DATE}}
{{RECIPIENT}}

{{SALUTATION}}

{{BODY}}

{{CLOSING}}
---
```

### Option 2: Separate Files
```
templates/
  ├── structure.txt    (hard-coded template)
  ├── body-prompt.txt  (prompt for LLM body generation)
  └── variables.json   (variable mapping)
```

### Option 3: JSON Template
```json
{
  "template": "{{HEADER}}\n{{DATE}}\n...",
  "variables": {
    "HEADER": "extract_from_resume",
    "BODY": "generate_with_llm",
    "DATE": "current_date"
  },
  "bodyPrompt": "Write cover letter body..."
}
```

---

## Recommended Implementation

**Best approach for your use case:**

1. **Keep `default.txt` as the body generation prompt** (what LLM generates)
2. **Create a new `structure.txt`** for the hard-coded cover letter structure
3. **Extract variables** from resume using regex (fast) or LLM (accurate)
4. **Extract company info** from job posting
5. **Generate body** using LLM with `default.txt` prompt
6. **Assemble final letter** by combining structure + variables + generated body

**Benefits:**
- ✅ Full control over formatting
- ✅ Consistent structure
- ✅ LLM only generates content (not structure)
- ✅ Faster (less tokens needed)
- ✅ More reliable (no placeholders in output)

---

## Example: Complete Flow

```javascript
// 1. Extract variables
const vars = {
  candidate: extractFromResume(resumeText),
  company: extractFromJobPosting(jobText),
  date: new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })
};

// 2. Generate body
const bodyPrompt = fs.readFileSync('./templates/default.txt', 'utf-8')
  .replace('{{JOB_TEXT}}', jobText)
  .replace('{{RESUME_TEXT}}', resumeText);
const body = await generateBody(bodyPrompt);

// 3. Assemble
const structure = fs.readFileSync('./templates/structure.txt', 'utf-8');
const finalLetter = structure
  .replace('{{CANDIDATE_NAME}}', vars.candidate.name)
  .replace('{{CANDIDATE_EMAIL}}', vars.candidate.email)
  .replace('{{CANDIDATE_PHONE}}', vars.candidate.phone)
  .replace('{{DATE}}', vars.date)
  .replace('{{COMPANY_NAME}}', vars.company.name)
  .replace('{{SALUTATION}}', `Dear ${vars.company.hiringManager || 'Hiring Manager'},`)
  .replace('{{BODY}}', body)
  .replace('{{CLOSING}}', 'Sincerely,')
  .replace('{{SIGNATURE}}', vars.candidate.name);
```

---

## Summary

**Current:** `default.txt` = Full prompt → LLM generates everything

**Proposed:** 
- `default.txt` = Body generation prompt (what LLM creates)
- `structure.txt` = Hard-coded template structure
- Variables = Extracted from resume/company
- Final = Structure + Variables + Generated Body

This gives you **control** over formatting while letting the LLM focus on **content quality**.

