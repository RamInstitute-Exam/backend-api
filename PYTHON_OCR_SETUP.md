# Python OCR Setup for Tamil Text Extraction

## Overview

The PDF extraction now uses **OCR (Optical Character Recognition)** to properly extract Tamil text from image-based PDFs. This replaces static word corrections with actual OCR-based extraction.

## Installation

### 1. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This installs:
- `pytesseract` - Tesseract OCR Python wrapper
- `Pillow` - Image processing
- `easyocr` - EasyOCR with Tamil support

### 2. Install Tesseract OCR Engine

#### Windows:
1. Download Tesseract installer from: https://github.com/UB-Mannheim/tesseract/wiki
2. Install it (default location: `C:\Program Files\Tesseract-OCR`)
3. Download Tamil language data:
   - Go to: https://github.com/tesseract-ocr/tessdata
   - Download `tam.traineddata`
   - Place it in: `C:\Program Files\Tesseract-OCR\tessdata\`

#### Linux (Ubuntu/Debian):
```bash
sudo apt-get update
sudo apt-get install tesseract-ocr
sudo apt-get install tesseract-ocr-tam  # Tamil language pack
```

#### macOS:
```bash
brew install tesseract
brew install tesseract-lang  # Includes Tamil
```

### 3. Verify Installation

```bash
# Check Tesseract version
tesseract --version

# Check if Tamil is available
tesseract --list-langs
# Should show 'tam' in the list
```

## How It Works

### Automatic OCR Detection

The system automatically uses OCR when:

1. **Text extraction fails** or returns empty text
2. **Tamil text is detected** but contains OCR errors (uncommon characters)
3. **`use_ocr=True`** is explicitly set in the API call

### OCR Methods

1. **EasyOCR** (Preferred for Tamil)
   - Better accuracy for Tamil text
   - Supports Tamil + English
   - Slower but more accurate

2. **Tesseract OCR** (Fallback)
   - Fast and reliable
   - Requires Tamil language pack
   - Good for mixed Tamil/English

### API Usage

#### Enable OCR in API Call

```javascript
// Frontend
const result = await pythonApiService.extractBatchPDFs(
  questionPdf, 
  answerPdf, 
  true  // useOCR = true
);
```

#### API Endpoint

```python
POST /extract-batch
FormData:
  - question_pdf: File
  - answer_pdf: File
  - use_ocr: bool (default: false, but frontend sends true)
```

## Performance

- **Text extraction (PyMuPDF)**: ~1-2 seconds per PDF
- **EasyOCR**: ~10-30 seconds per PDF (depending on page count)
- **Tesseract OCR**: ~5-15 seconds per PDF

## Troubleshooting

### "Tesseract not found"

**Windows:**
```python
# Add to your Python code or environment
import pytesseract
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
```

**Linux/macOS:**
- Ensure Tesseract is in PATH
- Check: `which tesseract`

### "Tamil language not found"

1. Download `tam.traineddata` from: https://github.com/tesseract-ocr/tessdata
2. Place in Tesseract's `tessdata` folder
3. Restart the Python API server

### EasyOCR First Run

EasyOCR downloads models on first run (~500MB). This is automatic but may take time.

### Memory Issues

If you get memory errors:
- Reduce image resolution in `pdf-extractor.py`:
  ```python
  pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5))  # Lower from 2.0
  ```

## Testing

```bash
# Test OCR extraction
python backend/services/pdf-extractor.py test.pdf --ocr

# Test API
curl -X POST "http://localhost:5002/extract-batch" \
  -F "question_pdf=@question.pdf" \
  -F "answer_pdf=@answer.pdf" \
  -F "use_ocr=true"
```

## Notes

- OCR is **slower** than text extraction but **more accurate** for image-based PDFs
- The system automatically falls back to text extraction if OCR fails
- Tamil text is now extracted properly without static corrections
- Both EasyOCR and Tesseract support Tamil + English mixed text

