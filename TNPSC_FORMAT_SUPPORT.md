# TNPSC Exam Format Support

## Overview
The system now fully supports TNPSC (Tamil Nadu Public Service Commission) exam question formats, including:

1. **Assertion-Reason Questions** - 5 options (A through E)
2. **Multiple Choice with Sub-options** - Questions with (i), (ii), (iii) sub-options and combined answer choices
3. **Matching Questions** - List I and List II matching format
4. **Proper Tamil Text Extraction** - Using OCR for accurate Tamil text extraction

## Supported Question Types

### 1. Assertion-Reason Questions (5 Options)
**Format:**
- Assertion [A]: Statement
- Reason [R]: Statement
- Options: A through E (instead of A-D)

**Example:**
```
20. Find the correct Assertion:
Assertion [A]: Coimbatore, Tiruppur and Erode region is called as the textile valley of Tamil Nadu.
Reason [R]: They contribute a major share to the state economy through textiles.

(A) Both [A] and [R] are true and [R] explains [A]
(B) Both [A] and [R] are true but, [R] does not explain [A]
(C) [A] is true but [R] is false
(D) [A] is false but [R] is true
(E) Answer not known
```

**Implementation:**
- Automatically detects assertion-reason questions
- Adds option E to the question structure
- Supports A-E in answer extraction and validation

### 2. Multiple Choice with Sub-options
**Format:**
- Question with sub-options (i), (ii), (iii)
- Answer choices reference sub-options: "(1) and (iii) only"

**Example:**
```
7. Choose the right answer among type Which district in TN has the minimum density of population?

(i) Thiruchirappalli
(ii) The Nilgiris
(iii) Perambalur

(A) (1) and (iii) only
(B) (ii) only
(C) (i) and (ii) only
(D) (ii) and (iii) only
```

**Implementation:**
- Parses sub-options (i, ii, iii, iv)
- Stores sub-options separately
- Handles combined answer references

### 3. Matching Questions
**Format:**
- List I: Items (a, b, c, d)
- List II: Items (1, 2, 3, 4)
- Answer choices show mappings: (a) -> 3, (b) -> 2, etc.

**Example:**
```
16. Match correctly the specific species conservation projects with their corresponding places:

(a) Project Cheetah
(b) Project Sanjeevani
(c) Project Lion
(d) Project Great Indian Bustard

1. Barda Wildlife Sanctuary
2. Desert National Park
3. Kuno National Park
4. Himachal Pradesh

(A) (a)->1, (b)->2, (c)->3, (d)->4
(B) (a)->3, (b)->4, (c)->1, (d)->2
(C) (a)->1, (b)->4, (c)->3, (d)->2
(D) (a)->3, (b)->2, (c)->4, (d)->1
```

**Implementation:**
- Detects List I and List II sections
- Parses items from both lists
- Stores in `listI` and `listII` fields
- Question type set to "match"

## Database Schema Updates

### New Fields Added:
- `option_e` (TEXT) - For assertion-reason questions
- Updated `correct_option` ENUM to include 'E'

### Tables Updated:
- `gk_questions` - Added `option_e` column
- `civil_questions` - Added `option_e` column

**Migration Required:**
See `DATABASE_MIGRATION_OPTIONE.md` for SQL migration scripts.

## Tamil Text Extraction

### OCR-Based Extraction
- Uses Python OCR (EasyOCR/Tesseract) with Tamil language support
- Automatically detects when Tamil text has OCR errors
- Falls back to OCR when text extraction fails

### Tamil Text Normalization
- Removes OCR artifacts
- Fixes character encoding issues
- Preserves proper Tamil Unicode

## Parsing Logic Updates

### Question Detection
- Detects assertion-reason questions by keywords ("assertion", "reason")
- Automatically adds option E when assertion-reason is detected
- Supports both English and Tamil text

### Answer Extraction
- Updated to support A-E options
- Handles assertion-reason answer format
- Validates answers against question type

### Option Parsing
- Supports A-E options (not just A-D)
- Preserves option E during randomization
- Returns option E in API responses

## API Changes

### Question Response Format
```json
{
  "options": {
    "A": "Option A text",
    "B": "Option B text",
    "C": "Option C text",
    "D": "Option D text",
    "E": "Option E text"  // Only for assertion-reason questions
  },
  "questionType": "assertion",
  "correctOption": "A"  // Can be A, B, C, D, or E
}
```

## Frontend Considerations

### Displaying Options
- Check if `options.E` exists before displaying
- Show 5 options for assertion-reason questions
- Show 4 options for standard MCQ questions

### Answer Validation
- Accept A-E for assertion-reason questions
- Accept A-D for standard MCQ questions

## Testing

### Test Cases
1. Upload assertion-reason question PDF
2. Verify option E is parsed and stored
3. Verify answer extraction works for A-E
4. Upload matching question PDF
5. Verify List I and List II are parsed correctly
6. Upload sub-options question PDF
7. Verify sub-options are stored separately

## Next Steps

1. **Run Database Migration**
   ```sql
   -- See DATABASE_MIGRATION_OPTIONE.md
   ```

2. **Test with TNPSC PDFs**
   - Upload assertion-reason questions
   - Upload matching questions
   - Upload sub-options questions

3. **Verify Tamil Extraction**
   - Check Tamil text is properly extracted
   - Verify no garbled characters
   - Confirm OCR is working

## Notes

- Option E is only added for assertion-reason questions
- Standard MCQ questions continue to use A-D
- Tamil text extraction uses OCR when needed
- All question types support both English and Tamil text

