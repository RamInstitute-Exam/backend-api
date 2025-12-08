# Python PDF Extraction Setup Guide

This project uses Python for better PDF text extraction, especially for Tamil and Unicode text. The Node.js backend calls Python scripts for PDF processing.

## Installation

### 1. Install Python 3.8+

Make sure Python 3 is installed:
```bash
python3 --version
# Should show Python 3.8 or higher
```

### 2. Install Python Dependencies

Install the required Python libraries:

```bash
# Navigate to backend directory
cd backend

# Install dependencies
pip install -r requirements.txt

# OR install individually:
pip install pymupdf pdfplumber
```

**Recommended:** Install `pymupdf` (PyMuPDF) - it's the fastest and has the best Unicode/Tamil support.

**Alternative:** If `pymupdf` installation fails, use `pdfplumber`:
```bash
pip install pdfplumber
```

### 3. Verify Installation

Test the Python PDF extractor:
```bash
python3 services/pdf-extractor.py --help
```

## How It Works

1. **Node.js Backend** receives PDF upload
2. **Calls Python script** (`services/pdf-extractor.py`) via child process
3. **Python extracts text** using PyMuPDF or pdfplumber
4. **Returns JSON** with extracted text to Node.js
5. **Node.js processes** the text (parsing questions, answers, etc.)

## Fallback Behavior

- **Primary:** Python (PyMuPDF or pdfplumber) - better for Tamil/Unicode
- **Fallback:** Node.js `pdf-parse` - if Python is unavailable

The system automatically falls back to Node.js if:
- Python is not installed
- Python libraries are not installed
- Python script fails

## Troubleshooting

### Python not found
```bash
# Windows
python --version

# Linux/Mac
python3 --version
```

### PyMuPDF installation fails
```bash
# Try installing with pip3
pip3 install pymupdf

# Or use pdfplumber instead
pip install pdfplumber
```

### Permission errors
```bash
# Make Python script executable (Linux/Mac)
chmod +x services/pdf-extractor.py
```

### Test Python extraction manually
```bash
# Test with a PDF file
python3 services/pdf-extractor.py path/to/test.pdf

# Should output JSON with extracted text
```

## Performance

- **PyMuPDF:** Fastest, best Unicode support, recommended
- **pdfplumber:** Slower but good for structured content
- **Node.js pdf-parse:** Fastest fallback, but may have Unicode issues

## Notes

- Python script must be in `backend/services/pdf-extractor.py`
- Node.js wrapper is in `backend/utils/pdfExtractorPython.js`
- Integration is in `backend/route/BatchUpload.js`

