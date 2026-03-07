# ☁️ Image Cloud - Premium Image Hosting

A sleek, modern application to upload images and get instant publicly accessible URLs.

## ✨ Features
- **Modern UI**: Glassmorphism design with a premium feel.
- **Drag & Drop**: Seamless image uploading experience.
- **Gallery**: View and manage all your uploaded images.
- **Clipboard Integration**: Copy URLs with a single click.
- **Delete Support**: Remove images from Cloudinary and MongoDB easily.

## 🛠️ Stack
- **Frontend**: React + Vite + Framer Motion
- **Backend**: Node.js + Express
- **Database**: MySQL (using Sequelize ORM)
- **Storage**: Cloudinary (for production scalability)

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) installed
- [MySQL Server](https://dev.mysql.com/downloads/installer/) installed and running
- A [Cloudinary](https://cloudinary.com/) account for storage keys

### 2. Backend Setup
1. Open a terminal in the `backend` folder.
2. Open `.env` and fill in your keys and DB credentials:
   ```env
   CLOUDINARY_CLOUD_NAME=your_name
   CLOUDINARY_API_KEY=your_key
   CLOUDINARY_API_SECRET=your_secret
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=image2url
   ```
3. Run `node server.js` or `npm start`.

### 3. Frontend Setup
1. Open a terminal in the `frontend` folder.
2. Start the dev server: `npm run dev`.
3. Open `http://localhost:3000` in your browser.

## 📂 Project Structure
- **/frontend**: React application with Vite.
- **/backend**: Express server with MongoDB and Cloudinary integration.
