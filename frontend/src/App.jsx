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

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000');

function App() {
    const [uploadMode, setUploadMode] = useState('image'); // 'image' or 'video'
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [images, setImages] = useState([]);
    const [copiedId, setCopiedId] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [filter, setFilter] = useState('all'); // 'all', 'image', 'video'
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
        processFiles(Array.from(e.target.files));
    };

    const processFiles = (files) => {
        let validFiles = [];
        const isImageMode = uploadMode === 'image';
        const typePrefix = isImageMode ? 'image/' : 'video/';
        const maxFiles = isImageMode ? 10 : 5;

        validFiles = files.filter(file => {
            if (!file.type.startsWith(typePrefix)) {
                alert(`${file.name} is not a valid ${uploadMode}.`);
                return false;
            }
            return true;
        }).slice(0, maxFiles);

        if (validFiles.length > 0) {
            setSelectedFiles(validFiles);
            setPreviews(validFiles.map(file => ({
                url: URL.createObjectURL(file),
                type: file.type
            })));
        }
    };

    const [generatedUrls, setGeneratedUrls] = useState([]);

    const handleUpload = async () => {
        if (!selectedFiles || selectedFiles.length === 0) return;

        // Vercel hard limit check (approx 4.5MB per request)
        const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
        const isVercel = window.location.hostname.includes('vercel.app');
        if (isVercel && totalSize > 4.5 * 1024 * 1024) {
            alert(`Vercel limits uploads to 4.5MB. Your current selection is ${(totalSize / (1024 * 1024)).toFixed(2)}MB. Please upload smaller files or use local hosting.`);
            return;
        }

        setUploading(true);
        const formData = new FormData();
        selectedFiles.forEach(file => {
            formData.append('images', file); // Use 'images' array field
        });

        try {
            const res = await axios.post(`${API_BASE_URL}/upload`, formData);
            const newUrls = res.data.urls || []; // Return array of URLs
            setGeneratedUrls(newUrls);

            setSelectedFiles([]);
            setPreviews([]);
            fetchImages();

            if (newUrls.length === 1) {
                navigator.clipboard.writeText(newUrls[0]);
                alert("Success! URL generated and copied to clipboard.");
            } else if (newUrls.length > 1) {
                alert(`Success! ${newUrls.length} URLs generated.`);
            }

        } catch (err) {
            console.error('Upload failed:', err);
            let errMsg = 'An unknown error occurred';
            if (err.response?.data?.error) {
                errMsg = typeof err.response.data.error === 'string' ? err.response.data.error : JSON.stringify(err.response.data.error);
            } else if (err.message) {
                errMsg = err.message;
            }
            alert('Upload failed: ' + errMsg);
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
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(Array.from(e.dataTransfer.files));
        }
    };

    const isVideoURL = (img) => {
        if (img.type === 'video') return true;
        const url = img.url.toLowerCase();
        return url.match(/\.(mp4|webm|ogg|mov)$/) || url.includes('/video/upload/') || url.includes('res.cloudinary.com') && url.includes('/video/');
    };

    const filteredImages = images.filter(img => {
        if (filter === 'all') return true;
        return img.type === filter;
    });

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
                <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '24px' }}>
                    <button
                        className="btn"
                        style={{ background: uploadMode === 'image' ? 'var(--primary)' : 'transparent', border: '1px solid var(--primary)' }}
                        onClick={() => { setUploadMode('image'); setSelectedFiles([]); setPreviews([]); }}
                    >
                        <ImageIcon size={20} /> Photos (Max 10)
                    </button>
                    <button
                        className="btn"
                        style={{ background: uploadMode === 'video' ? 'var(--primary)' : 'transparent', border: '1px solid var(--primary)' }}
                        onClick={() => { setUploadMode('video'); setSelectedFiles([]); setPreviews([]); }}
                    >
                        <Layers size={20} /> Videos (Max 5)
                    </button>
                </div>
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
                            multiple
                            accept={uploadMode === 'image' ? 'image/*' : 'video/*'}
                            onChange={handleFileChange}
                        />
                        {previews.length > 0 ? (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                {previews.map((preview, index) => (
                                    preview.type.startsWith('video/') ? (
                                        <video key={index} src={preview.url} controls style={{ maxHeight: '120px', maxWidth: '120px', borderRadius: '12px', objectFit: 'cover' }} />
                                    ) : (
                                        <img key={index} src={preview.url} alt={`Preview ${index}`} style={{ maxHeight: '120px', maxWidth: '120px', borderRadius: '12px', objectFit: 'cover' }} />
                                    )
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center' }}>
                                <motion.div
                                    animate={{ y: [0, -5, 0] }}
                                    transition={{ repeat: Infinity, duration: 2 }}
                                >
                                    <CloudUpload size={48} color="var(--primary)" />
                                </motion.div>
                                <p style={{ marginTop: '16px', fontWeight: '500' }}>
                                    Click or drag and drop {uploadMode}s here
                                </p>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                    {uploadMode === 'image' ? 'PNG, JPG up to 10MB' : 'MP4, WEBM up to 100MB'}
                                </p>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            className="btn"
                            onClick={handleUpload}
                            disabled={selectedFiles.length === 0 || uploading}
                        >
                            {uploading ? (
                                <span>Uploading...</span>
                            ) : (
                                <>
                                    <Upload size={20} />
                                    <span>Generate URL{selectedFiles.length > 1 ? 's' : ''}</span>
                                </>
                            )}
                        </button>
                        {selectedFiles.length > 0 && !uploading && (
                            <button
                                className="btn"
                                style={{ background: 'transparent', border: '1px solid var(--glass-border)' }}
                                onClick={() => { setSelectedFiles([]); setPreviews([]); }}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </div>
            </section>

            {generatedUrls.length > 0 && (
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
                            <h3 style={{ fontSize: '1.1rem', color: 'var(--accent)', fontWeight: '600' }}>{generatedUrls.length} URL{generatedUrls.length > 1 ? 's' : ''} Generated Successfully:</h3>
                        </div>
                        <button onClick={() => setGeneratedUrls([])} className="icon-btn" style={{ fontSize: '0.8rem' }}>close</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                        {generatedUrls.map((url, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <div
                                    style={{
                                        flex: 1,
                                        padding: '12px',
                                        background: 'rgba(0,0,0,0.4)',
                                        borderRadius: '8px',
                                        fontFamily: 'monospace',
                                        wordBreak: 'break-all',
                                        color: 'var(--accent)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        fontSize: '0.9rem'
                                    }}
                                >
                                    {url}
                                </div>
                                <button className="icon-btn" onClick={() => copyToClipboard(url, 'gen-' + idx)} title="Copy URL">
                                    {copiedId === 'gen-' + idx ? <Check size={18} color="#10b981" /> : <Copy size={18} />}
                                </button>
                                <a href={url} target="_blank" rel="noreferrer" className="icon-btn" title="Open in new tab">
                                    <ExternalLink size={18} />
                                </a>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            <section className="gallery-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ImageIcon size={24} color="var(--accent)" />
                        <h2 style={{ fontSize: '1.5rem', fontWeight: '600' }}>Your Gallery & History</h2>
                    </div>
                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                        {['all', 'image', 'video'].map((type) => (
                            <button
                                key={type}
                                onClick={() => setFilter(type)}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: filter === type ? 'var(--primary)' : 'transparent',
                                    color: filter === type ? 'white' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: '600',
                                    transition: 'all 0.2s',
                                    textTransform: 'capitalize'
                                }}
                            >
                                {type}s
                            </button>
                        ))}
                    </div>
                </div>

                <div className="gallery">
                    <AnimatePresence mode="popLayout">
                        {filteredImages.map((img) => (
                            <motion.div
                                key={img.id || img._id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="image-card"
                            >
                                {isVideoURL(img) ? (
                                    <video src={img.url} controls style={{ width: '100%', height: '200px', objectFit: 'cover', display: 'block' }} />
                                ) : (
                                    <img src={img.url} alt="Uploaded" />
                                )}
                                <div style={{ 
                                    position: 'absolute', 
                                    top: '12px', 
                                    left: '12px', 
                                    background: 'rgba(0,0,0,0.6)', 
                                    padding: '4px 8px', 
                                    borderRadius: '6px', 
                                    fontSize: '0.7rem', 
                                    fontWeight: '700',
                                    color: img.type === 'video' ? 'var(--accent)' : '#fff',
                                    backdropFilter: 'blur(4px)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    textTransform: 'uppercase'
                                }}>
                                    {img.type === 'video' ? 'Video' : 'Pic'}
                                </div>
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
                <p>© 2026 Image Cloud. Powered by mamitha.crushae 💖</p>
            </footer>
        </div>
    );
}

export default App;
