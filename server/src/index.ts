import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import cors from 'cors';
import './db/connection.js'; // initialise DB + schema on boot
import { seedIfEmpty } from './db/seed.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.routes.js';
import { catalogRouter } from './routes/catalog.routes.js';
import { productsRouter } from './routes/products.routes.js';
import { movementsRouter } from './routes/movements.routes.js';
import { poRouter } from './routes/purchaseOrders.routes.js';
import { transfersRouter } from './routes/transfers.routes.js';
import { adjustmentsRouter } from './routes/adjustments.routes.js';
import { opnameRouter } from './routes/opname.routes.js';
import { reportsRouter } from './routes/reports.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { auditRouter } from './routes/audit.routes.js';

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
  }),
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: '20fit-shop-inventory', time: new Date().toISOString() });
});

// All business routes are namespaced under /api.
app.use('/api/auth', authRouter);
app.use('/api', catalogRouter);
app.use('/api', productsRouter);
app.use('/api', movementsRouter);
app.use('/api', poRouter);
app.use('/api', transfersRouter);
app.use('/api', adjustmentsRouter);
app.use('/api', opnameRouter);
app.use('/api', reportsRouter);
app.use('/api', dashboardRouter);
app.use('/api', usersRouter);
app.use('/api', auditRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Endpoint not found' } });
});

// ---------------------------------------------------------------------------
// Serve the built web frontend (single-service deployment, e.g. Railway).
// In production the compiled server lives at server/dist/index.js and the web
// bundle at web/dist, so it resolves to ../../web/dist. When the bundle is not
// present (pure-API dev, where Vite serves the UI on :5173) this is skipped.
// ---------------------------------------------------------------------------
const webDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  // SPA fallback: any non-API route returns index.html so client-side routing works.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(resolve(webDist, 'index.html'));
  });
  console.log(`Serving web frontend from ${webDist}`);
} else {
  console.log('Web bundle not found — running API only (run the Vite dev server for the UI).');
}

app.use(errorHandler);

// On a fresh/empty database (e.g. Railway's ephemeral disk), populate demo
// accounts and sample stock so the deployment is immediately usable.
try {
  if (seedIfEmpty()) console.log('Database was empty — seeded demo data.');
} catch (err) {
  console.error('Auto-seed on boot failed:', err);
}

const port = Number(process.env.PORT) || 4000;
app.listen(port, '0.0.0.0', () => {
  console.log(`20FIT Shop Inventory listening on port ${port}`);
});
