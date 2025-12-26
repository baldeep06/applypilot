# Deployment Guide for ApplyPilot

This guide explains how to securely deploy ApplyPilot to the Chrome Web Store while keeping your API keys safe.

## Architecture Overview

**Important**: API keys are NEVER exposed in the Chrome extension. The architecture is:

```
Chrome Extension (Client) → Your Server (API Keys) → External APIs (Gemini, Supabase)
```

- **Chrome Extension**: Contains no API keys, only makes requests to your server
- **Your Server**: Contains all API keys in `.env` file (never committed to git)
- **External APIs**: Only your server communicates with them

## Step 1: Deploy Your Server

You need to deploy the Express server to a hosting service. Here are recommended options:

### Option A: Railway (Recommended - Easy Setup)

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your repository
   - Select the `server` folder as the root

3. **Set Environment Variables**
   - Go to your project → Variables
   - Add all variables from your `.env` file:
     ```
     GEMINI_API_KEY=your_key_here
     SUPABASE_URL=your_url_here
     SUPABASE_SERVICE_ROLE_KEY=your_key_here
     NODE_ENV=production
     PORT=3000
     ```

4. **Deploy**
   - Railway will automatically detect `package.json` and deploy
   - Note your deployment URL (e.g., `https://your-app.railway.app`)

### Option B: Render

1. **Create Render Account**
   - Go to [render.com](https://render.com)
   - Sign up

2. **Create Web Service**
   - New → Web Service
   - Connect your GitHub repo
   - Root Directory: `server`
   - Build Command: `npm install`
   - Start Command: `npm start`

3. **Set Environment Variables**
   - Add all variables from `.env` in the Environment section

4. **Deploy**
   - Render will provide a URL like `https://your-app.onrender.com`

### Option C: Vercel (Serverless Functions)

1. **Create `vercel.json` in server folder**:
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "index.js",
         "use": "@vercel/node"
       }
     ],
     "routes": [
       {
         "src": "/(.*)",
         "dest": "index.js"
       }
     ]
   }
   ```

2. **Deploy via Vercel CLI or Dashboard**
3. **Set environment variables in Vercel dashboard**

## Step 2: Update Extension Configuration

### Update API URL in Extension

1. **Edit `popup.js`**:
   ```javascript
   // Replace the default API_URL with your deployed server URL
   let API_URL = "https://your-deployed-server.com"; // Your Railway/Render URL
   ```

2. **Or use Chrome Storage for Dynamic Updates**:
   ```javascript
   // This allows you to update the API URL without republishing the extension
   chrome.storage.sync.get(['apiUrl'], (result) => {
     if (result.apiUrl) {
       API_URL = result.apiUrl;
     } else {
       API_URL = "https://your-deployed-server.com";
     }
   });
   ```

### Update CORS on Server

Your server's CORS is already configured to allow Chrome extensions. Make sure your `.env` includes:

```env
NODE_ENV=production
```

## Step 3: Test the Deployment

1. **Test Server Endpoints**:
   ```bash
   # Test if server is running
   curl https://your-deployed-server.com/resume-status
   
   # Should return 401 (unauthorized) - this is expected without auth token
   ```

2. **Test Extension Locally**:
   - Update `popup.js` with your production server URL
   - Load extension in Chrome
   - Test sign-in and cover letter generation

## Step 4: Prepare for Chrome Web Store

### 1. Update Manifest

Ensure your `manifest.json` is production-ready:

```json
{
  "name": "ApplyPilot",
  "version": "1.0.0",
  "description": "AI-powered cover letter generator",
  "manifest_version": 3,
  // ... rest of manifest
}
```

### 2. Create Extension Package

1. **Remove Development Files**:
   - Remove any `.env` files (should already be in `.gitignore`)
   - Remove `node_modules` from extension folder
   - Remove `server` folder (it's deployed separately)

2. **Create ZIP File**:
   ```bash
   # From the applypilot root directory
   zip -r applypilot-extension.zip . \
     -x "*.git*" \
     -x "*node_modules*" \
     -x "*server*" \
     -x "*.env*" \
     -x "*.md" \
     -x "*.DS_Store"
   ```

### 3. Chrome Web Store Submission

1. **Go to Chrome Web Store Developer Dashboard**:
   - Visit [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole)
   - Pay one-time $5 registration fee (if first time)

2. **Upload Extension**:
   - Click "New Item"
   - Upload your ZIP file
   - Fill in store listing details:
     - Name, description, screenshots
     - Category, language
     - Privacy policy URL (required)

3. **Privacy Policy**:
   - You must provide a privacy policy
   - Explain what data you collect (resume, job postings)
   - Explain how you use it (generate cover letters)
   - Mention Google OAuth, Supabase storage

4. **Submit for Review**:
   - Chrome Web Store will review your extension
   - Usually takes 1-3 business days

## Step 5: Security Checklist

- ✅ API keys are in server `.env` (never in extension code)
- ✅ Server uses environment variables for all secrets
- ✅ CORS is configured to only allow Chrome extensions
- ✅ Server requires authentication (Google OAuth tokens)
- ✅ `.env` is in `.gitignore`
- ✅ No hardcoded secrets in extension code
- ✅ Server URL can be updated via Chrome storage (optional)

## Step 6: Monitoring & Updates

### Monitor Server

- Set up error logging (Railway/Render have built-in logs)
- Monitor API usage (Gemini API quotas)
- Set up alerts for server downtime

### Update Extension

- To update API URL without republishing: Use Chrome storage sync
- To update extension code: Republish to Chrome Web Store

## Environment Variables Reference

### Server `.env` file:

```env
# Required
GEMINI_API_KEY=your_gemini_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional
NODE_ENV=production
PORT=3000
ALLOWED_ORIGIN=https://your-custom-domain.com
```

### Extension (No .env needed!)

The extension doesn't need any environment variables. It only needs:
- The server URL (hardcoded or from Chrome storage)
- Google OAuth client ID (in manifest.json)

## Troubleshooting

### Extension can't connect to server

1. Check server is running: `curl https://your-server.com`
2. Check CORS configuration
3. Check server logs for errors
4. Verify API_URL in extension matches server URL

### CORS errors

- Ensure `NODE_ENV=production` is set
- Check CORS configuration allows Chrome extensions
- Verify origin is `chrome-extension://` (no origin for extension requests)

### Authentication errors

- Verify Google OAuth client ID in manifest.json
- Check token is being sent in Authorization header
- Verify server token verification is working

## Cost Considerations

- **Railway**: ~$5-20/month (free tier available)
- **Render**: Free tier available, paid plans start at $7/month
- **Vercel**: Free tier for serverless functions
- **Gemini API**: Pay-per-use, typically very affordable
- **Supabase**: Free tier available, paid plans start at $25/month

## Support

If you encounter issues during deployment, check:
1. Server logs in your hosting platform
2. Chrome extension console (right-click extension → Inspect popup)
3. Network tab in Chrome DevTools

