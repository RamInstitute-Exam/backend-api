# Third-Party OCR Services Setup Guide

## Quick Start

### Option 1: OCR.space (Free Tier - Recommended to Start)
1. **No setup required!** OCR.space works out of the box with a default free API key
2. **Get your own API key** (optional, for higher limits):
   - Visit: https://ocr.space/OCRAPI
   - Sign up for free account
   - Get API key
   - Set environment variable: `OCR_SPACE_API_KEY=your_key_here`

**Free Tier Limits:**
- 25,000 requests per day
- No credit card required
- Supports Tamil language

### Option 2: Google Cloud Vision API (Best Accuracy)
1. **Create Google Cloud Account**: https://cloud.google.com/
2. **Enable Vision API**:
   ```bash
   # Install gcloud CLI
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   gcloud services enable vision.googleapis.com
   ```
3. **Create API Key**:
   - Go to: https://console.cloud.google.com/apis/credentials
   - Create API Key
   - Restrict to Vision API
4. **Set Environment Variable**:
   ```bash
   export GOOGLE_VISION_API_KEY=your_api_key_here
   ```

**Free Tier:**
- 1,000 requests/month
- $1.50 per 1,000 images after free tier

### Option 3: AWS Textract
1. **Create AWS Account**: https://aws.amazon.com/
2. **Create IAM User**:
   - Go to IAM Console
   - Create user with `AmazonTextractFullAccess` policy
   - Create access keys
3. **Set Environment Variables**:
   ```bash
   export AWS_ACCESS_KEY_ID=your_access_key
   export AWS_SECRET_ACCESS_KEY=your_secret_key
   export AWS_REGION=us-east-1
   ```

**Free Tier:**
- 1,000 pages/month (first 3 months)
- $1.50 per 1,000 pages after free tier

## Environment Variables

Create a `.env` file in the `backend` directory:

```env
# OCR.space (Free tier - works without key, but better with key)
OCR_SPACE_API_KEY=your_ocr_space_key

# Google Cloud Vision (Optional)
GOOGLE_VISION_API_KEY=your_google_api_key

# AWS Textract (Optional)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
```

## How It Works

The system uses a **smart fallback chain**:

1. **Tesseract** (local, free) - Always tried first
2. **OCR.space** (cloud, free tier) - If Tesseract fails
3. **Google Vision** (cloud, paid) - If OCR.space fails and configured
4. **AWS Textract** (cloud, paid) - If Google fails and configured
5. **EasyOCR** (local, free) - Final fallback

## Testing

### Test Available Providers
```javascript
import { getAvailableProviders } from './services/ocr-providers/index.js';

const providers = await getAvailableProviders();
console.log(providers);
```

### Test Specific Provider
```javascript
import { extractTextWithOCRSpace } from './services/ocr-providers/index.js';

const result = await extractTextWithOCRSpace('path/to/image.png');
console.log(result);
```

## Cost Optimization

### Free-Only Mode
To use only free services:
```javascript
const result = await extractTextWithThirdParty(imagePath, {
  useFreeOnly: true
});
```

### Provider Priority
The system automatically prioritizes:
1. Free services first
2. Paid services only if free services fail
3. Local services as final fallback

## Troubleshooting

### OCR.space Not Working
- Check if you're hitting rate limits (25K/day)
- Verify API key is set correctly
- Check network connectivity

### Google Vision API Errors
- Verify API key is valid
- Check if Vision API is enabled in your project
- Verify billing is enabled (required even for free tier)

### AWS Textract Errors
- Verify credentials are correct
- Check IAM permissions
- Verify region is correct

## Recommended Configuration

### For Development/Testing:
- Use **OCR.space** (free tier, no setup needed)
- Works immediately, good for testing

### For Production (High Volume):
- Use **Google Cloud Vision** (best accuracy)
- Set up billing for higher limits
- Monitor usage in Google Cloud Console

### For Production (Cost-Conscious):
- Use **OCR.space** with your own API key
- 25K requests/day free tier
- Upgrade to paid plan if needed ($0.50-2.00 per 1K images)

## Next Steps

1. **Start with OCR.space** - It works immediately
2. **Test with your PDFs** - See if accuracy improves
3. **Add Google Vision** - If you need better accuracy
4. **Monitor usage** - Track which provider works best for your content

## Support

- OCR.space: https://ocr.space/OCRAPI
- Google Vision: https://cloud.google.com/vision/docs
- AWS Textract: https://aws.amazon.com/textract/

