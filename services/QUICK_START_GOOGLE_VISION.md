# Quick Start: Google Vision API (5 Minutes)

## Fast Setup

### 1. Get API Key (2 minutes)
1. Visit: https://console.cloud.google.com/apis/credentials
2. Click "CREATE CREDENTIALS" → "API key"
3. Copy the key

### 2. Enable Vision API (1 minute)
1. Visit: https://console.cloud.google.com/apis/library
2. Search "Cloud Vision API"
3. Click "Enable"

### 3. Add to Project (1 minute)
Add to `backend/.env`:
```env
GOOGLE_VISION_API_KEY=your_key_here
```

### 4. Test (1 minute)
```bash
cd backend
node services/test-google-vision.js path/to/test-image.png
```

## That's It! 🎉

Now when you upload PDFs, Google Vision will automatically be used if Tesseract results are poor.

## Free Tier
- 1,000 requests/month free
- $1.50 per 1,000 images after

## Need Help?
See detailed guide: `backend/services/GOOGLE_VISION_SETUP.md`

