// Configuration for ApplyPilot Chrome Extension
// This file determines which server URL to use based on environment

// Production server URL - replace with your deployed server URL
const PRODUCTION_API_URL = "https://your-server-domain.com";

// Development server URL (localhost)
const DEVELOPMENT_API_URL = "http://localhost:3000";

// Determine which URL to use
// In production (Chrome Web Store), use production URL
// In development, use localhost
const isProduction = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id 
  ? !chrome.runtime.id.includes('localhost') // Simple check - adjust as needed
  : false;

// Export the appropriate API URL
export const API_URL = isProduction ? PRODUCTION_API_URL : DEVELOPMENT_API_URL;

// Alternative: Use environment variable if available
// You can also set this via Chrome storage for easier updates
export async function getApiUrl() {
  // Check if custom API URL is set in storage
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(['apiUrl'], (result) => {
        if (result.apiUrl) {
          resolve(result.apiUrl);
        } else {
          resolve(isProduction ? PRODUCTION_API_URL : DEVELOPMENT_API_URL);
        }
      });
    } else {
      resolve(isProduction ? PRODUCTION_API_URL : DEVELOPMENT_API_URL);
    }
  });
}

