# Python API Server Setup Guide

This guide explains how to set up and run the Python FastAPI server for PDF extraction.

## Overview

The Python API server (`pdf-api.py`) provides a REST API for PDF text extraction using PyMuPDF or pdfplumber. The frontend can call this API directly for better Tamil/Unicode text extraction.

## Installation

### 1. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This installs:
- `pymupdf` - Fast PDF extraction with excellent Unicode support
- `pdfplumber` - Alternative PDF library
- `fastapi` - Web framework for the API
- `uvicorn` - ASGI server to run FastAPI
- `python-multipart` - For file uploads

### 2. Verify Installation

```bash
python3 --version  # Should be Python 3.8+
python3 -c "import fastapi, uvicorn, fitz; print('All dependencies installed!')"
```

## Running the Server

### Development Mode

```bash
cd backend/services
python3 pdf-api.py
```

The server will start on `http://localhost:5002`

### Production Mode

```bash
cd backend/services
uvicorn pdf-api:app --host 0.0.0.0 --port 5002 --reload
```

## API Endpoints

### Health Check
```
GET /health
```
Returns server health status.

### Extract Single PDF
```
POST /extract
Content-Type: multipart/form-data

Body:
- file: PDF file
- return_text: true/false (default: true)
```

### Extract Batch PDFs (Question + Answer)
```
POST /extract-batch
Content-Type: multipart/form-data

Body:
- question_pdf: Question PDF file
- answer_pdf: Answer PDF file
```

## Frontend Configuration

The frontend uses the Python API if available. Configure the API URL in your `.env` file:

```env
VITE_PYTHON_API_URL=http://localhost:5002
```

Or it defaults to `http://localhost:5002` if not set.

## Integration Flow

1. **Frontend** uploads PDFs to Python API (`/extract-batch`)
2. **Python API** extracts text using PyMuPDF/pdfplumber
3. **Frontend** receives extracted text
4. **Frontend** sends extracted text + PDFs to Node.js backend
5. **Node.js backend** processes text (parsing questions/answers) and saves to database

## Fallback Behavior

- If Python API is unavailable, the frontend falls back to Node.js backend
- Node.js backend can still use Python script or pdf-parse as fallback

## Testing

### Test Health Endpoint
```bash
curl http://localhost:5002/health
```

### Test PDF Extraction
```bash
curl -X POST http://localhost:5002/extract \
  -F "file=@test.pdf" \
  -F "return_text=true"
```

### Test Batch Extraction
```bash
curl -X POST http://localhost:5002/extract-batch \
  -F "question_pdf=@question.pdf" \
  -F "answer_pdf=@answer.pdf"
```

## Troubleshooting

### Port Already in Use
If port 5002 is taken, change it in `pdf-api.py`:
```python
uvicorn.run(app, host="0.0.0.0", port=5003, log_level="info")
```

### Python API Not Found
- Check if server is running: `curl http://localhost:5002/health`
- Check firewall/network settings
- Verify `VITE_PYTHON_API_URL` in frontend `.env`

### Import Errors
```bash
pip install --upgrade pymupdf fastapi uvicorn python-multipart
```

## Production Deployment

For production, use a process manager like `pm2` or `supervisor`:

```bash
# Using pm2
pm2 start pdf-api.py --name python-pdf-api --interpreter python3

# Or using supervisor
# Create /etc/supervisor/conf.d/python-pdf-api.conf
```

## Notes

- Python API runs on port **5002** (Node.js backend is on **5001**)
- CORS is configured for your frontend domains
- Temporary files are automatically cleaned up
- Supports both PyMuPDF and pdfplumber with automatic fallback

