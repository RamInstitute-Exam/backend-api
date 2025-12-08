#!/usr/bin/env python3
"""
Python FastAPI Server for PDF Upload and Extraction
Handles PDF uploads, text extraction, and returns results to frontend
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import json
import tempfile
import os
from typing import Optional
import sys

# Import our PDF extraction functions
try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False
    try:
        import pdfplumber
        PDFPLUMBER_AVAILABLE = True
    except ImportError:
        PDFPLUMBER_AVAILABLE = False

# Import OCR functions from pdf-extractor
import sys
import importlib.util
import os
ocr_available = False
ocr_functions = None

# Try to import OCR functions from pdf-extractor.py (same directory)
try:
    pdf_extractor_path = os.path.join(os.path.dirname(__file__), "pdf-extractor.py")
    spec = importlib.util.spec_from_file_location("pdf_extractor", pdf_extractor_path)
    if spec and spec.loader:
        pdf_extractor = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(pdf_extractor)
        ocr_functions = pdf_extractor
        ocr_available = True
except Exception as e:
    print(f"Warning: Could not import OCR functions: {e}")
    pass

app = FastAPI(title="PDF Extraction API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://institute-exam.vercel.app",
        "https://institute-exam-d4kz-beta.vercel.app",
        "https://ram-institute-frontend.vercel.app",
        "http://institute-frontend.s3-website.ap-south-1.amazonaws.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def extract_text_with_pymupdf(pdf_path):
    """Extract text using PyMuPDF (fitz) - fastest and best for Unicode"""
    try:
        doc = fitz.open(pdf_path)
        text_parts = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text("text")
            if text:
                text_parts.append(text)
        
        doc.close()
        full_text = '\n'.join(text_parts)
        
        return {
            "success": True,
            "text": full_text,
            "pages": len(doc),
            "method": "pymupdf"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"PyMuPDF error: {str(e)}",
            "text": ""
        }

def extract_text_with_pdfplumber(pdf_path):
    """Extract text using pdfplumber - good for structured content"""
    try:
        text_parts = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    text_parts.append(text)
        
        full_text = '\n'.join(text_parts)
        
        return {
            "success": True,
            "text": full_text,
            "pages": len(pdf.pages),
            "method": "pdfplumber"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"pdfplumber error: {str(e)}",
            "text": ""
        }

def extract_text_from_pdf(pdf_path, use_ocr=False):
    """Extract text from PDF using best available method, with OCR fallback for Tamil"""
    if not os.path.exists(pdf_path):
        return {
            "success": False,
            "error": f"PDF file not found: {pdf_path}",
            "text": ""
        }
    
    # Use OCR-enabled extraction if available
    if ocr_available and ocr_functions:
        return ocr_functions.extract_text_from_pdf(pdf_path, use_ocr=use_ocr)
    
    # Fallback to basic extraction
    if PYMUPDF_AVAILABLE:
        result = extract_text_with_pymupdf(pdf_path)
        if result["success"]:
            return result
        if PDFPLUMBER_AVAILABLE:
            return extract_text_with_pdfplumber(pdf_path)
        return result
    
    if PDFPLUMBER_AVAILABLE:
        return extract_text_with_pdfplumber(pdf_path)
    
    return {
        "success": False,
        "error": "No PDF library available. Install: pip install pymupdf OR pip install pdfplumber",
        "text": ""
    }

@app.get("/")
async def root():
    return {
        "message": "PDF Extraction API",
        "status": "running",
        "pymupdf_available": PYMUPDF_AVAILABLE,
        "pdfplumber_available": PDFPLUMBER_AVAILABLE
    }

@app.get("/health")
async def health():
    """Check API health and available extraction methods"""
    ocr_status = {
        "tesseract": False,
        "easyocr": False
    }
    
    if ocr_available and ocr_functions:
        try:
            ocr_status["tesseract"] = ocr_functions.TESSERACT_AVAILABLE
            ocr_status["easyocr"] = ocr_functions.EASYOCR_AVAILABLE
        except:
            pass
    
    return {
        "status": "healthy",
        "python_version": sys.version,
        "pymupdf_available": PYMUPDF_AVAILABLE,
        "pdfplumber_available": PDFPLUMBER_AVAILABLE,
        "ocr_available": ocr_available,
        "ocr_methods": ocr_status
    }

@app.post("/extract")
async def extract_pdf(
    file: UploadFile = File(...),
    return_text: bool = Form(True),
    use_ocr: bool = Form(False)
):
    """
    Extract text from uploaded PDF file
    use_ocr: If True, use OCR for better Tamil text extraction (slower but more accurate)
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    # Save uploaded file to temporary location
    temp_file = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            content = await file.read()
            tmp.write(content)
            temp_file = tmp.name
        
        # Extract text (with OCR if requested or if Tamil detected)
        result = extract_text_from_pdf(temp_file, use_ocr=use_ocr)
        
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("error", "PDF extraction failed"))
        
        response_data = {
            "success": True,
            "method": result["method"],
            "pages": result["pages"],
            "file_name": file.filename,
            "file_size": len(content)
        }
        
        if return_text:
            response_data["text"] = result["text"]
        
        return JSONResponse(content=response_data)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")
    
    finally:
        # Clean up temp file
        if temp_file and os.path.exists(temp_file):
            try:
                os.unlink(temp_file)
            except:
                pass

@app.post("/extract-batch")
async def extract_batch_pdfs(
    question_pdf: UploadFile = File(...),
    answer_pdf: UploadFile = File(...),
    use_ocr: bool = Form(False)
):
    """
    Extract text from both question and answer PDFs
    Returns both extracted texts
    use_ocr: If True, use OCR for better Tamil text extraction
    """
    results = {
        "question": None,
        "answer": None
    }
    
    temp_files = []
    
    try:
        # Process question PDF
        if question_pdf.content_type != "application/pdf":
            raise HTTPException(status_code=400, detail="Question file must be a PDF")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            content = await question_pdf.read()
            tmp.write(content)
            temp_file_q = tmp.name
            temp_files.append(temp_file_q)
        
        # Extract with OCR if requested (better for Tamil)
        q_result = extract_text_from_pdf(temp_file_q, use_ocr=use_ocr)
        if q_result["success"]:
            results["question"] = {
                "success": True,
                "text": q_result["text"],
                "method": q_result["method"],
                "pages": q_result["pages"],
                "file_name": question_pdf.filename
            }
        else:
            results["question"] = {
                "success": False,
                "error": q_result.get("error", "Extraction failed")
            }
        
        # Process answer PDF
        if answer_pdf.content_type != "application/pdf":
            raise HTTPException(status_code=400, detail="Answer file must be a PDF")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            content = await answer_pdf.read()
            tmp.write(content)
            temp_file_a = tmp.name
            temp_files.append(temp_file_a)
        
        # Extract with OCR if requested (better for Tamil)
        a_result = extract_text_from_pdf(temp_file_a, use_ocr=use_ocr)
        if a_result["success"]:
            results["answer"] = {
                "success": True,
                "text": a_result["text"],
                "method": a_result["method"],
                "pages": a_result["pages"],
                "file_name": answer_pdf.filename
            }
        else:
            results["answer"] = {
                "success": False,
                "error": a_result.get("error", "Extraction failed")
            }
        
        return JSONResponse(content=results)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDFs: {str(e)}")
    
    finally:
        # Clean up temp files
        for temp_file in temp_files:
            if os.path.exists(temp_file):
                try:
                    os.unlink(temp_file)
                except:
                    pass

if __name__ == "__main__":
    # Use PORT from environment (Render) or default to 5002 (local development)
    port = int(os.environ.get("PORT", 5002))
    # Run on port 5002 (Node.js backend is on 5001) for local, or $PORT for Render
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")

