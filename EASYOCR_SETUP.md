# EasyOCR Setup Guide

## Overview
EasyOCR is an optional fallback OCR service that can be used when Tesseract OCR fails or produces poor results. It's particularly good for Tamil text recognition.

## Installation (Optional)

### Step 1: Install Python 3.7+
```bash
# Check if Python is installed
python3 --version

# If not installed, install Python 3.7 or higher
```

### Step 2: Install EasyOCR
```bash
pip install easyocr
```

**Note**: First-time installation will download language models (~500MB). This is a one-time download.

### Step 3: Verify Installation
```bash
python3 backend/services/easyocr-service.py test_image.png
```

## How It Works

1. **Primary OCR**: Tesseract OCR is used first (already integrated)
2. **Fallback**: If Tesseract fails or produces poor results (< 50 characters), EasyOCR is automatically used
3. **Result**: Best result is returned

## Configuration

The system automatically detects if EasyOCR is available. No configuration needed!

## Performance

- **Tesseract**: Fast, good for clear text
- **EasyOCR**: Slower but more accurate for complex fonts and poor quality images
- **Fallback**: Only used when needed, so performance impact is minimal

## Troubleshooting

### EasyOCR not found
- Install EasyOCR: `pip install easyocr`
- Ensure Python 3.7+ is installed
- Check file permissions for `easyocr-service.py`

### Import errors
- Install dependencies: `pip install easyocr pillow`
- Check Python path in system

### Slow performance
- EasyOCR is slower than Tesseract
- Consider using GPU: `easyocr.Reader(['ta', 'en'], gpu=True)` (requires CUDA)

## Benefits

1. **Better accuracy** for Tamil text in some cases
2. **Automatic fallback** - no manual intervention needed
3. **Free and open source**
4. **Supports 80+ languages** including Tamil

## Current Status

✅ Image preprocessing integrated
✅ Dictionary-based word segmentation (1000+ words)
✅ Enhanced OCR error fixing
✅ EasyOCR fallback ready (optional)

