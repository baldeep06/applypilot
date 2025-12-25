const signInBtn = document.getElementById("signInBtn");
const signOutBtn = document.getElementById("signOutBtn");
const generateBtn = document.getElementById("generateBtn");
const statusEl = document.getElementById("status");
const resumeInput = document.getElementById("resumeInput");
const userEmailEl = document.getElementById("userEmail");
const resumeStatusEl = document.getElementById("resumeStatus");
const signedOutView = document.getElementById("signedOutView");
const signedInView = document.getElementById("signedInView");
const downloadSection = document.getElementById("downloadSection");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");
const downloadDocxBtn = document.getElementById("downloadDocxBtn");

let currentCoverLetter = null;

// Template selection
let selectedTemplate = "default";
const templateCards = document.querySelectorAll(".template-card");
templateCards.forEach(card => {
  card.addEventListener("click", () => {
    // Remove selected class from all cards
    templateCards.forEach(c => c.classList.remove("selected"));
    // Add selected class to clicked card
    card.classList.add("selected");
    // Update selected template
    selectedTemplate = card.getAttribute("data-template");
  });
});

const API_URL = "http://localhost:3000";

let currentUser = null;

// Helper function to get a fresh token (handles refresh automatically)
async function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!token) {
        reject(new Error("No token available"));
      } else {
        resolve(token);
      }
    });
  });
}

function setStatus(msg, type = "") {
  statusEl.textContent = msg;
  statusEl.className = type;
}

function updateUI() {
  if (currentUser) {
    signedOutView.style.display = "none";
    signedInView.style.display = "block";
    userEmailEl.textContent = currentUser.email;
    checkResumeStatus();
  } else {
    signedOutView.style.display = "block";
    signedInView.style.display = "none";
  }
}

async function checkResumeStatus() {
  try {
    // Get fresh token (Chrome API handles refresh automatically)
    const token = await getAuthToken();
    
    const response = await fetch(`${API_URL}/resume-status`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    // If token expired, remove cache and retry once
    if (response.status === 401) {
      chrome.identity.removeCachedAuthToken({ token }, async () => {
        try {
          const newToken = await getAuthToken();
          const retryResponse = await fetch(`${API_URL}/resume-status`, {
            headers: {
              'Authorization': `Bearer ${newToken}`
            }
          });
          const retryData = await retryResponse.json();
          if (retryData.hasResume) {
            resumeStatusEl.textContent = `✅ Resume saved (${retryData.filename})`;
            resumeStatusEl.className = "success";
          } else {
            resumeStatusEl.textContent = "⚠️ No resume saved - upload one below";
            resumeStatusEl.className = "warning";
          }
        } catch (retryErr) {
          console.error("Error retrying resume status check:", retryErr);
        }
      });
      return;
    }
    
    const data = await response.json();
    if (data.hasResume) {
      resumeStatusEl.textContent = `✅ Resume saved (${data.filename})`;
      resumeStatusEl.className = "success";
    } else {
      resumeStatusEl.textContent = "⚠️ No resume saved - upload one below";
      resumeStatusEl.className = "warning";
    }
  } catch (err) {
    console.error("Error checking resume status:", err);
  }
}

// Sign in with Google
signInBtn.addEventListener("click", () => {
  chrome.identity.getAuthToken({ interactive: true }, async (token) => {
    if (chrome.runtime.lastError) {
      const errorMsg = chrome.runtime.lastError.message || "Unknown error";
      console.error("Auth error:", errorMsg);
      setStatus(`❌ Sign in failed: ${errorMsg}`, "error");
      return;
    }
    if (!token) {
      setStatus("❌ Sign in failed: No token received", "error");
      return;
    }

    // Get user info from Google
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const userInfo = await response.json();

    currentUser = {
      email: userInfo.email,
      token: token
    };

    // Save to chrome storage
    chrome.storage.local.set({ user: currentUser });
    updateUI();
    setStatus("✅ Signed in successfully!", "success");
  });
});

// Sign out
signOutBtn.addEventListener("click", () => {
  chrome.identity.getAuthToken({ interactive: false }, (token) => {
    if (token) {
      chrome.identity.removeCachedAuthToken({ token }, () => {
        chrome.storage.local.remove("user");
        currentUser = null;
        updateUI();
        setStatus("Signed out", "");
      });
    }
  });
});

// Upload resume
resumeInput.addEventListener("change", async () => {
  const file = resumeInput.files?.[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("resume", file);

  try {
    setStatus("Uploading resume...", "");
    
    // Get fresh token
    let token = await getAuthToken();
    
    let response = await fetch(`${API_URL}/upload-resume`, {
      method: "POST",
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    // If token expired, refresh and retry once
    if (response.status === 401) {
      chrome.identity.removeCachedAuthToken({ token }, async () => {
        token = await getAuthToken();
        response = await fetch(`${API_URL}/upload-resume`, {
          method: "POST",
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        
        if (response.ok) {
          const data = await response.json();
          setStatus("✅ Resume uploaded and saved!", "success");
          checkResumeStatus();
        } else {
          let errorMsg = "Failed to upload resume";
          try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
          } catch (parseErr) {
            errorMsg = `HTTP ${response.status}: ${response.statusText}`;
          }
          console.error("Upload error:", errorMsg, response.status);
          setStatus(`❌ ${errorMsg}`, "error");
        }
      });
      return;
    }

    if (response.ok) {
      const data = await response.json();
      setStatus("✅ Resume uploaded and saved!");
      checkResumeStatus();
    } else {
      let errorMsg = "Failed to upload resume";
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch (parseErr) {
        errorMsg = `HTTP ${response.status}: ${response.statusText}`;
      }
      console.error("Upload error:", errorMsg, response.status);
      setStatus(`❌ ${errorMsg}`);
    }
  } catch (err) {
    console.error("Upload error:", err);
    if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
      setStatus(`❌ Cannot connect to server. Is it running on ${API_URL}?`, "error");
    } else {
      setStatus(`❌ Error: ${err.message}`, "error");
    }
  }
});

// Generate cover letter
generateBtn.addEventListener("click", async () => {
  try {
    // Hide download section and reset cover letter
    downloadSection.style.display = "none";
    currentCoverLetter = null;
    
    setStatus("Reading job page...", "");

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id) {
      setStatus("❌ No active tab found.", "error");
      return;
    }

    generateBtn.disabled = true;

    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: () => document.body.innerText
      },
      async (results) => {
        const jobText = results?.[0]?.result.slice(0, 4000);
        if (!jobText) {
          setStatus("❌ Could not extract job text.", "error");
          return;
        }

        setStatus("Generating cover letter...", "");

        const templateType = selectedTemplate || "default";

        // Get fresh token
        let token = await getAuthToken();
        
        let response = await fetch(`${API_URL}/generate`, {
          method: "POST",
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ jobText, templateType })
        });

        // If token expired, refresh and retry once
        if (response.status === 401) {
          chrome.identity.removeCachedAuthToken({ token }, async () => {
            token = await getAuthToken();
            response = await fetch(`${API_URL}/generate`, {
              method: "POST",
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ jobText, templateType })
            });
            
            if (!response.ok) {
              const errText = await response.text();
              setStatus("❌ Error: " + errText, "error");
              downloadSection.style.display = "none";
              return;
            }
            
            const data = await response.json();
            if (data.success && data.coverLetter) {
              currentCoverLetter = data.coverLetter;
              setStatus("✅ Generation complete!", "success");
              downloadSection.style.display = "block";
              generateBtn.disabled = false;
            } else {
              setStatus("❌ Error: Invalid response from server", "error");
              downloadSection.style.display = "none";
              generateBtn.disabled = false;
            }
          });
          return;
        }

        if (!response.ok) {
          const errText = await response.text();
          setStatus("❌ Error: " + errText, "error");
          downloadSection.style.display = "none";
          generateBtn.disabled = false;
          return;
        }

        const data = await response.json();
        if (data.success && data.coverLetter) {
          currentCoverLetter = data.coverLetter;
          setStatus("✅ Generation complete!", "success");
          downloadSection.style.display = "block";
          generateBtn.disabled = false;
        } else {
          setStatus("❌ Error: Invalid response from server", "error");
          downloadSection.style.display = "none";
          generateBtn.disabled = false;
        }
      }
    );
  } catch (err) {
    setStatus("❌ Error: " + err.message, "error");
    downloadSection.style.display = "none";
    generateBtn.disabled = false;
  }
});

// Download PDF
downloadPdfBtn.addEventListener("click", async () => {
  if (!currentCoverLetter) {
    setStatus("❌ No cover letter available. Please generate one first.", "error");
    return;
  }

  try {
    setStatus("Generating PDF...", "");
    downloadPdfBtn.disabled = true;
    downloadDocxBtn.disabled = true;

    let token = await getAuthToken();
    
    let response = await fetch(`${API_URL}/generate-pdf`, {
      method: "POST",
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ coverLetter: currentCoverLetter })
    });

    // If token expired, refresh and retry once
    if (response.status === 401) {
      chrome.identity.removeCachedAuthToken({ token }, async () => {
        token = await getAuthToken();
        response = await fetch(`${API_URL}/generate-pdf`, {
          method: "POST",
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ coverLetter: currentCoverLetter })
        });
        
        if (!response.ok) {
          const errText = await response.text();
          setStatus("❌ Error: " + errText, "error");
          downloadPdfBtn.disabled = false;
          downloadDocxBtn.disabled = false;
          return;
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cover-letter.pdf";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setStatus("✅ PDF downloaded!", "success");
        downloadPdfBtn.disabled = false;
        downloadDocxBtn.disabled = false;
      });
      return;
    }

    if (!response.ok) {
      const errText = await response.text();
      setStatus("❌ Error: " + errText, "error");
      downloadPdfBtn.disabled = false;
      downloadDocxBtn.disabled = false;
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cover-letter.pdf";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    setStatus("✅ PDF downloaded!", "success");
    downloadPdfBtn.disabled = false;
    downloadDocxBtn.disabled = false;
  } catch (err) {
    setStatus("❌ Error: " + err.message, "error");
    downloadPdfBtn.disabled = false;
    downloadDocxBtn.disabled = false;
  }
});

// Download DOCX
downloadDocxBtn.addEventListener("click", async () => {
  if (!currentCoverLetter) {
    setStatus("❌ No cover letter available. Please generate one first.", "error");
    return;
  }

  try {
    setStatus("Generating DOCX...", "");
    downloadPdfBtn.disabled = true;
    downloadDocxBtn.disabled = true;

    let token = await getAuthToken();
    
    let response = await fetch(`${API_URL}/generate-docx`, {
      method: "POST",
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ coverLetter: currentCoverLetter })
    });

    // If token expired, refresh and retry once
    if (response.status === 401) {
      chrome.identity.removeCachedAuthToken({ token }, async () => {
        token = await getAuthToken();
        response = await fetch(`${API_URL}/generate-docx`, {
          method: "POST",
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ coverLetter: currentCoverLetter })
        });
        
        if (!response.ok) {
          const errText = await response.text();
          setStatus("❌ Error: " + errText, "error");
          downloadPdfBtn.disabled = false;
          downloadDocxBtn.disabled = false;
          return;
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cover-letter.docx";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setStatus("✅ DOCX downloaded!", "success");
        downloadPdfBtn.disabled = false;
        downloadDocxBtn.disabled = false;
      });
      return;
    }

    if (!response.ok) {
      const errText = await response.text();
      setStatus("❌ Error: " + errText, "error");
      downloadPdfBtn.disabled = false;
      downloadDocxBtn.disabled = false;
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cover-letter.docx";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    setStatus("✅ DOCX downloaded!", "success");
    downloadPdfBtn.disabled = false;
    downloadDocxBtn.disabled = false;
  } catch (err) {
    setStatus("❌ Error: " + err.message, "error");
    downloadPdfBtn.disabled = false;
    downloadDocxBtn.disabled = false;
  }
});

// Check if user is already signed in
chrome.storage.local.get("user", (data) => {
  if (data.user) {
    currentUser = data.user;
    updateUI();
  } else {
    updateUI();
  }
});
