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

        // 3. Get resume file from input
        const resumeFile = resumeInput.files?.[0];
        if (!resumeFile) {
          setStatus("❌ Please upload a resume first.");
          return;
        }

        setStatus("Generating cover letter...");

        // 4. Send PDF file and job text to backend
        const formData = new FormData();
        formData.append("resume", resumeFile);
        formData.append("jobText", jobText);

        let response;
        try {
          response = await fetchWithTimeout(
            "http://localhost:3000/generate",
            {
              method: "POST",
              body: formData
            },
            30000 // Increased timeout for PDF processing
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

        // 5. Handle PDF response and trigger download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cover-letter.pdf";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setStatus("✅ Cover letter PDF generated and downloaded!");

      }
    );
  } catch (err) {
    console.error(err);
    setStatus("❌ Error: " + (err.message || String(err)));
  }
});
