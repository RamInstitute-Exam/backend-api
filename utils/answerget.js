// utils/answerget.js
import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import { createCanvas } from 'canvas';
import Tesseract from 'tesseract.js';

const OCR_LANGUAGES = 'eng+tam';
const MAX_PAGES = 40;

/**
 * Check highlight colors around bounding box
 */
function hasHighlight(ctx, bbox, padding = 4) {
  if (!bbox) return false;

  const x0 = Math.max(0, bbox.x0 - padding);
  const y0 = Math.max(0, bbox.y0 - padding);
  const width = Math.max(1, (bbox.x1 - bbox.x0) + padding * 2);
  const height = Math.max(1, (bbox.y1 - bbox.y0) + padding * 2);

  const imageData = ctx.getImageData(x0, y0, width, height);

  let yellowPixelCount = 0;
  let totalPixels = 0;
  
  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    totalPixels++;

    // ✅ Enhanced highlight detection for yellow highlights
    // Yellow highlight: high red and green, low blue (RGB values)
    // Common yellow highlight colors: RGB(255,255,0) or RGB(255,255,153) or similar
    
    // Bright yellow: RGB(255,255,0) or similar
    const isBrightYellow = (r > 240 && g > 240 && b < 50);
    
    // Standard yellow: RGB(255,255,153) or similar
    const isYellow = (r > 200 && g > 200 && b < 100) || 
                     (r > 220 && g > 220 && b < 150) ||
                     (r > 180 && g > 180 && b < 120);
    
    // Light yellow/cream highlight (common in PDFs)
    const isLightYellow = (r > 240 && g > 240 && b > 200 && b < 250);
    
    // Pale yellow (very light highlights)
    const isPaleYellow = (r > 250 && g > 250 && b > 220 && b < 255);
    
    // Green highlight: high green, lower red and blue
    const isGreen = (g > 160 && r < 150 && b < 150) ||
                    (g > 200 && r < 100 && b < 100);
    
    // Check for any yellow/green tint (more lenient - catches faded highlights)
    const hasYellowTint = (r > 200 && g > 200 && (r + g) > (b * 2)) ||
                          (r > 180 && g > 180 && b < 180 && (r + g - b) > 100);
    
    if (isBrightYellow || isYellow || isGreen || isLightYellow || isPaleYellow || hasYellowTint) {
      yellowPixelCount++;
    }
  }
  
  // Consider highlighted if at least 5% of pixels are yellow/green (more lenient)
  if (totalPixels === 0) return false;
  const highlightRatio = yellowPixelCount / totalPixels;
  return highlightRatio > 0.05;
}

/**
 * Extract answers from highlighted Answer PDF
 * This function renders PDF pages and detects highlighted options
 */
export async function extractHighlightedAnswers(pdfBuffer) {
  if (!pdfBuffer || !pdfBuffer.length) {
    throw new Error("❌ Answer PDF buffer is empty.");
  }

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const answerMap = {};

  console.log('🔍 Starting highlight detection for PDF with', pdf.numPages, 'pages');

  for (let i = 0; i < Math.min(pdf.numPages, MAX_PAGES); i++) {
    try {
      const page = await pdf.getPage(i + 1);
      const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better detection
      
      // Create canvas to render PDF page
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');
      
      // Render PDF page to canvas
      await page.render({
        canvasContext: ctx,
        viewport: viewport
      }).promise;

      // Get text content with bounding boxes
      const textContent = await page.getTextContent();
      
      let currentQ = null;
      const questionNumbers = [];
      const options = [];
      const allTextItems = []; // Store all text items for debugging

      // First pass: identify question numbers and options with their positions
      textContent.items.forEach((item) => {
        const str = (item.str || "").trim();
        if (!str) return; // Skip empty strings
        
        const transform = item.transform || [1, 0, 0, 1, 0, 0];
        const x = transform[4];
        const y = transform[5];
        
        // Calculate bounding box (approximate)
        // PDF.js uses coordinate system with origin at bottom-left
        // Canvas uses coordinate system with origin at top-left
        const fontSize = Math.abs(transform[0]) || 12;
        const width = str.length * fontSize * 0.6;
        const height = fontSize * 1.2;
        
        // Convert PDF coordinates to canvas coordinates
        const canvasX = x;
        const canvasY = viewport.height - y - height; // Flip Y coordinate
        
        const bbox = {
          x0: Math.max(0, canvasX - 2),
          y0: Math.max(0, canvasY - 2),
          x1: Math.min(viewport.width, canvasX + width + 2),
          y1: Math.min(viewport.height, canvasY + height + 2)
        };

        // Store text item for debugging
        allTextItems.push({ str, x, y, canvasY, bbox });

        // ✅ Enhanced question number detection - handle more formats
        // Matches: "1", "1.", "1)", "1. ", etc.
        const qNumMatch = str.match(/^(\d+)[\.\)]?\s*$/);
        if (qNumMatch) {
          const qNo = parseInt(qNumMatch[1], 10);
          if (qNo > 0 && qNo <= 200) { // Reasonable question number range
            questionNumbers.push({
              number: qNo,
              bbox: bbox,
              x: x,
              y: y,
              canvasY: canvasY,
              text: str
            });
            currentQ = qNo;
            console.log(`📌 Found question number ${qNo} at position (${x}, ${y})`);
          }
        }

        // ✅ Enhanced option detection - handle more formats
        // Matches: "(A)", "A)", "A.", "A ", "(A) text", "A. text", etc.
        const optionMatch = str.match(/^\(?([A-D])\)?[\.\)]?\s*/);
        if (optionMatch) {
          const option = optionMatch[1].toUpperCase();
          if (['A', 'B', 'C', 'D'].includes(option)) {
            // Check if this is likely an option line (has text after the option letter)
            const isOptionLine = str.length > 2; // More than just "A" or "(A)"
            
            options.push({
              option: option,
              bbox: bbox,
              x: x,
              y: y,
              canvasY: canvasY,
              questionNumber: currentQ, // Associate with current question if found
              isOptionLine: isOptionLine,
              fullText: str
            });
            console.log(`📝 Found option ${option} at position (${x}, ${y}), associated with Q${currentQ || 'none'}`);
          }
        }
      });
      
      console.log(`📊 Page ${i + 1} Summary: ${questionNumbers.length} question numbers, ${options.length} options found`);

      console.log(`📄 Page ${i + 1}: Found ${questionNumbers.length} question numbers, ${options.length} options`);
      if (questionNumbers.length > 0) {
        console.log(`   Question numbers: ${questionNumbers.map(q => q.number).join(', ')}`);
      }
      if (options.length > 0) {
        console.log(`   Options found: ${options.map(o => `${o.option}@Q${o.questionNumber || '?'}`).join(', ')}`);
      }

      // Second pass: Check which options are highlighted
      // ✅ Sort options by Y position (top to bottom) to process in order
      const sortedOptions = [...options].sort((a, b) => a.canvasY - b.canvasY);
      
      for (const opt of sortedOptions) {
        try {
          // ✅ Improved: Check multiple areas for better highlight detection
          // For option lines (full text), check a larger area around the option letter
          const checkBbox = opt.isOptionLine ? {
            x0: Math.max(0, opt.bbox.x0 - 10), // Increased padding
            y0: Math.max(0, opt.bbox.y0 - 10),
            x1: Math.min(viewport.width, opt.bbox.x0 + 150), // Check more of the option line
            y1: Math.min(viewport.height, opt.bbox.y1 + 10)
          } : {
            x0: Math.max(0, opt.bbox.x0 - 10),
            y0: Math.max(0, opt.bbox.y0 - 10),
            x1: Math.min(viewport.width, opt.bbox.x1 + 10),
            y1: Math.min(viewport.height, opt.bbox.y1 + 10)
          };
          
          // Check if this option's bounding box has highlight
          let isHighlighted = hasHighlight(ctx, checkBbox, 20); // Increased padding for better detection
          
          // ✅ Also check a smaller area around just the option letter for cases where highlight is very precise
          if (!isHighlighted && opt.isOptionLine) {
            const letterBbox = {
              x0: Math.max(0, opt.bbox.x0 - 5),
              y0: Math.max(0, opt.bbox.y0 - 5),
              x1: Math.min(viewport.width, opt.bbox.x0 + 30), // Just the letter area
              y1: Math.min(viewport.height, opt.bbox.y1 + 5)
            };
            const letterHighlighted = hasHighlight(ctx, letterBbox, 15);
            if (letterHighlighted) {
              isHighlighted = true; // Mark as highlighted
              console.log(`🎨 Found highlight on option letter for ${opt.option} (full line check missed it)`);
            }
          }
          
          if (isHighlighted) {
            console.log(`🎨 Found HIGHLIGHTED option ${opt.option} at (${opt.x}, ${opt.y}), currently associated with Q${opt.questionNumber || 'none'}`);
            // Find the nearest question number to this option
            let associatedQ = opt.questionNumber;
            
            // If no direct association, find nearest question number by Y position
            if (!associatedQ && questionNumbers.length > 0) {
              // Use canvas Y coordinates for comparison
              const optCanvasY = opt.canvasY;
              
              // Find question number on same line or above (within reasonable distance)
              const sameLineQuestions = questionNumbers.filter(q => {
                return Math.abs(q.canvasY - optCanvasY) < 150; // Within 150 pixels vertically
              });
              
              if (sameLineQuestions.length > 0) {
                // Get the closest one by X position (prefer questions to the left of option)
                sameLineQuestions.sort((a, b) => {
                  const aDist = Math.abs(a.x - opt.x);
                  const bDist = Math.abs(b.x - opt.x);
                  // Prefer questions to the left (smaller x)
                  if (Math.abs(aDist - bDist) < 50) {
                    return a.x - b.x; // Prefer leftmost
                  }
                  return aDist - bDist;
                });
                associatedQ = sameLineQuestions[0].number;
                console.log(`🔗 Associated highlighted ${opt.option} with Q${associatedQ} (same line, distance: ${Math.abs(sameLineQuestions[0].canvasY - optCanvasY).toFixed(1)}px)`);
              } else {
                // Find question number above this option
                const aboveQuestions = questionNumbers.filter(q => {
                  return q.canvasY > optCanvasY; // Question is above option (higher canvasY = lower on page)
                });
                if (aboveQuestions.length > 0) {
                  // Get the closest one above
                  aboveQuestions.sort((a, b) => {
                    return (a.canvasY - optCanvasY) - (b.canvasY - optCanvasY); // Closest to option
                  });
                  associatedQ = aboveQuestions[0].number;
                  console.log(`🔗 Associated highlighted ${opt.option} with Q${associatedQ} (above, distance: ${(aboveQuestions[0].canvasY - optCanvasY).toFixed(1)}px)`);
                } else {
                  // Last resort: find any question number (might be on different page)
                  // Sort by Y distance
                  questionNumbers.sort((a, b) => {
                    return Math.abs(a.canvasY - optCanvasY) - Math.abs(b.canvasY - optCanvasY);
                  });
                  if (questionNumbers.length > 0) {
                    associatedQ = questionNumbers[0].number;
                    console.log(`🔗 Associated highlighted ${opt.option} with Q${associatedQ} (nearest, distance: ${Math.abs(questionNumbers[0].canvasY - optCanvasY).toFixed(1)}px)`);
                  }
                }
              }
            }

            if (associatedQ) {
              // ✅ Improved: Check if this question already has an answer
              // If it does, only override if the new answer is closer (better match)
              if (!answerMap[associatedQ] || answerMap[associatedQ] === null) {
                answerMap[associatedQ] = opt.option;
                console.log(`✅ Found highlighted answer for Q${associatedQ}: ${opt.option} (${opt.isOptionLine ? 'full option line' : 'option letter'})`);
              } else {
                // Check if current association is better (closer to question number)
                const currentAnswerQ = Object.entries(answerMap).find(([q, ans]) => ans === opt.option)?.[0];
                if (currentAnswerQ) {
                  const currentQNum = parseInt(currentAnswerQ);
                  const currentQPos = questionNumbers.find(q => q.number === currentQNum);
                  const newQPos = questionNumbers.find(q => q.number === associatedQ);
                  
                  if (currentQPos && newQPos) {
                    const currentDist = Math.sqrt(Math.pow(currentQPos.x - opt.x, 2) + Math.pow(currentQPos.canvasY - opt.canvasY, 2));
                    const newDist = Math.sqrt(Math.pow(newQPos.x - opt.x, 2) + Math.pow(newQPos.canvasY - opt.canvasY, 2));
                    
                    if (newDist < currentDist) {
                      // New association is closer, update it
                      delete answerMap[currentQNum];
                      answerMap[associatedQ] = opt.option;
                      console.log(`🔄 Updated answer for Q${associatedQ}: ${opt.option} (was Q${currentQNum}, new distance ${newDist.toFixed(1)} < ${currentDist.toFixed(1)})`);
                    } else {
                      console.log(`ℹ️  Q${associatedQ} already has answer ${answerMap[associatedQ]}, keeping existing association`);
                    }
                  } else {
                    console.log(`ℹ️  Q${associatedQ} already has answer ${answerMap[associatedQ]}, skipping ${opt.option}`);
                  }
                } else {
                  console.log(`ℹ️  Q${associatedQ} already has answer ${answerMap[associatedQ]}, skipping ${opt.option}`);
                }
              }
            } else {
              console.warn(`⚠️  Found highlighted option ${opt.option} but couldn't associate with question number`);
              console.warn(`   Option position: (${opt.x}, ${opt.y}), canvasY: ${opt.canvasY}`);
              if (questionNumbers.length > 0) {
                console.warn(`   Available question numbers: ${questionNumbers.map(q => `Q${q.number}@(${q.x},${q.y})`).join(', ')}`);
              } else {
                console.warn(`   ⚠️  No question numbers found on this page!`);
              }
              
              // ✅ Improved: Better fallback - use distance-based matching instead of sequential
              if (questionNumbers.length > 0) {
                // Find question number closest by position (Euclidean distance)
                questionNumbers.sort((a, b) => {
                  const aDist = Math.sqrt(Math.pow(a.x - opt.x, 2) + Math.pow(a.canvasY - opt.canvasY, 2));
                  const bDist = Math.sqrt(Math.pow(b.x - opt.x, 2) + Math.pow(b.canvasY - opt.canvasY, 2));
                  return aDist - bDist;
                });
                
                const closestQ = questionNumbers[0];
                const distance = Math.sqrt(Math.pow(closestQ.x - opt.x, 2) + Math.pow(closestQ.canvasY - opt.canvasY, 2));
                
                // Only assign if distance is reasonable (within 500px)
                if (distance < 500) {
                  associatedQ = closestQ.number;
                  if (!answerMap[associatedQ] || answerMap[associatedQ] === null) {
                    answerMap[associatedQ] = opt.option;
                    console.log(`💡 Distance-based fallback: Associated highlighted ${opt.option} with Q${associatedQ} (distance: ${distance.toFixed(1)}px)`);
                  } else {
                    console.log(`⚠️  Q${associatedQ} already has answer ${answerMap[associatedQ]}, cannot assign ${opt.option}`);
                  }
                } else {
                  console.warn(`⚠️  Closest question (Q${closestQ.number}) is too far (${distance.toFixed(1)}px), skipping assignment`);
                }
              }
            }
          }
        } catch (err) {
          console.warn(`⚠️  Error checking highlight for option ${opt.option}:`, err.message);
        }
      }

    } catch (err) {
      console.error(`❌ Error processing page ${i + 1}:`, err.message);
    }
  }

  console.log(`📋 Highlight detection complete. Found ${Object.keys(answerMap).length} highlighted answers`);
  
  // ✅ Debug: Log all extracted answers sorted by question number
  const sortedAnswers = Object.keys(answerMap)
    .map(q => ({ q: parseInt(q), ans: answerMap[q] }))
    .sort((a, b) => a.q - b.q);
  
  console.log(`📋 Extracted answers summary:`);
  sortedAnswers.forEach(({ q, ans }) => {
    console.log(`   Q${q}: ${ans}`);
  });
  
  // ✅ Warn about potential issues
  const answerCounts = {};
  sortedAnswers.forEach(({ ans }) => {
    answerCounts[ans] = (answerCounts[ans] || 0) + 1;
  });
  
  const duplicateAnswers = Object.entries(answerCounts).filter(([ans, count]) => count > 1);
  if (duplicateAnswers.length > 0) {
    console.warn(`⚠️  Warning: Some answers appear multiple times:`);
    duplicateAnswers.forEach(([ans, count]) => {
      const questions = sortedAnswers.filter(a => a.ans === ans).map(a => a.q);
      console.warn(`   Answer ${ans} appears ${count} times for questions: ${questions.join(', ')}`);
    });
  }
  
  return answerMap;
}
