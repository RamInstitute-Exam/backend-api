import express from 'express';
import { sequelize } from '../config/MySQLConfig.js';
import { Op } from 'sequelize';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import cloudinary from '../config/Cloudinary.js';

const router = express.Router();

// Configure multer for file uploads (memory storage for Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// =====================================================
// GET ALL STUDY MATERIALS
// =====================================================
router.get('/', async (req, res) => {
  try {
    const { category, type, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = 'sm.is_active = 1';
    const replacements = {};

    if (category) {
      whereClause += ' AND sm.category_id = :category';
      replacements.category = category;
    }

    if (type) {
      whereClause += ' AND sm.material_type = :type';
      replacements.type = type;
    }

    if (search) {
      whereClause += ' AND (sm.title LIKE :search OR sm.description LIKE :search)';
      replacements.search = `%${search}%`;
    }

    const [results] = await sequelize.query(`
      SELECT 
        sm.*,
        ec.name as category_name,
        ec.slug as category_slug
      FROM study_materials sm
      LEFT JOIN exam_categories ec ON sm.category_id = ec.id
      WHERE ${whereClause}
      ORDER BY sm.created_at DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements: {
        ...replacements,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM study_materials sm
      WHERE ${whereClause}
    `, {
      replacements
    });

    res.json({
      data: results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0]?.total || 0,
        totalPages: Math.ceil((countResult[0]?.total || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Study materials error:', error);
    res.status(500).json({ error: 'Failed to fetch study materials' });
  }
});

// =====================================================
// CREATE/UPLOAD STUDY MATERIAL
// =====================================================
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { title, description, material_type, category, file_url } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    let fileUrl = file_url || '';
    let thumbnailUrl = null;

    // If file is uploaded, upload to Cloudinary
    if (req.file) {
      try {
        const base64String = req.file.buffer.toString('base64');
        const dataUri = `data:${req.file.mimetype};base64,${base64String}`;
        
        const uploadResult = await cloudinary.uploader.upload(dataUri, {
          folder: 'study-materials',
          resource_type: 'auto',
        });

        fileUrl = uploadResult.secure_url;
        
        // Generate thumbnail for images and videos
        if (uploadResult.resource_type === 'image') {
          thumbnailUrl = uploadResult.secure_url;
        } else if (uploadResult.resource_type === 'video') {
          thumbnailUrl = uploadResult.secure_url.replace('.mp4', '.jpg');
        }
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload file to cloud storage' });
      }
    }

    if (!fileUrl) {
      return res.status(400).json({ error: 'Either file or file_url is required' });
    }

    // Get or create category
    let categoryId = null;
    if (category) {
      const [categoryResults] = await sequelize.query(`
        SELECT id FROM exam_categories WHERE name = :category OR slug = :category LIMIT 1
      `, {
        replacements: { category }
      });

      if (categoryResults.length > 0) {
        categoryId = categoryResults[0].id;
      }
    }

    // Insert study material
    const [result] = await sequelize.query(`
      INSERT INTO study_materials 
      (title, description, material_type, category_id, file_url, thumbnail_url, is_active, created_at, updated_at)
      VALUES (:title, :description, :material_type, :category_id, :file_url, :thumbnail_url, 1, NOW(), NOW())
    `, {
      replacements: {
        title: title.trim(),
        description: description?.trim() || null,
        material_type: material_type || 'pdf',
        category_id: categoryId,
        file_url: fileUrl,
        thumbnail_url: thumbnailUrl
      }
    });

    // Get the insert ID - MySQL returns it differently
    let insertId = null;
    if (result?.insertId) {
      insertId = result.insertId;
    } else if (Array.isArray(result) && result[0]?.insertId) {
      insertId = result[0].insertId;
    } else {
      // Try to get the last insert ID
      const [lastIdResult] = await sequelize.query('SELECT LAST_INSERT_ID() as id');
      insertId = lastIdResult?.[0]?.id || lastIdResult?.id;
    }
    
    if (!insertId) {
      throw new Error('Failed to get insert ID after creating study material');
    }

    // Fetch the created material
    const [materials] = await sequelize.query(`
      SELECT 
        sm.*,
        ec.name as category_name,
        ec.slug as category_slug
      FROM study_materials sm
      LEFT JOIN exam_categories ec ON sm.category_id = ec.id
      WHERE sm.id = :id
    `, {
      replacements: { id: insertId }
    });

    res.status(201).json({
      message: 'Study material uploaded successfully',
      data: materials[0]
    });
  } catch (error) {
    console.error('Upload study material error:', error);
    res.status(500).json({ error: 'Failed to upload study material', details: error.message });
  }
});

// =====================================================
// GET STUDY MATERIAL BY ID
// =====================================================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [results] = await sequelize.query(`
      SELECT 
        sm.*,
        ec.name as category_name,
        ec.slug as category_slug
      FROM study_materials sm
      LEFT JOIN exam_categories ec ON sm.category_id = ec.id
      WHERE sm.id = :id AND sm.is_active = 1
    `, {
      replacements: { id }
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'Study material not found' });
    }

    // Increment view count
    await sequelize.query(`
      UPDATE study_materials
      SET view_count = view_count + 1
      WHERE id = :id
    `, {
      replacements: { id }
    });

    res.json(results[0]);
  } catch (error) {
    console.error('Study material detail error:', error);
    res.status(500).json({ error: 'Failed to fetch study material' });
  }
});

// =====================================================
// GET BOOKMARKS
// =====================================================
router.get('/bookmarks/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const [results] = await sequelize.query(`
      SELECT 
        b.*,
        sm.title,
        sm.description,
        sm.material_type,
        sm.file_url,
        sm.thumbnail_url,
        ec.name as category_name
      FROM bookmarks b
      LEFT JOIN study_materials sm ON b.item_id = sm.id AND b.item_type = 'material'
      LEFT JOIN exam_categories ec ON sm.category_id = ec.id
      WHERE b.student_id = :studentId
        AND b.item_type = 'material'
      ORDER BY b.created_at DESC
    `, {
      replacements: { studentId }
    });

    res.json(results);
  } catch (error) {
    console.error('Bookmarks error:', error);
    res.status(500).json({ error: 'Failed to fetch bookmarks' });
  }
});

// =====================================================
// ADD BOOKMARK
// =====================================================
router.post('/bookmarks', async (req, res) => {
  try {
    const { studentId, itemType, itemId, itemSubtype, notes } = req.body;

    await sequelize.query(`
      INSERT INTO bookmarks 
      (student_id, item_type, item_id, item_subtype, notes)
      VALUES (:studentId, :itemType, :itemId, :itemSubtype, :notes)
      ON DUPLICATE KEY UPDATE
        notes = VALUES(notes),
        created_at = NOW()
    `, {
      replacements: {
        studentId,
        itemType,
        itemId,
        itemSubtype: itemSubtype || null,
        notes: notes || null
      }
    });

    res.json({ message: 'Bookmark added successfully' });
  } catch (error) {
    console.error('Add bookmark error:', error);
    res.status(500).json({ error: 'Failed to add bookmark' });
  }
});

// =====================================================
// REMOVE BOOKMARK
// =====================================================
router.delete('/bookmarks/:studentId/:itemType/:itemId', async (req, res) => {
  try {
    const { studentId, itemType, itemId } = req.params;

    await sequelize.query(`
      DELETE FROM bookmarks
      WHERE student_id = :studentId
        AND item_type = :itemType
        AND item_id = :itemId
    `, {
      replacements: { studentId, itemType, itemId }
    });

    res.json({ message: 'Bookmark removed successfully' });
  } catch (error) {
    console.error('Remove bookmark error:', error);
    res.status(500).json({ error: 'Failed to remove bookmark' });
  }
});

// =====================================================
// CHECK BOOKMARK STATUS
// =====================================================
router.get('/bookmarks/check/:studentId/:itemType/:itemId', async (req, res) => {
  try {
    const { studentId, itemType, itemId } = req.params;

    const [results] = await sequelize.query(`
      SELECT id
      FROM bookmarks
      WHERE student_id = :studentId
        AND item_type = :itemType
        AND item_id = :itemId
    `, {
      replacements: { studentId, itemType, itemId }
    });

    res.json({ isBookmarked: results.length > 0 });
  } catch (error) {
    console.error('Check bookmark error:', error);
    res.status(500).json({ error: 'Failed to check bookmark status' });
  }
});

// =====================================================
// UPDATE STUDY MATERIAL
// =====================================================
router.put('/:id', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, material_type, category, file_url } = req.body;

    // Check if material exists
    const [existing] = await sequelize.query(`
      SELECT * FROM study_materials WHERE id = :id
    `, {
      replacements: { id }
    });

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Study material not found' });
    }

    const currentMaterial = existing[0];
    let fileUrl = file_url || currentMaterial.file_url;
    let thumbnailUrl = currentMaterial.thumbnail_url;

    // If new file is uploaded, upload to Cloudinary
    if (req.file) {
      try {
        const base64String = req.file.buffer.toString('base64');
        const dataUri = `data:${req.file.mimetype};base64,${base64String}`;
        
        const uploadResult = await cloudinary.uploader.upload(dataUri, {
          folder: 'study-materials',
          resource_type: 'auto',
        });

        fileUrl = uploadResult.secure_url;
        
        // Generate thumbnail for images and videos
        if (uploadResult.resource_type === 'image') {
          thumbnailUrl = uploadResult.secure_url;
        } else if (uploadResult.resource_type === 'video') {
          thumbnailUrl = uploadResult.secure_url.replace('.mp4', '.jpg');
        }
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload file to cloud storage' });
      }
    }

    // Get or create category
    let categoryId = currentMaterial.category_id;
    if (category) {
      const [categoryResults] = await sequelize.query(`
        SELECT id FROM exam_categories WHERE name = :category OR slug = :category LIMIT 1
      `, {
        replacements: { category }
      });

      if (categoryResults.length > 0) {
        categoryId = categoryResults[0].id;
      }
    }

    // Update study material
    await sequelize.query(`
      UPDATE study_materials 
      SET 
        title = :title,
        description = :description,
        material_type = :material_type,
        category_id = :category_id,
        file_url = :file_url,
        thumbnail_url = :thumbnail_url,
        updated_at = NOW()
      WHERE id = :id
    `, {
      replacements: {
        id,
        title: (title || currentMaterial.title).trim(),
        description: description?.trim() || currentMaterial.description || null,
        material_type: material_type || currentMaterial.material_type || 'pdf',
        category_id: categoryId,
        file_url: fileUrl,
        thumbnail_url: thumbnailUrl
      }
    });

    // Fetch the updated material
    const [materials] = await sequelize.query(`
      SELECT 
        sm.*,
        ec.name as category_name,
        ec.slug as category_slug
      FROM study_materials sm
      LEFT JOIN exam_categories ec ON sm.category_id = ec.id
      WHERE sm.id = :id
    `, {
      replacements: { id }
    });

    res.json({
      message: 'Study material updated successfully',
      data: materials[0]
    });
  } catch (error) {
    console.error('Update study material error:', error);
    res.status(500).json({ error: 'Failed to update study material', details: error.message });
  }
});

// =====================================================
// DOWNLOAD MATERIAL
// =====================================================
router.get('/download/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [results] = await sequelize.query(`
      SELECT file_url, title, material_type
      FROM study_materials
      WHERE id = :id AND is_active = 1
    `, {
      replacements: { id }
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const material = results[0];

    if (!material.file_url) {
      return res.status(404).json({ error: 'File URL not found for this material' });
    }

    // Increment download count
    await sequelize.query(`
      UPDATE study_materials
      SET download_count = download_count + 1
      WHERE id = :id
    `, {
      replacements: { id }
    });

    // Determine file extension from material type or URL
    let fileExtension = 'pdf';
    if (material.material_type === 'video') {
      fileExtension = 'mp4';
    } else if (material.material_type === 'ebook') {
      fileExtension = 'epub';
    } else if (material.file_url.includes('.')) {
      const urlParts = material.file_url.split('.');
      fileExtension = urlParts[urlParts.length - 1].split('?')[0]; // Remove query params
    }

    // Determine content type
    const contentTypeMap = {
      'pdf': 'application/pdf',
      'mp4': 'video/mp4',
      'epub': 'application/epub+zip',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    const contentType = contentTypeMap[fileExtension] || 'application/octet-stream';

    // If file_url is a HTTP/HTTPS URL (Cloudinary or external), fetch and return as blob
    if (material.file_url.startsWith('http://') || material.file_url.startsWith('https://')) {
      try {
        // Check if it's a Cloudinary URL
        const isCloudinaryUrl = material.file_url.includes('res.cloudinary.com') || 
                                material.file_url.includes('cloudinary.com');
        
        if (isCloudinaryUrl) {
          // For Cloudinary URLs, fetch the file server-side and stream it to the client.
          // IMPORTANT: Keep existing query parameters (they may contain a valid signature).
          // Just ensure we add fl=attachment to force download.
          const urlObj = new URL(material.file_url);
          urlObj.searchParams.set('fl', 'attachment');
          const cleanUrl = urlObj.toString();
          
          console.log(`Fetching Cloudinary file server-side (with query): ${cleanUrl}`);
          
          try {
            // Fetch the file from Cloudinary
            const client = https;
            const fileBuffer = await new Promise((resolve, reject) => {
              const request = client.get(cleanUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0',
                  'Accept': '*/*'
                }
              }, (response) => {
                if (response.statusCode === 401 || response.statusCode === 403) {
                  reject(new Error(`Authentication failed: ${response.statusCode}`));
                  return;
                }
                
                if (response.statusCode !== 200) {
                  reject(new Error(`Failed to fetch: ${response.statusCode} ${response.statusMessage}`));
                  return;
                }
                
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => resolve(Buffer.concat(chunks)));
                response.on('error', reject);
              });
              
              request.on('error', reject);
              request.setTimeout(30000, () => {
                request.destroy();
                reject(new Error('Request timeout'));
              });
            });
            
            // Successfully fetched - stream to client with download headers
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${material.title}.${fileExtension}"`);
            res.setHeader('Content-Length', fileBuffer.length);
            res.setHeader('Cache-Control', 'no-cache');
            
            res.send(fileBuffer);
            return;
          } catch (fetchError) {
            console.error('Error fetching from Cloudinary:', fetchError);
            // If fetch fails, redirect to original URL (browser will try to download)
            console.log('Fallback: redirecting to original URL');
            res.redirect(cleanUrl);
            return;
          }
        } else {
          // Not a Cloudinary URL, fetch directly
          const url = new URL(material.file_url);
          const client = url.protocol === 'https:' ? https : http;
          
          const fileBuffer = await new Promise((resolve, reject) => {
            const request = client.get(url, (response) => {
              if (response.statusCode !== 200) {
                reject(new Error(`Failed to fetch file: ${response.statusCode} ${response.statusMessage}`));
                return;
              }
              
              const chunks = [];
              response.on('data', (chunk) => chunks.push(chunk));
              response.on('end', () => resolve(Buffer.concat(chunks)));
              response.on('error', reject);
            });
            
            request.on('error', reject);
            request.setTimeout(30000, () => {
              request.destroy();
              reject(new Error('Request timeout'));
            });
          });
          
          // Set headers for blob download
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `attachment; filename="${material.title}.${fileExtension}"`);
          res.setHeader('Content-Length', fileBuffer.length);
          
          res.send(fileBuffer);
        }
      } catch (fetchError) {
        console.error('Error fetching file from URL:', fetchError);
        // Fallback: redirect to URL (browser will handle download)
        // For Cloudinary, add attachment flag as query parameter
        if (material.file_url.includes('cloudinary.com')) {
          const urlObj = new URL(material.file_url);
          urlObj.searchParams.set('fl', 'attachment');
          res.redirect(urlObj.toString());
        } else {
          res.redirect(material.file_url);
        }
      }
    } else {
      // Serve local file as blob
      const filePath = path.join(process.cwd(), material.file_url);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found on server' });
      }

      // Read file and send as blob
      const fileBuffer = fs.readFileSync(filePath);
      
      // Set headers for blob download
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${material.title}.${fileExtension}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      
      res.send(fileBuffer);
    }
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download material', details: error.message });
  }
});

export default router;

