const generateBtn = document.getElementById("generateBtn");
const statusEl = document.getElementById("status");
const resumeInput = document.getElementById("resumeInput");

function setStatus(msg) {
  statusEl.textContent = msg;
}

function fetchWithTimeout(url, options, timeoutMs = 15000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
    )
  ]);
}


// Save resume file (base64 for now)
resumeInput.addEventListener("change", () => {
  const file = resumeInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    chrome.storage.local.set({ resumeFileDataUrl: reader.result }, () => {
      setStatus("✅ Resume saved.");
    });
  };
  reader.readAsDataURL(file);
});

generateBtn.addEventListener("click", async () => {
  try {
    setStatus("Reading job page...");

    // 1. Get active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id) {
      setStatus("❌ No active tab found.");
      return;
    }

    // 2. Extract page text
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: () => document.body.innerText
      },
      async (results) => {
        const jobText = results?.[0]?.result.slice(0, 4000);
        if (!jobText) {
          setStatus("❌ Could not extract job text.");
          return;
        }

        // 3. Load resume from storage
        const stored = await chrome.storage.local.get("resumeFileDataUrl");
        if (!stored.resumeFileDataUrl) {
          setStatus("❌ Please upload a resume first.");
          return;
        }

        setStatus("Generating cover letter...");

        // 4. Send to backend
        let response;
try {
  response = await fetchWithTimeout(
    "http://localhost:3000/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobText,
        resumeText: `
Software engineering student with experience in JavaScript, React, Node.js,
API development, and customer-facing roles.
`
      })
    },
    15000
  );
} catch (err) {
  console.error("❌ Fetch error:", err);
  setStatus("❌ Request failed: " + err.message);
  return;
}

if (!response.ok) {
  const errText = await response.text();
  console.error("❌ Backend returned error:", errText);
  setStatus("❌ Backend error:\n" + errText);
  return;
}

let data;
try {
  data = await response.json();
} catch (err) {
  console.error("❌ JSON parse error:", err);
  setStatus("❌ Invalid JSON from server");
  return;
}

if (!data.coverLetter) {
  setStatus("❌ No cover letter returned");
  return;
}

setStatus("✅ Cover letter generated:\n\n" + data.coverLetter);

      }
    );
  } catch (err) {
    console.error(err);
    setStatus("❌ Error: " + (err.message || String(err)));
  }
});
