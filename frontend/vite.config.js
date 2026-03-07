import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000, // Matching standard React dev server port
        proxy: {
            //   '/upload': 'http://localhost:5000',
            //   '/images': 'http://localhost:5000',
            //   '/image': 'http://localhost:5000'
        }
    }
})
