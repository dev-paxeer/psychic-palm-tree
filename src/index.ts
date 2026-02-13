import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config, chain } from './config.js';
import { contractsRouter } from './routes/contracts.js';
import { networkRouter, rpcRouter } from './routes/network.js';
import { scaffoldRouter } from './routes/scaffold.js';
import deployRouter from './routes/deploy.js';
import { rateLimit } from './middleware/rateLimit.js';
import { redisRateLimit } from './middleware/redisRateLimit.js';
import { getRedis, closeRedis } from './services/redis.service.js';
import { closeDb } from './db/index.js';
import { startDeployWorker, stopDeployWorker } from './services/deploy-worker.js';

const app = new Hono();

// ── Global middleware ────────────────────────────────────────────────
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: config.cors.origin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);

// Rate limiting — use Redis if available, else in-memory fallback
if (config.redisUrl) {
  app.use('/api/*', redisRateLimit({ windowSec: 60, max: 200 }));
  app.use('/api/rpc/*', redisRateLimit({ windowSec: 60, max: 60 }));
  app.use('/api/scaffold/generate', redisRateLimit({ windowSec: 60, max: 10 }));
} else {
  app.use('/api/*', rateLimit({ windowMs: 60_000, max: 200 }));
  app.use('/api/rpc/*', rateLimit({ windowMs: 60_000, max: 60 }));
  app.use('/api/scaffold/generate', rateLimit({ windowMs: 60_000, max: 10 }));
}

// ── Routes ───────────────────────────────────────────────────────────
app.route('/api/contracts', contractsRouter);
app.route('/api/network', networkRouter);
app.route('/api/rpc', rpcRouter);
app.route('/api/scaffold', scaffoldRouter);
app.route('/api/deploy', deployRouter);

// ── Static HTML pages ────────────────────────────────────────────
app.get('/test', async (c) => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const html = fs.readFileSync(path.resolve(process.cwd(), 'public/test.html'), 'utf-8');
  return c.html(html);
});
app.get('/deploy', async (c) => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const html = fs.readFileSync(path.resolve(process.cwd(), 'public/deploy.html'), 'utf-8');
  return c.html(html);
});

// ── Root info endpoint ───────────────────────────────────────────────
app.get('/', (c) => {
  return c.json({
    name: 'Paxeer Dev Portal API',
    version: '0.1.0',
    network: chain.name,
    chainId: chain.evmChainId,
    endpoints: {
      contracts: '/api/contracts',
      network: '/api/network',
      rpc: '/api/rpc',
      deploy: '/api/deploy',
      scaffold: '/api/scaffold',
    },
    docs: chain.docs,
  });
});

// ── Health endpoint ──────────────────────────────────────────────────
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Start server ─────────────────────────────────────────────────────
async function start() {
  // Warm up Redis connection if configured
  if (config.redisUrl) {
    try {
      await getRedis();
    } catch (err) {
      console.warn('⚠ Redis connection failed, using in-memory rate limiting:', err);
    }
  }

  console.log(`
  ╔══════════════════════════════════════════════╗
  ║        Paxeer Dev Portal API Server          ║
  ╠══════════════════════════════════════════════╣
  ║  Port:     ${String(config.port).padEnd(33)}║
  ║  Network:  ${chain.name.padEnd(33)}║
  ║  ChainID:  ${String(chain.evmChainId).padEnd(33)}║
  ║  Postgres: ${config.databaseUrl ? '✓ connected'.padEnd(33) : '✗ not configured'.padEnd(33)}║
  ║  Redis:    ${config.redisUrl ? '✓ connected'.padEnd(33) : '✗ not configured'.padEnd(33)}║
  ║  S3:       ${config.s3.bucket ? '✓ configured'.padEnd(33) : '✗ not configured'.padEnd(33)}║
  ╚══════════════════════════════════════════════╝
  `);

  // Start deploy worker if Redis + DEPLOYER_PRIVATE_KEY are available
  if (config.redisUrl && process.env.DEPLOYER_PRIVATE_KEY) {
    startDeployWorker();
    console.log('  Deploy worker: ✓ running');
  } else {
    console.log('  Deploy worker: ✗ (need REDIS_URL + DEPLOYER_PRIVATE_KEY)');
  }

  serve({
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  stopDeployWorker();
  await closeRedis();
  await closeDb();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  stopDeployWorker();
  await closeRedis();
  await closeDb();
  process.exit(0);
});

start();

export default app;
