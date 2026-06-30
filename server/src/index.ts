import express from 'express';
import cors from 'cors';
import './db/connection.js'; // initialise DB + schema on boot
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

app.use(errorHandler);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`20FIT Shop Inventory API listening on http://localhost:${port}`);
});
