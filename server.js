import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

// 1. API 代理 (Forward /api/dashscope to Aliyun)
app.use(
  '/api/dashscope',
  createProxyMiddleware({
    target: 'https://dashscope.aliyuncs.com',
    changeOrigin: true,
    pathRewrite: {
      '^/api/dashscope': '', // Strip the prefix
    },
    onProxyReq: (proxyReq, req, res) => {
        // Optional: Log proxy requests for debugging
        // console.log(`[Proxy] ${req.method} ${req.path} -> https://dashscope.aliyuncs.com`);
    },
    onError: (err, req, res) => {
        console.error('[Proxy Error]', err);
        res.status(500).send('Proxy Error');
    }
  })
);

// 2. 托管静态文件 (Serve the built React app)
app.use(express.static(path.join(__dirname, 'dist')));

// 3. SPA 回退 (Handle client-side routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`==================================`);
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`==================================`);
});
