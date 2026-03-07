require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
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
app.use(express.json());

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
      allowed_formats: ['jpg', 'png', 'jpeg']
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

const upload = multer({ storage });

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
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let url;
    let id_ref;

    if (isCloudinaryConfigured) {
      url = req.file.path;
      id_ref = req.file.filename;
    } else {
      url = `http://localhost:${port}/uploads/${req.file.filename}`;
      id_ref = req.file.filename;
    }

    // Attempt to save to MySQL if connected, otherwise return URL with warning
    try {
      const newImage = await Image.create({ url, id_ref });
      res.json({ url: newImage.url, id: newImage.id });
    } catch (dbErr) {
      console.error('DB Save failed, but serving file:', dbErr.message);
      // Fallback: Still return the URL so the UI doesn't break, but notify server logs
      res.json({ url, id: 'temp-' + Date.now(), notice: 'Database save failed, image not persisted.' });
    }
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
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
