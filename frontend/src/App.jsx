import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
    Upload,
    Image as ImageIcon,
    Copy,
    Trash2,
    Check,
    ExternalLink,
    ChevronDown,
    CloudUpload,
    Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE_URL = 'http://localhost:5000';

function App() {
    const [selectedFile, setSelectedFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [images, setImages] = useState([]);
    const [copiedId, setCopiedId] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchImages();
    }, []);

    const fetchImages = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/images`);
            setImages(res.data);
        } catch (err) {
            console.error('Failed to fetch images:', err);
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            setSelectedFile(file);
            setPreview(URL.createObjectURL(file));
        }
    };

    const [generatedUrl, setGeneratedUrl] = useState('');

    const handleUpload = async () => {
        if (!selectedFile) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('image', selectedFile);

        try {
            const res = await axios.post(`${API_BASE_URL}/upload`, formData);
            const newUrl = res.data.url;
            setGeneratedUrl(newUrl); // Store it to show to user

            setSelectedFile(null);
            setPreview(null);
            fetchImages(); // Still refresh gallery in case it worked

            // Auto copy URL if it's the only goal
            navigator.clipboard.writeText(newUrl);
            alert("Success! URL generated and copied to clipboard: \n" + newUrl);

        } catch (err) {
            console.error('Upload failed:', err);
            alert('Upload failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this image?')) return;
        try {
            await axios.delete(`${API_BASE_URL}/image/${id}`);
            fetchImages();
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const copyToClipboard = (url, id) => {
        navigator.clipboard.writeText(url);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                setSelectedFile(file);
                setPreview(URL.createObjectURL(file));
            }
        }
    };

    return (
        <div className="container">
            <header className="header animate-fade-in">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <h1>Image Cloud</h1>
                    <p className="subtitle">Upload your images and get instant public URLs</p>
                </motion.div>
            </header>

            <section className="card animate-fade-in">
                <div className="upload-section">
                    <div
                        className={`dropzone ${dragActive ? 'active' : ''}`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                        />
                        {preview ? (
                            <img src={preview} alt="Preview" style={{ maxHeight: '100%', maxWidth: '100%', borderRadius: '12px' }} />
                        ) : (
                            <div style={{ textAlign: 'center' }}>
                                <motion.div
                                    animate={{ y: [0, -5, 0] }}
                                    transition={{ repeat: Infinity, duration: 2 }}
                                >
                                    <CloudUpload size={48} color="var(--primary)" />
                                </motion.div>
                                <p style={{ marginTop: '16px', fontWeight: '500' }}>
                                    Click or drag and drop image here
                                </p>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                    PNG, JPG, JPEG up to 10MB
                                </p>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            className="btn"
                            onClick={handleUpload}
                            disabled={!selectedFile || uploading}
                        >
                            {uploading ? (
                                <span>Uploading...</span>
                            ) : (
                                <>
                                    <Upload size={20} />
                                    <span>Generate URL</span>
                                </>
                            )}
                        </button>
                        {selectedFile && !uploading && (
                            <button
                                className="btn"
                                style={{ background: 'transparent', border: '1px solid var(--glass-border)' }}
                                onClick={() => { setSelectedFile(null); setPreview(null); }}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </div>
            </section>

            {generatedUrl && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="card animate-fade-in"
                    style={{
                        marginTop: '20px',
                        borderColor: 'var(--accent)',
                        background: 'rgba(34, 211, 238, 0.05)',
                        padding: '24px'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Check size={20} color="var(--accent)" />
                            <h3 style={{ fontSize: '1.1rem', color: 'var(--accent)', fontWeight: '600' }}>URL Generated Successfully:</h3>
                        </div>
                        <button onClick={() => setGeneratedUrl('')} className="icon-btn" style={{ fontSize: '0.8rem' }}>close</button>
                    </div>
                    <div
                        onClick={() => {
                            navigator.clipboard.writeText(generatedUrl);
                            // setCopied(true);
                        }}
                        style={{
                            marginTop: '16px',
                            padding: '16px',
                            background: 'rgba(0,0,0,0.4)',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            wordBreak: 'break-all',
                            color: 'var(--accent)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            fontSize: '0.95rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        {generatedUrl}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                        <button className="btn" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={() => {
                            navigator.clipboard.writeText(generatedUrl);
                            alert('Copied to clipboard!');
                        }}>
                            <Copy size={16} /> Copy URL
                        </button>
                        <a href={generatedUrl} target="_blank" rel="noreferrer" className="btn" style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'transparent', border: '1px solid var(--glass-border)' }}>
                            <ExternalLink size={16} /> Open Link
                        </a>
                    </div>
                </motion.div>
            )}

            <section className="gallery-section">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                    <ImageIcon size={24} color="var(--accent)" />
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '600' }}>Your Gallery</h2>
                </div>

                <div className="gallery">
                    <AnimatePresence>
                        {images.map((img) => (
                            <motion.div
                                key={img.id || img._id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="image-card"
                            >
                                <img src={img.url} alt="Uploaded" />
                                <div className="image-info">
                                    <div className="url-box" title={img.url}>
                                        {img.url}
                                    </div>
                                    <div className="actions">
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <button
                                                className="icon-btn"
                                                onClick={() => copyToClipboard(img.url, img.id || img._id)}
                                                title="Copy URL"
                                            >
                                                {(copiedId === img.id || copiedId === img._id) ? <Check size={18} color="#10b981" /> : <Copy size={18} />}
                                            </button>
                                            <a
                                                href={img.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="icon-btn"
                                                title="Open in new tab"
                                            >
                                                <ExternalLink size={18} />
                                            </a>
                                        </div>
                                        <button
                                            className="icon-btn delete"
                                            onClick={() => handleDelete(img.id || img._id)}
                                            title="Delete Image"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {images.length === 0 && !uploading && (
                        <div style={{
                            gridColumn: '1 / -1',
                            textAlign: 'center',
                            padding: '60px',
                            border: '2px dashed var(--glass-border)',
                            borderRadius: '24px',
                            color: 'var(--text-secondary)'
                        }}>
                            <p>No images uploaded yet. Start by uploading one above!</p>
                        </div>
                    )}
                </div>
            </section>

            <footer style={{ marginTop: 'auto', padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <p>© 2026 Image Cloud. Powered by Node.js & React.</p>
            </footer>
        </div>
    );
}

export default App;
