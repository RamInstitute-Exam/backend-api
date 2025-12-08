#!/usr/bin/env python3
"""
PDF Text Extraction Service using Python
Supports better Tamil/Unicode text extraction than Node.js pdf-parse
Uses PyMuPDF (fitz) for text extraction, and OCR (Tesseract/EasyOCR) for image-based PDFs
"""

import sys
import json
import base64
import tempfile
import os
from io import BytesIO

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

# OCR libraries
try:
    import pytesseract
    from PIL import Image
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

try:
    import easyocr
    EASYOCR_AVAILABLE = True
    # Initialize EasyOCR reader once (supports Tamil and English)
    if EASYOCR_AVAILABLE:
        try:
            easyocr_reader = easyocr.Reader(['ta', 'en'], gpu=False)  # 'ta' is Tamil
        except:
            easyocr_reader = None
            EASYOCR_AVAILABLE = False
except ImportError:
    EASYOCR_AVAILABLE = False
    easyocr_reader = None

def extract_text_with_pymupdf(pdf_path):
    """Extract text using PyMuPDF (fitz) - fastest and best for Unicode"""
    try:
        doc = fitz.open(pdf_path)
        text_parts = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            # Extract text with proper encoding
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

def extract_text_with_ocr_tesseract(pdf_path):
    """Extract text using Tesseract OCR with Tamil support"""
    if not TESSERACT_AVAILABLE:
        return {"success": False, "error": "Tesseract not available", "text": ""}
    
    try:
        import fitz
        doc = fitz.open(pdf_path)
        text_parts = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            # Render page to image
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better quality
            img_data = pix.tobytes("png")
            img = Image.open(BytesIO(img_data))
            
            # Run OCR with Tamil and English
            text = pytesseract.image_to_string(img, lang='tam+eng')  # Tamil + English
            if text:
                text_parts.append(text.strip())
        
        doc.close()
        full_text = '\n'.join(text_parts)
        
        return {
            "success": True,
            "text": full_text,
            "pages": len(doc),
            "method": "tesseract-ocr"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Tesseract OCR error: {str(e)}",
            "text": ""
        }

def extract_text_with_ocr_easyocr(pdf_path):
    """Extract text using EasyOCR with Tamil support"""
    if not EASYOCR_AVAILABLE or easyocr_reader is None:
        return {"success": False, "error": "EasyOCR not available", "text": ""}
    
    try:
        import fitz
        doc = fitz.open(pdf_path)
        text_parts = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            # Render page to image
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better quality
            img_data = pix.tobytes("png")
            
            # Run EasyOCR
            results = easyocr_reader.readtext(img_data)
            
            # Combine all detected text
            page_text = []
            for (bbox, text, confidence) in results:
                if confidence > 0.3:  # Filter low confidence
                    page_text.append(text)
            
            if page_text:
                text_parts.append('\n'.join(page_text))
        
        doc.close()
        full_text = '\n'.join(text_parts)
        
        return {
            "success": True,
            "text": full_text,
            "pages": len(doc),
            "method": "easyocr"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"EasyOCR error: {str(e)}",
            "text": ""
        }

def has_tamil_text(text):
    """Check if text contains Tamil characters"""
    if not text:
        return False
    # Tamil Unicode range: 0B80-0BFF
    return any('\u0B80' <= char <= '\u0BFF' for char in text)

def has_ocr_errors(text):
    """Check if text likely has OCR errors (uncommon Tamil characters)"""
    if not text:
        return False
    # Check for uncommon characters that are often OCR mistakes
    uncommon_chars = ['஥', '஧', '஭', '஦', '஫', '஬', 'ஶ', 'ஷ']
    return any(char in text for char in uncommon_chars)

def extract_text_from_pdf(pdf_path, use_ocr=False):
    """Extract text from PDF using best available method
    
    Args:
        pdf_path: Path to PDF file
        use_ocr: If True, use OCR even if text layer exists (for image-based PDFs)
    """
    if not os.path.exists(pdf_path):
        return {
            "success": False,
            "error": f"PDF file not found: {pdf_path}",
            "text": ""
        }
    
    # Step 1: Try text extraction first (fastest)
    text_result = None
    if PYMUPDF_AVAILABLE:
        text_result = extract_text_with_pymupdf(pdf_path)
    elif PDFPLUMBER_AVAILABLE:
        text_result = extract_text_with_pdfplumber(pdf_path)
    
    # Step 2: Check if text extraction worked and has Tamil
    if text_result and text_result.get("success"):
        extracted_text = text_result.get("text", "")
        
        # If text has Tamil and doesn't seem to have OCR errors, use it
        if has_tamil_text(extracted_text) and not has_ocr_errors(extracted_text):
            return text_result
        
        # If text has Tamil but has OCR errors, or if use_ocr is True, try OCR
        if (has_tamil_text(extracted_text) and has_ocr_errors(extracted_text)) or use_ocr:
            # Try EasyOCR first (better for Tamil)
            if EASYOCR_AVAILABLE:
                ocr_result = extract_text_with_ocr_easyocr(pdf_path)
                if ocr_result.get("success"):
                    return ocr_result
            
            # Try Tesseract as fallback
            if TESSERACT_AVAILABLE:
                ocr_result = extract_text_with_ocr_tesseract(pdf_path)
                if ocr_result.get("success"):
                    return ocr_result
        
        # If no Tamil or no OCR errors, return text extraction result
        return text_result
    
    # Step 3: If text extraction failed or returned empty, try OCR
    if EASYOCR_AVAILABLE:
        ocr_result = extract_text_with_ocr_easyocr(pdf_path)
        if ocr_result.get("success"):
            return ocr_result
    
    if TESSERACT_AVAILABLE:
        ocr_result = extract_text_with_ocr_tesseract(pdf_path)
        if ocr_result.get("success"):
            return ocr_result
    
    # Step 4: Return text result if available (even if empty)
    if text_result:
        return text_result
    
    return {
        "success": False,
        "error": "No extraction method available. Install: pip install pymupdf pytesseract pillow easyocr",
        "text": ""
    }

def extract_text_from_base64(pdf_base64):
    """Extract text from base64 encoded PDF"""
    try:
        # Decode base64 PDF
        pdf_data = base64.b64decode(pdf_base64)
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            tmp.write(pdf_data)
            tmp_path = tmp.name
        
        # Extract text
        result = extract_text_from_pdf(tmp_path)
        
        # Clean up
        os.unlink(tmp_path)
        
        return result
    except Exception as e:
        return {
            "success": False,
            "error": f"Base64 decode error: {str(e)}",
            "text": ""
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python pdf-extractor.py <pdf_path> [--ocr] OR python pdf-extractor.py --base64 <base64_string> [--ocr]"
        }))
        sys.exit(1)
    
    use_ocr = "--ocr" in sys.argv
    
    if sys.argv[1] == "--base64":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Base64 string required"}))
            sys.exit(1)
        result = extract_text_from_base64(sys.argv[2])
    else:
        pdf_path = sys.argv[1]
        result = extract_text_from_pdf(pdf_path, use_ocr=use_ocr)
    
    print(json.dumps(result, ensure_ascii=False))

