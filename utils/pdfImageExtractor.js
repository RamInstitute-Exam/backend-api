import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import { createCanvas } from 'canvas';
import cloudinary from '../config/Cloudinary.js';

const MAX_PAGES = 40;
const MAX_IMAGES_PER_PAGE = 10; // Limit images per page to avoid too many uploads

/**
 * Extract images from PDF pages and upload to Cloudinary
 * Returns a map of page number -> array of image URLs
 */
export async function extractImagesFromPDF(pdfBuffer, examCode, examName) {
  if (!pdfBuffer || !pdfBuffer.length) {
    console.warn("❌ PDF buffer is empty for image extraction.");
    return {};
  }

  const imageMap = {}; // pageNumber -> [imageUrls]
  let pdfDocument;

  try {
    pdfDocument = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  } catch (error) {
    console.error("❌ Error loading PDF document for image extraction:", error);
    return {};
  }

  console.log(`🖼️  Starting image extraction from PDF (${pdfDocument.numPages} pages)`);

  for (let i = 0; i < Math.min(pdfDocument.numPages, MAX_PAGES); i++) {
    const pageNum = i + 1;
    const pageImages = [];

    try {
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better quality
      
      // Render entire page to canvas
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      // Convert canvas to buffer
      const imageBuffer = canvas.toBuffer('image/png');

      // Upload to Cloudinary
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              folder: `exams/${examCode}/pages`,
              public_id: `page_${pageNum}`,
              resource_type: 'image',
              format: 'png',
              transformation: [
                { quality: 'auto', fetch_format: 'auto' }
              ]
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(imageBuffer);
        });

        pageImages.push({
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          pageNumber: pageNum,
          type: 'full_page'
        });

        console.log(`✅ Extracted and uploaded image for page ${pageNum}: ${uploadResult.secure_url}`);
      } catch (uploadError) {
        console.error(`❌ Failed to upload image for page ${pageNum}:`, uploadError.message);
      }

      // Also try to extract embedded images from the page (if any)
      const operatorList = await page.getOperatorList();
      let imageCount = 0;
      
      // Check if OPS is available (may not be in all pdfjs-dist versions)
      const OPS = pdfjsLib.OPS || {};
      
      for (const op of operatorList.fnArray) {
        if (OPS.paintImageXObject && (op === OPS.paintImageXObject || op === OPS.paintImageXObjectGroup)) {
          if (imageCount >= MAX_IMAGES_PER_PAGE) break;
          
          try {
            // Get image data
            const imageName = operatorList.argsArray[operatorList.fnArray.indexOf(op)];
            const image = await page.objs.get(imageName);
            
            if (image && image.data) {
              // Upload embedded image
              const uploadResult = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                  {
                    folder: `exams/${examCode}/images`,
                    public_id: `page_${pageNum}_img_${imageCount + 1}`,
                    resource_type: 'image',
                    format: 'png',
                    transformation: [
                      { quality: 'auto', fetch_format: 'auto' }
                    ]
                  },
                  (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                  }
                ).end(Buffer.from(image.data));
              });

              pageImages.push({
                url: uploadResult.secure_url,
                publicId: uploadResult.public_id,
                pageNumber: pageNum,
                type: 'embedded',
                index: imageCount + 1
              });

              console.log(`✅ Extracted embedded image ${imageCount + 1} from page ${pageNum}`);
              imageCount++;
            }
          } catch (imgError) {
            console.warn(`⚠️  Failed to extract embedded image from page ${pageNum}:`, imgError.message);
          }
        }
      }

      if (pageImages.length > 0) {
        imageMap[pageNum] = pageImages;
      }

      // Clean up page resources (if method exists)
      if (page.destroy && typeof page.destroy === 'function') {
        page.destroy();
      }
    } catch (err) {
      console.error(`❌ Error processing page ${pageNum} for images:`, err.message);
    }
  }

  // Clean up document resources (if method exists)
  if (pdfDocument.destroy && typeof pdfDocument.destroy === 'function') {
    pdfDocument.destroy();
  }
  
  const totalImages = Object.values(imageMap).reduce((sum, images) => sum + images.length, 0);
  console.log(`📊 Image extraction complete: ${totalImages} images extracted from ${Object.keys(imageMap).length} pages`);

  return imageMap;
}

/**
 * Associate images with questions based on page numbers and question positions
 * Improved version that better matches images to questions
 */
export function associateImagesWithQuestions(questions, imageMap, questionsPerPage = 5) {
  // First, identify questions that need images based on keywords
  const questionsNeedingImages = questions.filter(q => {
    const qTextLower = q.questionTextEnglish.toLowerCase();
    return qTextLower.includes('figure') || 
           qTextLower.includes('diagram') || 
           qTextLower.includes('shown in the') ||
           qTextLower.includes('refer to the') ||
           qTextLower.includes('see the') ||
           qTextLower.includes('in the figure') ||
           qTextLower.includes('in figure') ||
           q.hasImage === true ||
           q.questionType === 'image';
  });
  
  console.log(`🔍 Found ${questionsNeedingImages.length} questions that likely need images`);
  
  const questionsWithImages = questions.map(q => {
    // If question already has imageUrl, keep it
    if (q.imageUrl) {
      return q;
    }
    
    // Check if this question needs an image
    const needsImage = questionsNeedingImages.includes(q);
    const qTextLower = q.questionTextEnglish.toLowerCase();
    
    // Estimate which page this question is on
    // Use a more dynamic calculation based on actual question distribution
    const estimatedPage = Math.ceil(q.questionNumber / questionsPerPage);
    
    // Strategy 1: If question explicitly needs image, find the best match
    if (needsImage) {
      // Check current page first
      if (imageMap[estimatedPage] && imageMap[estimatedPage].length > 0) {
        // Prefer embedded images over full page renders for specific questions
        const embeddedImage = imageMap[estimatedPage].find(img => img.type === 'embedded');
        const pageImage = embeddedImage || imageMap[estimatedPage].find(img => img.type === 'full_page') || imageMap[estimatedPage][0];
        
        return {
          ...q,
          imageUrl: pageImage.url,
          hasImage: true
        };
      }
      
      // Check nearby pages (-2 to +2 range for better coverage)
      for (let pageOffset = -2; pageOffset <= 2; pageOffset++) {
        const checkPage = estimatedPage + pageOffset;
        if (checkPage > 0 && imageMap[checkPage] && imageMap[checkPage].length > 0) {
          const embeddedImage = imageMap[checkPage].find(img => img.type === 'embedded');
          const pageImage = embeddedImage || imageMap[checkPage].find(img => img.type === 'full_page') || imageMap[checkPage][0];
          
          console.log(`🖼️  Associated image from page ${checkPage} with Q${q.questionNumber} (${qTextLower.substring(0, 50)}...)`);
          return {
            ...q,
            imageUrl: pageImage.url,
            hasImage: true
          };
        }
      }
    }
    
    // Strategy 2: If page has images and question is on that page, associate it
    // (but only if question doesn't already have image and page has embedded images)
    if (imageMap[estimatedPage] && imageMap[estimatedPage].length > 0) {
      const embeddedImages = imageMap[estimatedPage].filter(img => img.type === 'embedded');
      if (embeddedImages.length > 0) {
        // Only associate if there are embedded images (not just full page renders)
        // This prevents associating every question with a full page image
        return {
          ...q,
          imageUrl: embeddedImages[0].url,
          hasImage: true
        };
      }
    }
    
    return q;
  });

  const associatedCount = questionsWithImages.filter(q => q.hasImage && q.imageUrl).length;
  console.log(`✅ Associated ${associatedCount} questions with images out of ${questions.length} total questions`);

  return questionsWithImages;
}

