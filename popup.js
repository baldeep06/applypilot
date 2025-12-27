// JS popup.js logic to control UI and functionality of the popup.html file

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

// user template selection
let selectedTemplate = "default";
let lastGeneratedTemplate = null;
const templateCards = document.querySelectorAll(".template-card");
templateCards.forEach(card => {
  card.addEventListener("click", () => {

    templateCards.forEach(c => c.classList.remove("selected"));
    
    card.classList.add("selected");
    // Update selected template based on the clicked card
    const newTemplate = card.getAttribute("data-template");
    selectedTemplate = newTemplate;
    
    // if template is altered provide a resest button
    if (lastGeneratedTemplate !== null && lastGeneratedTemplate !== newTemplate) {
      setButtonText("Generate");
      // when template is being switched, hide the preview and download buttons - no cover letter
      downloadSectionWrapper.style.display = "none";
    } else if (lastGeneratedTemplate === newTemplate) {
      setButtonText("Regenerate");
      // when back to a generated template thru regenerate, bring back preview and download buttons
      downloadSectionWrapper.style.display = "block";
    }
  });
});

// API URL configuration - uses production URL in deployed extension, localhost in development
// Production URL should be set in config.js or via Chrome storage
let API_URL = "https://applypilot-server-992595212896.us-central1.run.app"; // For prod
//let API_URL = "http://localhost:3000";  // For testing locally

// updating server URL via chrome
chrome.storage.sync.get(['apiUrl'], (result) => {
  if (result.apiUrl) {
    API_URL = result.apiUrl;
  }

});

let currentUser = null;

// produce a fresh token for the user's process
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

// state management for button load
function setButtonLoading(isLoading) {
  const buttonTextEl = generateBtn.querySelector('.button-text');
  if (isLoading) {
    // change state to generating and save text
    if (buttonTextEl) {
      savedButtonText = buttonTextEl.textContent;
      buttonTextEl.textContent = "Generating";
    }
    generateBtn.classList.add('loading');
    generateBtn.disabled = true;
  } else {

    // change state to generated and restore text
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

// Function to generate file name for cover letter based on data from the application and user
// variables: candidate name, company name, and position name
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

// checking in on the resume status
async function checkResumeStatus() {
  try {
    // produce a fresh token for the user's process
    const token = await getAuthToken();
    
    const response = await fetch(`${API_URL}/resume-status`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    // If token expired, remove cache, retry once again
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
    
    // if resume is found, update the UI with the file name
    const data = await response.json();
    if (data.hasResume) {
      resumeFileBtn.textContent = "Update file";
      resumeFileName.textContent = data.filename;
    // handling the case where no resume is found
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

// Google sign in button and authentication (sign in with google)
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

    // Google OAuth - user login with help of Google
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const userInfo = await response.json();

    currentUser = {
      email: userInfo.email,
      token: token
    };

    // Save to Chrome SupeBase relational DB
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

// Sign out button, secured by Google
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

// Upload resume to extension for processing
resumeInput.addEventListener("change", async () => {
  const file = resumeInput.files?.[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("resume", file);

  try {
    setStatus("", "");
    
    // Get fresh token
    let token = await getAuthToken();
    
    // post request, send resume to server
    let response = await fetch(`${API_URL}/upload-resume`, {
      method: "POST",
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    // If token expired, refresh and retry 
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

          // if unable to upload resume
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

    // further error handling with erroneous resume upload 
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
  // if unable to upload due to server connection issues - provide UI error message
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
    
    // if template is changed or another is selected, reset the button text
    if (lastGeneratedTemplate !== null && lastGeneratedTemplate !== selectedTemplate) {
      setButtonText("Generate");
    }
    
    // Clear previous status messages
    setStatus("", "");

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    // UI error message if no active tab found
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

        // If token expired, refresh and retry
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
            
            // if unable to generate cover letter
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

        // if cover letter is generated successfully, update the UI to indicate, regnerate, download
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

// Download PDF button
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
        // Based on metadata used to get the file name above, extract and assign here
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

// PDF preview popup

// Close PDF preview
pdfModalClose.addEventListener("click", () => {
  pdfModalOverlay.classList.remove("active");
  // Clean up the object URL to free memory
  if (pdfViewer.src && pdfViewer.src.startsWith("blob:")) {
    window.URL.revokeObjectURL(pdfViewer.src);
    pdfViewer.src = "";
  }
});

// Close PDF preview when clicking outside the popup container 
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

// Close PDF preview with Escape key
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

// Download DOCX logic
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
        // using logic pulled from above for the file name
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
    // Extract filename from above logic
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

// Making sure that the user menu is closed on page load
userMenu.classList.remove("active");
userIconBtn.classList.remove("active");

// Check if user is already signed in to extension
chrome.storage.local.get("user", (data) => {
  if (data.user) {
    currentUser = data.user;
    updateUI();
  } else {
    updateUI();
  }
});
