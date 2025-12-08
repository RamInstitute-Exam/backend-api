# Quick Start: Python PDF Extraction

## ✅ What's Been Done

Your Node.js backend now uses **Python for PDF text extraction** with automatic fallback to Node.js.

## 🚀 Setup (One-Time)

### 1. Install Python Libraries

```bash
cd backend
pip install pymupdf pdfplumber
```

**OR** use the requirements file:
```bash
pip install -r requirements.txt
```

### 2. Verify Installation

```bash
python3 --version  # Should show Python 3.8+
python3 services/pdf-extractor.py --help  # Should work
```

## 📋 How It Works

1. **Upload PDF** → Node.js receives it
2. **Python extracts text** → Better Tamil/Unicode support
3. **Falls back to Node.js** → If Python unavailable
4. **Text is processed** → Questions/answers parsed as before

## 🔄 Automatic Fallback

- ✅ **Python available** → Uses Python (PyMuPDF/pdfplumber)
- ⚠️ **Python not available** → Uses Node.js `pdf-parse` (existing behavior)
- ✅ **No code changes needed** → Works automatically

## 📁 Files Created

- `backend/services/pdf-extractor.py` - Python extraction service
- `backend/utils/pdfExtractorPython.js` - Node.js wrapper
- `backend/requirements.txt` - Python dependencies
- `backend/PYTHON_PDF_SETUP.md` - Detailed setup guide

## 🧪 Test It

1. Upload a PDF with Tamil text
2. Check console logs:
   - `✅ PDF text extracted using Python (pymupdf)` ← Python working
   - `✅ PDF text extracted using Node.js` ← Fallback working

## ⚙️ Configuration

In `BatchUpload.js`, you can control behavior:

```javascript
const result = await extractTextFromPDF(pdfBuffer, {
  preferPython: true,      // Try Python first
  fallbackToNodeJS: true   // Fallback if Python fails
});
```

## 🐛 Troubleshooting

**Python not found?**
- Windows: Use `python` instead of `python3`
- Check: `python --version` or `python3 --version`

**Library install fails?**
- Try: `pip3 install pymupdf`
- Or: `pip install --user pymupdf`

**Still using Node.js?**
- Check console logs for warnings
- Verify Python script exists: `backend/services/pdf-extractor.py`

## 📊 Benefits

- ✅ **Better Tamil text extraction** - PyMuPDF handles Unicode better
- ✅ **No breaking changes** - Falls back to existing Node.js code
- ✅ **Automatic detection** - Works with or without Python
- ✅ **Better accuracy** - Especially for complex PDFs

## 🎯 Next Steps

1. Install Python libraries (see above)
2. Test with a Tamil PDF
3. Check logs to confirm Python is being used
4. Enjoy better text extraction! 🎉

