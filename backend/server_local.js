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
app.use(express.json());

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

const upload = multer({ storage });

// @route POST /upload
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ file: req.file, url: `http://localhost:${port}/image/${req.file.filename}` });
});

// @route GET /image/:filename
app.get('/image/:filename', (req, res) => {
    gfs.files.findOne({ filename: req.params.filename }, (err, file) => {
        if (!file || file.length === 0) {
            return res.status(404).json({ error: 'No file exists' });
        }
        // Check if image
        if (file.contentType === 'image/jpeg' || file.contentType === 'image/png' || file.contentType === 'image/jpg') {
            const readstream = gfs.createReadStream(file.filename);
            readstream.pipe(res);
        } else {
            res.status(400).json({ error: 'Not an image' });
        }
    });
});

// @route GET /images
app.get('/images', (req, res) => {
    gfs.files.find().sort({ uploadDate: -1 }).toArray((err, files) => {
        if (err || !files || files.length === 0) {
            return res.json([]);
        }
        const imagesWithUrl = files.map(file => ({
            ...file,
            url: `http://localhost:${port}/image/${file.filename}`,
            _id: file._id
        }));
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
