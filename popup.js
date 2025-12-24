const signInBtn = document.getElementById("signInBtn");
const signOutBtn = document.getElementById("signOutBtn");
const generateBtn = document.getElementById("generateBtn");
const statusEl = document.getElementById("status");
const resumeInput = document.getElementById("resumeInput");
const templateSelect = document.getElementById("templateSelect");
const userEmailEl = document.getElementById("userEmail");
const resumeStatusEl = document.getElementById("resumeStatus");
const signedOutView = document.getElementById("signedOutView");
const signedInView = document.getElementById("signedInView");

const API_URL = "http://localhost:3000";

let currentUser = null;

function setStatus(msg) {
  statusEl.textContent = msg;
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
    const response = await fetch(`${API_URL}/resume-status`, {
      headers: {
        'Authorization': `Bearer ${currentUser.token}`
      }
    });
    const data = await response.json();
    if (data.hasResume) {
      resumeStatusEl.textContent = `✅ Resume saved (${data.filename})`;
      resumeStatusEl.style.color = "green";
    } else {
      resumeStatusEl.textContent = "⚠️ No resume saved - upload one below";
      resumeStatusEl.style.color = "orange";
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
      setStatus(`❌ Sign in failed: ${errorMsg}`);
      return;
    }
    if (!token) {
      setStatus("❌ Sign in failed: No token received");
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
    setStatus("✅ Signed in successfully!");
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
        setStatus("Signed out");
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
    setStatus("Uploading resume...");
    const response = await fetch(`${API_URL}/upload-resume`, {
      method: "POST",
      headers: {
        'Authorization': `Bearer ${currentUser.token}`
      },
      body: formData
    });

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
      setStatus(`❌ Cannot connect to server. Is it running on ${API_URL}?`);
    } else {
      setStatus(`❌ Error: ${err.message}`);
    }
  }
});

// Generate cover letter
generateBtn.addEventListener("click", async () => {
  try {
    setStatus("Reading job page...");

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id) {
      setStatus("❌ No active tab found.");
      return;
    }

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

        setStatus("Generating cover letter...");

        const templateType = templateSelect.value || "default";

        const response = await fetch(`${API_URL}/generate`, {
          method: "POST",
          headers: {
            'Authorization': `Bearer ${currentUser.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ jobText, templateType })
        });

        if (!response.ok) {
          const errText = await response.text();
          setStatus("❌ Error: " + errText);
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

        setStatus("✅ Cover letter downloaded!");
      }
    );
  } catch (err) {
    setStatus("❌ Error: " + err.message);
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
