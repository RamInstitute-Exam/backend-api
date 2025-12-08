# Google Vision API - Setup Instructions

## 📁 File Location

**File Name:** `.env`  
**Location:** `backend/.env` (in the backend folder)

## ✅ Step-by-Step Setup

### Step 1: Create/Edit .env File

1. **Navigate to the backend folder:**
   ```
   C:\Users\HP\OneDrive\Desktop\institute\backend
   ```

2. **Create a file named `.env`** (if it doesn't exist)
   - The file name is exactly: `.env` (with a dot at the beginning)
   - No extension needed

3. **Open the `.env` file** in a text editor

### Step 2: Get Your Google Vision API Key

1. **Visit:** https://console.cloud.google.com/apis/credentials
2. **Sign in** with your Google account
3. **Click "CREATE CREDENTIALS"** → **"API key"**
4. **Copy the API key** (it will look like: `AIzaSyC...`)

### Step 3: Enable Vision API

1. **Visit:** https://console.cloud.google.com/apis/library
2. **Search for:** "Cloud Vision API"
3. **Click "Enable"**
4. Wait a few seconds for it to enable

### Step 4: Add API Key to .env File

1. **Open** `backend/.env` file
2. **Find this line:**
   ```
   GOOGLE_VISION_API_KEY=your_google_vision_api_key_here
   ```
3. **Replace** `your_google_vision_api_key_here` with your actual API key
4. **Example:**
   ```
   GOOGLE_VISION_API_KEY=AIzaSyC1234567890abcdefghijklmnopqrstuvwxyz
   ```
5. **Save the file**

### Step 5: Restart Your Server

After adding the API key:
1. **Stop your server** (if running)
2. **Start it again:**
   ```bash
   npm run dev
   ```

## ✅ Verify It's Working

Run the test script:
```bash
node services/test-google-vision.js path/to/test-image.png
```

Or just upload a PDF - Google Vision will be used automatically if Tesseract results are poor.

## 📝 Example .env File Content

```env
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=institute_db

# JWT
JWT_SECRET=your_secret

# Google Vision API ⭐ ADD YOUR KEY HERE
GOOGLE_VISION_API_KEY=AIzaSyC1234567890abcdefghijklmnopqrstuvwxyz
```

## ⚠️ Important Notes

1. **File name must be exactly:** `.env` (with dot at start)
2. **Location:** Must be in the `backend` folder
3. **No spaces:** `GOOGLE_VISION_API_KEY=your_key` (no spaces around =)
4. **Don't commit:** The `.env` file should NOT be committed to git (it's already in .gitignore)

## 🆘 Troubleshooting

### "API key not found"
- Check file name is exactly `.env` (not `.env.txt`)
- Check file is in `backend` folder
- Check there are no spaces: `GOOGLE_VISION_API_KEY=key` (not `GOOGLE_VISION_API_KEY = key`)
- Restart your server after adding the key

### "API key not valid"
- Verify you copied the entire key
- Check if Vision API is enabled
- Wait a few minutes after creating the key

## 🎉 That's It!

Once you add the API key and restart the server, Google Vision will automatically be used when Tesseract results are poor.

