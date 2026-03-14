require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Normalize Vercel paths (removes /api prefix so existing routes work)
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    req.url = req.url.replace(/^\/api/, '');
  }
  next();
});

// ── Supabase Client ─────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey &&
    supabaseUrl !== 'your_supabase_url' &&
    supabaseKey !== 'your_supabase_anon_key') {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Supabase configured.');
} else {
  console.warn('⚠️  Supabase not configured. Gallery history will be disabled.');
}

// Helper: save a media record to Supabase
async function saveRecord(url, id_ref, type) {
  if (!supabase) return { id: 'temp-' + Date.now(), url, id_ref, type };
  const { data, error } = await supabase
    .from('images')
    .insert([{ url, id_ref, type }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Helper: fetch all records from Supabase
async function fetchRecords() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('images')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// Helper: delete a record from Supabase
async function deleteRecord(id) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('images')
    .delete()
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Cloudinary / Storage Setup ───────────────────────────────────
const isCloudinaryConfigured =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name' &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_KEY !== 'your_api_key' &&
  process.env.CLOUDINARY_API_SECRET &&
  process.env.CLOUDINARY_API_SECRET !== 'your_api_secret';

let storage;

if (isCloudinaryConfigured) {
  console.log('✅ Cloudinary Configured. Using cloud storage.');
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
      const isVideo = file.mimetype.startsWith('video/');
      return {
        folder: 'image2url',
        resource_type: isVideo ? 'video' : 'image',
        allowed_formats: isVideo
          ? ['mp4', 'webm', 'ogg', 'mov']
          : ['jpg', 'png', 'jpeg', 'gif'],
        public_id: Date.now() + '-' + file.originalname.split('.')[0]
      };
    }
  });
} else {
  console.log('⚠️  Cloudinary keys missing. FALLBACK: Using Local Storage.');
  const isVercel = process.env.VERCEL === '1';
  const uploadsDir = isVercel ? '/tmp/uploads' : path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });

  app.use('/uploads', express.static(uploadsDir));
}

const upload = multer({ storage }); // No file size limit

// ── Routes ───────────────────────────────────────────────────────

// @route GET /cloudinary-config
app.get('/cloudinary-config', (req, res) => {
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    isConfigured: isCloudinaryConfigured
  });
});

// @route GET /sign-upload
app.get('/sign-upload', (req, res) => {
  if (!isCloudinaryConfigured)
    return res.status(400).json({ error: 'Cloudinary not configured' });

  const timestamp = Math.round(new Date().getTime() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder: 'image2url' },
    process.env.CLOUDINARY_API_SECRET
  );

  res.json({
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME
  });
});

// @route POST /save-url  (called after direct Cloudinary upload from frontend)
app.post('/save-url', async (req, res) => {
  try {
    const { url, id_ref, type } = req.body;
    if (!url || !id_ref) return res.status(400).json({ error: 'Missing data' });

    let record;
    try {
      record = await saveRecord(url, id_ref, type || 'image');
    } catch (dbErr) {
      console.error('DB Save failed in save-url:', dbErr.message);
      record = { url, id_ref, type: type || 'image', id: 'temp-' + Date.now() };
    }

    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route POST /upload  (proxy upload — used for small files / local mode)
app.post('/upload', upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedData = [];

    for (const file of req.files) {
      const type = file.mimetype.startsWith('video/') ? 'video' : 'image';
      let url;
      let id_ref;

      if (isCloudinaryConfigured) {
        url = file.path;
        id_ref = file.filename;
      } else {
        const isVercel = process.env.VERCEL === '1';

        if (isVercel) {
          if (type === 'video') {
            throw new Error(
              'Video uploads require Cloudinary to be configured. Please add your Cloudinary credentials.'
            );
          }
          const axios = require('axios');
          const base64Image = fs.readFileSync(file.path, { encoding: 'base64' });
          const formData = new URLSearchParams();
          formData.append('key', '6d207e02198a847aa98d0a2a901485a5');
          formData.append('action', 'upload');
          formData.append('format', 'json');
          formData.append('source', base64Image);

          const response = await axios.post(
            'https://freeimage.host/api/1/upload',
            formData,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
          );

          url = response.data.image.url;
          id_ref = 'freehost-' + response.data.image.name;
          fs.unlinkSync(file.path);
        } else {
          url = `http://localhost:${port}/uploads/${file.filename}`;
          id_ref = file.filename;
        }
      }

      let record;
      try {
        record = await saveRecord(url, id_ref, type);
      } catch (dbErr) {
        console.error('DB Save failed, but serving file:', dbErr.message);
        record = { url, id: 'temp-' + Date.now() + Math.random(), type };
      }

      uploadedData.push(record);
    }

    res.json({
      urls: uploadedData.map(u => u.url),
      data: uploadedData
    });
  } catch (err) {
    console.error('Upload error:', err);
    const message =
      err.message ||
      (typeof err === 'string' ? err : 'Internal Server Error');
    res.status(500).json({ error: message });
  }
});

// @route GET /test — health check
app.get('/test', (req, res) => {
  res.json({
    ok: true,
    message: 'Server is running',
    vercel: process.env.VERCEL,
    supabase: !!supabase,
    cloudinary: isCloudinaryConfigured
  });
});

// @route GET /images
app.get('/images', async (req, res) => {
  try {
    const records = await fetchRecords();
    res.json(records);
  } catch (err) {
    console.error('Fetch error:', err.message);
    res.json([]);
  }
});

// @route DELETE /image/:id
app.delete('/image/:id', async (req, res) => {
  try {
    const id = req.params.id;

    if (String(id).startsWith('temp-')) {
      return res.json({ message: 'Temporary record ignored' });
    }

    // Fetch the record first to get id_ref for Cloudinary deletion
    let record = null;
    if (supabase) {
      const { data } = await supabase
        .from('images')
        .select('*')
        .eq('id', id)
        .single();
      record = data;
    }

    if (!record) return res.status(404).json({ error: 'Record not found' });

    // Delete from Cloudinary / local disk
    if (isCloudinaryConfigured && record.id_ref) {
      try {
        const resourceType = record.type === 'video' ? 'video' : 'image';
        await cloudinary.uploader.destroy(record.id_ref, { resource_type: resourceType });
      } catch (cldErr) {
        console.error('Cloudinary delete error:', cldErr.message);
      }
    } else {
      const localPath = path.join(__dirname, 'uploads', record.id_ref || '');
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    }

    // Delete from Supabase
    await deleteRecord(id);

    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`\n🚀 Server running at http://localhost:${port}`);
  if (!isCloudinaryConfigured) {
    console.log(`📂 Files will be served from: http://localhost:${port}/uploads/`);
  }
});

module.exports = app;
