const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');
const crypto = require('crypto');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 5001; // Different port to avoid conflict

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// MongoDB connection
const mongoURI = 'mongodb://localhost:27017/image2url';
const conn = mongoose.createConnection(mongoURI);

let gfs;
conn.once('open', () => {
    gfs = Grid(conn.db, mongoose.mongo);
    gfs.collection('uploads');
    console.log('Connected to MongoDB GridFS');
});

// Create storage engine
const storage = new GridFsStorage({
    url: mongoURI,
    file: (req, file) => {
        return new Promise((resolve, reject) => {
            crypto.randomBytes(16, (err, buf) => {
                if (err) return reject(err);
                const filename = buf.toString('hex') + path.extname(file.originalname);
                const fileInfo = {
                    filename: filename,
                    bucketName: 'uploads'
                };
                resolve(fileInfo);
            });
        });
    }
});

const upload = multer({ storage }); // No file size limit

// @route POST /upload
app.post('/upload', upload.array('images', 10), (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    const urls = req.files.map(file => `http://localhost:${port}/image/${file.filename}`);
    res.json({ files: req.files, urls: urls });
});

// @route GET /image/:filename
app.get('/image/:filename', (req, res) => {
    if (!gfs) return res.status(500).json({ error: 'GridFS not initialized' });
    
    gfs.files.findOne({ filename: req.params.filename }, (err, file) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!file || file.length === 0) {
            return res.status(404).json({ error: 'No file exists' });
        }
        
        // Basic check for image or video
        const isImage = file.contentType && file.contentType.startsWith('image/');
        const isVideo = file.contentType && file.contentType.startsWith('video/');

        if (isImage || isVideo) {
            res.set('Content-Type', file.contentType);
            res.set('Accept-Ranges', 'bytes'); // Hint for video seeking
            const readstream = gfs.createReadStream(file.filename);
            readstream.on('error', (err) => res.status(500).json({ error: 'Stream error' }));
            readstream.pipe(res);
        } else {
            res.status(400).json({ error: 'Not a supported image or video' });
        }
    });
});

// @route GET /images
app.get('/images', (req, res) => {
    gfs.files.find().sort({ uploadDate: -1 }).toArray((err, files) => {
        if (err || !files || files.length === 0) {
            return res.json([]);
        }
        const imagesWithUrl = files.map(file => {
            const isVideo = file.contentType && (file.contentType === 'video/mp4' || file.contentType === 'video/webm' || file.contentType === 'video/ogg' || file.contentType.startsWith('video/'));
            return {
                ...file,
                url: `http://localhost:${port}/image/${file.filename}`,
                _id: file._id,
                type: isVideo ? 'video' : 'image'
            };
        });
        res.json(imagesWithUrl);
    });
});

// @route DELETE /image/:id
app.delete('/image/:id', (req, res) => {
    const { id } = req.params;
    gfs.remove({ _id: id, root: 'uploads' }, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deleted successfully' });
    });
});

app.listen(port, () => console.log(`Local GridFS Server started on port ${port}`));
