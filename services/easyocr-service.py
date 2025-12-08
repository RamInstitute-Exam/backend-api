#!/usr/bin/env python3
"""
EasyOCR Microservice for Tamil Text Extraction
This service can be called as a fallback when Tesseract OCR fails
"""

import sys
import json
import base64
from io import BytesIO
from PIL import Image

try:
    import easyocr
    EASYOCR_AVAILABLE = True
    # Initialize EasyOCR reader once (supports Tamil and English)
    reader = easyocr.Reader(['ta', 'en'], gpu=False)  # 'ta' is Tamil language code
except ImportError:
    EASYOCR_AVAILABLE = False
    reader = None

def extract_text_from_image(image_path):
    """Extract text from image using EasyOCR"""
    if not EASYOCR_AVAILABLE:
        return {"error": "EasyOCR not installed. Install with: pip install easyocr"}
    
    try:
        # Read text from image
        results = reader.readtext(image_path)
        
        # Combine all detected text
        text_parts = []
        for (bbox, text, confidence) in results:
            if confidence > 0.3:  # Filter low confidence results
                text_parts.append(text)
        
        full_text = '\n'.join(text_parts)
        
        return {
            "success": True,
            "text": full_text,
            "confidence": sum([conf for _, _, conf in results]) / len(results) if results else 0
        }
    except Exception as e:
        return {
            "error": str(e),
            "success": False
        }

def extract_text_from_base64(image_base64):
    """Extract text from base64 encoded image"""
    if not EASYOCR_AVAILABLE:
        return {"error": "EasyOCR not installed"}
    
    try:
        # Decode base64 image
        image_data = base64.b64decode(image_base64)
        image = Image.open(BytesIO(image_data))
        
        # Save to temporary file
        import tempfile
        import os
        with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as tmp:
            image.save(tmp.name, 'PNG')
            tmp_path = tmp.name
        
        # Extract text
        result = extract_text_from_image(tmp_path)
        
        # Clean up
        os.unlink(tmp_path)
        
        return result
    except Exception as e:
        return {
            "error": str(e),
            "success": False
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python easyocr-service.py <image_path>"}))
        sys.exit(1)
    
    image_path = sys.argv[1]
    result = extract_text_from_image(image_path)
    print(json.dumps(result))

