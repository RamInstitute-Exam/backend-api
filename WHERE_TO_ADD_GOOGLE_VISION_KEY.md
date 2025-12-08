# 📍 Where to Add Google Vision API Key

## File Location

**File Name:** `.env`  
**Full Path:** `C:\Users\HP\OneDrive\Desktop\institute\backend\.env`

## 📝 Step-by-Step Instructions

### Step 1: Navigate to Backend Folder
```
C:\Users\HP\OneDrive\Desktop\institute\backend
```

### Step 2: Create .env File (if it doesn't exist)

**Option A: Using File Explorer**
1. Open File Explorer
2. Go to: `C:\Users\HP\OneDrive\Desktop\institute\backend`
3. Right-click → New → Text Document
4. Rename it to: `.env` (exactly this name, with the dot)
5. Windows may warn you - click "Yes" to confirm

**Option B: Using VS Code or Your Editor**
1. Open the `backend` folder in your editor
2. Create a new file
3. Name it: `.env`
4. Save it

### Step 3: Add This Content to .env File

Open the `.env` file and add this line:

```env
GOOGLE_VISION_API_KEY=your_actual_api_key_here
```

**Replace `your_actual_api_key_here` with your real API key from Google Cloud.**

### Step 4: Get Your API Key

1. **Visit:** https://console.cloud.google.com/apis/credentials
2. **Click:** "CREATE CREDENTIALS" → "API key"
3. **Copy** the key (looks like: `AIzaSyC...`)
4. **Paste** it in your `.env` file

### Step 5: Enable Vision API

1. **Visit:** https://console.cloud.google.com/apis/library
2. **Search:** "Cloud Vision API"
3. **Click:** "Enable"

## ✅ Example .env File

Your `.env` file should look like this:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=institute_db

# JWT Secret
JWT_SECRET=your_jwt_secret

# Google Vision API Key ⭐ ADD YOUR KEY HERE
GOOGLE_VISION_API_KEY=AIzaSyC1234567890abcdefghijklmnopqrstuvwxyz
```

## ⚠️ Important Notes

1. **File name:** Must be exactly `.env` (with dot, no extension)
2. **Location:** Must be in `backend` folder
3. **Format:** `GOOGLE_VISION_API_KEY=your_key` (no spaces around =)
4. **Restart:** Restart your server after adding the key

## 🧪 Test It

After adding the key, restart your server and test:

```bash
node services/test-google-vision.js path/to/test-image.png
```

## 📁 File Structure

```
backend/
├── .env                    ← ADD YOUR KEY HERE
├── index.js
├── package.json
├── services/
│   └── ocr-providers/
│       └── googleVisionService.js  ← Reads from .env
└── ...
```

## 🎯 Quick Summary

1. **File:** `backend/.env`
2. **Add line:** `GOOGLE_VISION_API_KEY=your_key`
3. **Get key from:** https://console.cloud.google.com/apis/credentials
4. **Restart server**

That's it! 🎉

