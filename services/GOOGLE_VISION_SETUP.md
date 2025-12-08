# Google Cloud Vision API Setup Guide

## Step-by-Step Instructions

### Step 1: Create Google Cloud Account
1. Go to: https://cloud.google.com/
2. Click "Get started for free"
3. Sign in with your Google account
4. Complete the account setup (credit card may be required, but free tier is available)

### Step 2: Create a New Project
1. Go to: https://console.cloud.google.com/
2. Click the project dropdown at the top
3. Click "New Project"
4. Enter project name: `tamil-ocr-project` (or any name)
5. Click "Create"
6. Wait for project creation (takes a few seconds)

### Step 3: Enable Vision API
1. Go to: https://console.cloud.google.com/apis/library
2. Search for "Cloud Vision API"
3. Click on "Cloud Vision API"
4. Click "Enable" button
5. Wait for API to be enabled (takes a few seconds)

### Step 4: Create API Key
1. Go to: https://console.cloud.google.com/apis/credentials
2. Click "+ CREATE CREDENTIALS" at the top
3. Select "API key"
4. Your API key will be created and displayed
5. **IMPORTANT**: Copy the API key immediately (you won't see it again)

### Step 5: Restrict API Key (Recommended for Security)
1. Click on the API key you just created (or click "RESTRICT KEY")
2. Under "API restrictions":
   - Select "Restrict key"
   - Check "Cloud Vision API"
3. Under "Application restrictions" (optional):
   - You can restrict by IP or HTTP referrer for web apps
4. Click "Save"
5. Wait a few minutes for restrictions to take effect

### Step 6: Configure in Your Project
1. Create or edit `.env` file in `backend` folder:
   ```env
   GOOGLE_VISION_API_KEY=your_api_key_here
   ```
2. Replace `your_api_key_here` with your actual API key
3. Save the file

### Step 7: Test the Setup
Run the test script:
```bash
cd backend
node services/test-google-vision.js
```

## Free Tier Limits

- **1,000 requests per month** (free)
- **$1.50 per 1,000 images** after free tier
- No credit card required for free tier
- Free tier resets monthly

## Billing Setup (Required Even for Free Tier)

1. Go to: https://console.cloud.google.com/billing
2. Click "Link a billing account"
3. Enter billing information
4. **Note**: You won't be charged until you exceed free tier

## Security Best Practices

1. **Restrict API Key**: Only allow Cloud Vision API
2. **Don't commit API key**: Keep it in `.env` file (already in `.gitignore`)
3. **Monitor usage**: Check usage in Google Cloud Console
4. **Set budget alerts**: Set up alerts if you exceed free tier

## Troubleshooting

### Error: "API key not valid"
- Check if API key is correct
- Verify Vision API is enabled
- Wait a few minutes after creating key

### Error: "Billing not enabled"
- Enable billing in Google Cloud Console
- Free tier still works with billing enabled

### Error: "Quota exceeded"
- You've used your free tier (1,000/month)
- Wait for next month or upgrade to paid plan

## Cost Monitoring

1. Go to: https://console.cloud.google.com/billing
2. Click on your billing account
3. View "Cost breakdown" to see usage
4. Set up budget alerts if needed

## Next Steps

After setup:
1. Test with: `node services/test-google-vision.js`
2. Upload a PDF to see Google Vision in action
3. Check logs to see which provider is used

---

**Need Help?**
- Google Cloud Support: https://cloud.google.com/support
- Vision API Docs: https://cloud.google.com/vision/docs

