import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { connectDatabase, getDatabaseStatus } from './src/server/config/db';

import authRoutes from './src/server/routes/auth';
import dashboardRoutes from './src/server/routes/dashboard';
import warehouseRoutes from './src/server/routes/warehouses';
import categoryRoutes from './src/server/routes/categories';
import productRoutes from './src/server/routes/products';
import inventoryRoutes from './src/server/routes/inventory';
import stockInRoutes from './src/server/routes/stockIn';
import stockOutRoutes from './src/server/routes/stockOut';
import transferRoutes from './src/server/routes/transfers';
import adjustmentRoutes from './src/server/routes/adjustments';
import stockCountRoutes from './src/server/routes/stockCounts';
import supplierRoutes from './src/server/routes/suppliers';
import employeeRoutes from './src/server/routes/employees';
import userRoutes from './src/server/routes/users';
import reportRoutes from './src/server/routes/reports';
import notificationRoutes from './src/server/routes/notifications';
import auditLogRoutes from './src/server/routes/auditLogs';
import settingsRoutes from './src/server/routes/settings';
import miscRoutes from './src/server/routes/misc';

async function startServer() {
  await connectDatabase();

  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false,
    })
  );

  const allowedOrigins = [
    process.env.CLIENT_URL?.trim(),
    process.env.APP_URL?.trim(),
    'http://localhost:3000',
  ].filter(Boolean) as string[];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || !isProd) {
          return callback(null, true);
        }
        return callback(new Error('CORS origin not allowed'));
      },
      credentials: false,
    })
  );

  app.use(express.json({ limit: '2mb' }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 80,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again shortly.' },
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/auth', authLimiter);
  app.use('/api', apiLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      company: 'KHAYRE CONSTRUCTION AND MATERIALS COMPANY',
      database: getDatabaseStatus(),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/warehouses', warehouseRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/stock-in', stockInRoutes);
  app.use('/api/stock-out', stockOutRoutes);
  app.use('/api/transfers', transferRoutes);
  app.use('/api/adjustments', adjustmentRoutes);
  app.use('/api/stock-counts', stockCountRoutes);
  app.use('/api/suppliers', supplierRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/audit-logs', auditLogRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api', miscRoutes);

  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

  // JSON 404 for unmatched API paths
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Global error handler
  app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.statusCode || 500;
    if (status >= 500) {
      console.error('[Server Error]', err);
    }
    res.status(status).json({
      error: status >= 500 && isProd ? 'Internal server error' : err.message || 'Request failed',
    });
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`[WMS Server] KHAYRE CONSTRUCTION WMS listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start WMS server:', err);
  process.exit(1);
});
