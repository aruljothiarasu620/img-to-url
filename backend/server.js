require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
require('mysql2'); // Explicitly required for Vercel bundler
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

// Determine if Cloudinary is configured
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
    params: {
      folder: 'image2url',
      resource_type: 'auto', // Automatically detects image or video
      allowed_formats: ['jpg', 'png', 'jpeg', 'mp4', 'webm', 'ogg', 'mov']
    }
  });

} else {
  console.log('⚠️  Cloudinary keys missing or placeholder. FALLBACK: Using Local Storage.');
  // Ensure local uploads directory exists
  // Vercel only allows writing to /tmp directory
  const isVercel = process.env.VERCEL === '1';
  const uploadsDir = isVercel ? '/tmp/uploads' : path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }

  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });

  // Serve the uploads folder as static
  app.use('/uploads', express.static(uploadsDir));
}

const upload = multer({ storage }); // No file size limit

// MySQL / Sequelize Connection
const sequelize = new Sequelize(
  process.env.DB_NAME || 'image2url',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
    dialectOptions: {
      connectTimeout: 2000
    },
    retry: { max: 1 }
  }
);

// Define Image Model
const Image = sequelize.define('Image', {
  url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  id_ref: { // Renamed from public_id to be more generic
    type: DataTypes.STRING,
    allowNull: false
  }
});

// Sync Database
async function startDB() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to MySQL successfully.');
    await sequelize.sync();
  } catch (err) {
    console.error('\n❌ MySQL Error: ' + err.message);
    if (err.name === 'SequelizeConnectionRefusedError') {
      console.error('👉 Tip: Make sure MySQL is RUNNING on port 3306.');
    } else if (err.name === 'SequelizeAccessDeniedError') {
      console.error('👉 Tip: Check your DB_USER and DB_PASSWORD in .env');
    } else {
      console.error('👉 Tip: Make sure you have created the database "image2url"');
    }
  }
}
startDB();

// @route POST /upload
app.post('/upload', upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedData = [];

    for (const file of req.files) {
      let url;
      let id_ref;

      if (isCloudinaryConfigured) {
        url = file.path;
        id_ref = file.filename;
      } else {
        // Because Vercel deletes local files in /tmp instantly, we use a public free hosting API
        // as a seamless fallback if the user hasn't set up Cloudinary keys yet.
        const isVercel = process.env.VERCEL === '1';

        if (isVercel) {
          const axios = require('axios');
          const base64Image = fs.readFileSync(file.path, { encoding: 'base64' });
          const formData = new URLSearchParams();
          formData.append('key', '6d207e02198a847aa98d0a2a901485a5'); // Public freeimagehost API Key
          formData.append('action', 'upload');
          formData.append('format', 'json');
          formData.append('source', base64Image);

          const response = await axios.post('https://freeimage.host/api/1/upload', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          });

          url = response.data.image.url;
          id_ref = 'freehost-' + response.data.image.name;

          // Cleanup Vercel temp disk
          fs.unlinkSync(file.path);
        } else {
          url = `http://localhost:${port}/uploads/${file.filename}`;
          id_ref = file.filename;
        }
      }

      // Attempt to save to MySQL if connected, otherwise return URL with warning
      try {
        const newImage = await Image.create({ url, id_ref });
        uploadedData.push({ url: newImage.url, id: newImage.id });
      } catch (dbErr) {
        console.error('DB Save failed, but serving file:', dbErr.message);
        // Fallback: Still return the URL so the UI doesn't break, but notify server logs
        uploadedData.push({ url, id: 'temp-' + Date.now() + Math.random(), notice: 'Database save failed, image not persisted.' });
      }
    }

    res.json({ urls: uploadedData.map(u => u.url), data: uploadedData });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// @route GET /test
// Health check
app.get('/test', (req, res) => {
  res.json({ ok: true, message: 'Server is running', vercel: process.env.VERCEL });
});

// @route GET /images
app.get('/images', async (req, res) => {
  try {
    const images = await Image.findAll({ order: [['createdAt', 'DESC']] });
    res.json(images);
  } catch (err) {
    console.error('Fetch error:', err.message);
    res.json([]); // Return empty gallery if DB is down
  }
});

// @route DELETE /image/:id
app.delete('/image/:id', async (req, res) => {
  try {
    if (String(req.params.id).startsWith('temp-')) {
      return res.json({ message: 'Temporary image ignored' });
    }

    const image = await Image.findByPk(req.params.id);
    if (!image) return res.status(404).json({ error: 'Image not found' });

    if (isCloudinaryConfigured) {
      await cloudinary.uploader.destroy(image.id_ref);
    } else {
      const localPath = path.join(__dirname, 'uploads', image.id_ref);
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    }

    await image.destroy();
    res.json({ message: 'Image deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`\n🚀 Server running at http://localhost:${port}`);
  if (!isCloudinaryConfigured) {
    console.log(`📂 Images will be served from: http://localhost:${port}/uploads/`);
  }
});

module.exports = app;
