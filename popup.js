const signInBtn = document.getElementById("signInBtn");
const userIconBtn = document.getElementById("userIconBtn");
const userMenu = document.getElementById("userMenu");
const userMenuEmail = document.getElementById("userMenuEmail");
const userMenuSignOut = document.getElementById("userMenuSignOut");
const generateBtn = document.getElementById("generateBtn");
const statusEl = document.getElementById("status");
const resumeInput = document.getElementById("resumeInput");
const resumeFileBtn = document.getElementById("resumeFileBtn");
const resumeFileName = document.getElementById("resumeFileName");
const signedOutView = document.getElementById("signedOutView");
const signedInView = document.getElementById("signedInView");
const downloadSectionWrapper = document.getElementById("downloadSectionWrapper");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");
const downloadDocxBtn = document.getElementById("downloadDocxBtn");
const viewBtn = document.getElementById("viewBtn");
const pdfModalOverlay = document.getElementById("pdfModalOverlay");
const pdfViewer = document.getElementById("pdfViewer");
const pdfModalClose = document.getElementById("pdfModalClose");
const themeToggleBtn = document.getElementById("themeToggleBtn");

let currentCoverLetter = null;
let currentMetadata = null;
let savedButtonText = "Generate"; // Store the button text to restore after loading

// Template selection
let selectedTemplate = "default";
let lastGeneratedTemplate = null;
const templateCards = document.querySelectorAll(".template-card");
templateCards.forEach(card => {
  card.addEventListener("click", () => {
    // Remove selected class from all cards
    templateCards.forEach(c => c.classList.remove("selected"));
    // Add selected class to clicked card
    card.classList.add("selected");
    // Update selected template
    const newTemplate = card.getAttribute("data-template");
    selectedTemplate = newTemplate;
    
    // Reset button text if template changed
    if (lastGeneratedTemplate !== null && lastGeneratedTemplate !== newTemplate) {
      setButtonText("Generate");
      // Hide preview and download buttons when switching to a different template
      downloadSectionWrapper.style.display = "none";
    } else if (lastGeneratedTemplate === newTemplate) {
      setButtonText("Regenerate");
      // Show preview and download buttons when switching back to the generated template
      downloadSectionWrapper.style.display = "block";
    }
  });
});

// API URL configuration - uses production URL in deployed extension, localhost in development
// Production URL should be set in config.js or via Chrome storage
//let API_URL = "https://applypilot-server-992595212896.us-central1.run.app"; // For prod
let API_URL = "http://localhost:3000";  // For testing locally

// Try to get API URL from storage (allows remote updates)
chrome.storage.sync.get(['apiUrl'], (result) => {
  if (result.apiUrl) {
    API_URL = result.apiUrl;
  }
  // If not in storage, keep the default localhost:3000 for development
  // To use a production server, set 'apiUrl' in Chrome storage or update the default above
});

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

// Helper functions to manage button loading state
function setButtonLoading(isLoading) {
  const buttonTextEl = generateBtn.querySelector('.button-text');
  if (isLoading) {
    // Save current text and set to "Generating"
    if (buttonTextEl) {
      savedButtonText = buttonTextEl.textContent;
      buttonTextEl.textContent = "Generating";
    }
    generateBtn.classList.add('loading');
    generateBtn.disabled = true;
  } else {
    // Restore saved text
    if (buttonTextEl) {
      buttonTextEl.textContent = savedButtonText;
    }
    generateBtn.classList.remove('loading');
    generateBtn.disabled = false;
  }
}

function setButtonText(text) {
  const buttonText = generateBtn.querySelector('.button-text');
  if (buttonText) {
    buttonText.textContent = text;
    savedButtonText = text; // Update saved text
  } else {
    // Fallback for compatibility
    generateBtn.textContent = text;
    savedButtonText = text;
  }
}

// Helper function to generate filename from metadata
function generateFilename(extension = "pdf") {
  if (currentMetadata && currentMetadata.candidateName && currentMetadata.company && currentMetadata.position) {
    const name = currentMetadata.candidateName.replace(/[<>:"/\\|?*]/g, '').trim();
    const company = currentMetadata.company.replace(/[<>:"/\\|?*]/g, '').trim();
    const position = currentMetadata.position.replace(/[<>:"/\\|?*]/g, '').trim();
    // Only use custom filename if we have real values (not defaults from failed extraction)
    if (name !== "Candidate" && company !== "Company" && position !== "Position") {
      return `${name} - ${company} ${position}.${extension}`;
    }
  }
  return `cover-letter.${extension}`;
}

// Update view button text with filename and "- Preview"
function updateViewButton() {
  const filename = generateFilename("pdf");
  // Remove extension for display
  const filenameWithoutExt = filename.replace(/\.pdf$/, '');
  viewBtn.textContent = "Preview";
}

function updateUI() {
  if (currentUser) {
    signedOutView.style.display = "none";
    signedInView.style.display = "flex";
    userIconBtn.style.display = "flex";
    userMenuEmail.textContent = currentUser.email;
    userMenu.classList.remove("active");
    userIconBtn.classList.remove("active");
    checkResumeStatus();
  } else {
    signedOutView.style.display = "block";
    signedInView.style.display = "none";
    userIconBtn.style.display = "none";
    userMenu.classList.remove("active");
    userIconBtn.classList.remove("active");
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
            resumeFileBtn.textContent = "Update file";
            resumeFileName.textContent = retryData.filename;
          } else {
            resumeFileBtn.textContent = "Choose File";
            resumeFileName.textContent = "No file chosen";
          }
        } catch (retryErr) {
          console.error("Error retrying resume status check:", retryErr);
        }
      });
      return;
    }
    
    const data = await response.json();
    if (data.hasResume) {
      resumeFileBtn.textContent = "Update file";
      resumeFileName.textContent = data.filename;
    } else {
      resumeFileBtn.textContent = "Choose File";
      resumeFileName.textContent = "No file chosen";
    }
  } catch (err) {
    console.error("Error checking resume status:", err);
  }
}

// Make custom button trigger file input
resumeFileBtn.addEventListener("click", () => {
  resumeInput.click();
});

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
    setStatus("", "");
  });
});

// Toggle user menu
userIconBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isActive = userMenu.classList.toggle("active");
  if (isActive) {
    userIconBtn.classList.add("active");
  } else {
    userIconBtn.classList.remove("active");
  }
});

// Close user menu when clicking outside
document.addEventListener("click", (e) => {
  if (!userMenu.contains(e.target) && e.target !== userIconBtn) {
    userMenu.classList.remove("active");
    userIconBtn.classList.remove("active");
  }
});

// Sign out
userMenuSignOut.addEventListener("click", () => {
  chrome.identity.getAuthToken({ interactive: false }, (token) => {
    if (token) {
      chrome.identity.removeCachedAuthToken({ token }, () => {
        chrome.storage.local.remove("user");
        currentUser = null;
        updateUI();
        setStatus("", "");
        userMenu.classList.remove("active");
        userIconBtn.classList.remove("active");
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
    setStatus("", "");
    
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
          setStatus("", "");
          // Update UI immediately
          resumeFileBtn.textContent = "Update file";
          resumeFileName.textContent = data.filename || "resume.pdf";
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
      setStatus("", "");
      // Update UI immediately
      resumeFileBtn.textContent = "Update file";
      resumeFileName.textContent = data.filename || "resume.pdf";
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
    downloadSectionWrapper.style.display = "none";
    currentCoverLetter = null;
    currentMetadata = null;
    
    // Reset button text if template changed
    if (lastGeneratedTemplate !== null && lastGeneratedTemplate !== selectedTemplate) {
      setButtonText("Generate");
    }
    
    // Clear any previous status messages (but keep errors visible)
    setStatus("", "");

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id) {
      setStatus("❌ No active tab found.", "error");
      return;
    }

    setButtonLoading(true);

    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: () => document.body.innerText
      },
      async (results) => {
        const jobText = results?.[0]?.result.slice(0, 4000);
        if (!jobText) {
          setStatus("❌ Could not extract job text.", "error");
          setButtonLoading(false);
          return;
        }

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
              downloadSectionWrapper.style.display = "none";
              setButtonLoading(false);
              return;
            }
            
            const data = await response.json();
            if (data.success && data.coverLetter) {
              currentCoverLetter = data.coverLetter;
              currentMetadata = data.metadata || null;
              updateViewButton();
              lastGeneratedTemplate = templateType;
              setButtonText("Regenerate");
              downloadSectionWrapper.style.display = "block";
              setButtonLoading(false);
            } else {
              setStatus("❌ Error: Invalid response from server", "error");
              downloadSectionWrapper.style.display = "none";
              setButtonLoading(false);
            }
          });
          return;
        }

        if (!response.ok) {
          const errText = await response.text();
          setStatus("❌ Error: " + errText, "error");
          downloadSectionWrapper.style.display = "none";
          setButtonLoading(false);
          return;
        }

        const data = await response.json();
        if (data.success && data.coverLetter) {
          currentCoverLetter = data.coverLetter;
          currentMetadata = data.metadata || null;
          updateViewButton();
          lastGeneratedTemplate = templateType;
          setButtonText("Regenerate");
          downloadSectionWrapper.style.display = "block";
          setButtonLoading(false);
        } else {
          setStatus("❌ Error: Invalid response from server", "error");
          downloadSectionWrapper.style.display = "none";
          setButtonLoading(false);
        }
      }
    );
  } catch (err) {
    setStatus("❌ Error: " + err.message, "error");
    downloadSectionWrapper.style.display = "none";
    setButtonLoading(false);
  }
});

// Download PDF
downloadPdfBtn.addEventListener("click", async () => {
  if (!currentCoverLetter) {
    setStatus("❌ No cover letter available. Please generate one first.", "error");
    return;
  }

  try {
    setStatus("", "");
    downloadPdfBtn.disabled = true;

    let token = await getAuthToken();
    
    let response = await fetch(`${API_URL}/generate-pdf`, {
      method: "POST",
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ coverLetter: currentCoverLetter, metadata: currentMetadata })
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
          body: JSON.stringify({ coverLetter: currentCoverLetter, metadata: currentMetadata })
        });
        
        if (!response.ok) {
          const errText = await response.text();
          setStatus("❌ Error: " + errText, "error");
          downloadPdfBtn.disabled = false;
          return;
        }
        
        const blob = await response.blob();
        // Extract filename from Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = generateFilename("pdf");
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
          if (filenameMatch) {
            filename = filenameMatch[1];
          }
        }
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setStatus("", "");
        downloadPdfBtn.disabled = false;
      });
      return;
    }

    if (!response.ok) {
      const errText = await response.text();
      setStatus("❌ Error: " + errText, "error");
      downloadPdfBtn.disabled = false;
      return;
    }

    const blob = await response.blob();
    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = generateFilename("pdf");
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    setStatus("", "");
    downloadPdfBtn.disabled = false;
  } catch (err) {
    setStatus("❌ Error: " + err.message, "error");
    downloadPdfBtn.disabled = false;
  }
});

// View PDF in modal
viewBtn.addEventListener("click", async () => {
  if (!currentCoverLetter) {
    setStatus("❌ No cover letter available. Please generate one first.", "error");
    return;
  }

  try {
    setStatus("", "");
    viewBtn.disabled = true;

    let token = await getAuthToken();
    
    let response = await fetch(`${API_URL}/generate-pdf`, {
      method: "POST",
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ coverLetter: currentCoverLetter, metadata: currentMetadata })
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
          body: JSON.stringify({ coverLetter: currentCoverLetter, metadata: currentMetadata })
        });
        
        if (!response.ok) {
          const errText = await response.text();
          setStatus("❌ Error: " + errText, "error");
          viewBtn.disabled = false;
          return;
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        pdfViewer.src = url;
        pdfModalOverlay.classList.add("active");
        setStatus("", "");
        viewBtn.disabled = false;
      });
      return;
    }

    if (!response.ok) {
      const errText = await response.text();
      setStatus("❌ Error: " + errText, "error");
      viewBtn.disabled = false;
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    pdfViewer.src = url;
    pdfModalOverlay.classList.add("active");
    setStatus("", "");
    viewBtn.disabled = false;
  } catch (err) {
    setStatus("❌ Error: " + err.message, "error");
    viewBtn.disabled = false;
  }
});

// Close PDF modal
pdfModalClose.addEventListener("click", () => {
  pdfModalOverlay.classList.remove("active");
  // Clean up the object URL to free memory
  if (pdfViewer.src && pdfViewer.src.startsWith("blob:")) {
    window.URL.revokeObjectURL(pdfViewer.src);
    pdfViewer.src = "";
  }
});

// Close modal when clicking outside the container
pdfModalOverlay.addEventListener("click", (e) => {
  if (e.target === pdfModalOverlay) {
    pdfModalOverlay.classList.remove("active");
    // Clean up the object URL to free memory
    if (pdfViewer.src && pdfViewer.src.startsWith("blob:")) {
      window.URL.revokeObjectURL(pdfViewer.src);
      pdfViewer.src = "";
    }
  }
});

// Close modal with Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && pdfModalOverlay.classList.contains("active")) {
    pdfModalOverlay.classList.remove("active");
    // Clean up the object URL to free memory
    if (pdfViewer.src && pdfViewer.src.startsWith("blob:")) {
      window.URL.revokeObjectURL(pdfViewer.src);
      pdfViewer.src = "";
    }
  }
});

// Download DOCX
downloadDocxBtn.addEventListener("click", async () => {
  if (!currentCoverLetter) {
    setStatus("❌ No cover letter available. Please generate one first.", "error");
    return;
  }

  try {
    setStatus("", "");
    downloadDocxBtn.disabled = true;

    let token = await getAuthToken();
    
    let response = await fetch(`${API_URL}/generate-docx`, {
      method: "POST",
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ coverLetter: currentCoverLetter, metadata: currentMetadata })
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
          body: JSON.stringify({ coverLetter: currentCoverLetter, metadata: currentMetadata })
        });
        
        if (!response.ok) {
          const errText = await response.text();
          setStatus("❌ Error: " + errText, "error");
          downloadDocxBtn.disabled = false;
          return;
        }
        
        const blob = await response.blob();
        // Extract filename from Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = generateFilename("docx");
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
          if (filenameMatch) {
            filename = filenameMatch[1];
          }
        }
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setStatus("", "");
        downloadDocxBtn.disabled = false;
      });
      return;
    }

    if (!response.ok) {
      const errText = await response.text();
      setStatus("❌ Error: " + errText, "error");
      downloadDocxBtn.disabled = false;
      return;
    }

    const blob = await response.blob();
    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = generateFilename("docx");
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    setStatus("", "");
    downloadDocxBtn.disabled = false;
  } catch (err) {
    setStatus("❌ Error: " + err.message, "error");
    downloadDocxBtn.disabled = false;
  }
});

// Theme toggle functionality
function applyTheme(isDark) {
  if (isDark) {
    document.body.classList.add("dark-mode");
  } else {
    document.body.classList.remove("dark-mode");
  }
}

function loadTheme() {
  chrome.storage.local.get("darkMode", (data) => {
    const isDark = data.darkMode === true;
    applyTheme(isDark);
  });
}

themeToggleBtn.addEventListener("click", () => {
  const isDark = document.body.classList.contains("dark-mode");
  const newTheme = !isDark;
  applyTheme(newTheme);
  chrome.storage.local.set({ darkMode: newTheme });
});

// Load theme on page load
loadTheme();

// Ensure user menu is closed on page load
userMenu.classList.remove("active");
userIconBtn.classList.remove("active");

// Check if user is already signed in
chrome.storage.local.get("user", (data) => {
  if (data.user) {
    currentUser = data.user;
    updateUI();
  } else {
    updateUI();
  }
});
