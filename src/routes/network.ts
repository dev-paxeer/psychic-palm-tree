import { Hono } from 'hono';
import {
  getNetworkInfo,
  getNetworkStats,
  getHealthCheck,
  proxyRpcCall,
  ALLOWED_RPC_METHODS,
  RPC_METHOD_DOCS,
} from '../services/chain.service.js';

export const networkRouter = new Hono();

/** GET /api/network/info — Static chain configuration */
networkRouter.get('/info', async (c) => {
  const info = await getNetworkInfo();
  return c.json(info);
});

/** GET /api/network/stats — Live chain stats */
networkRouter.get('/stats', async (c) => {
  const stats = await getNetworkStats();
  return c.json(stats);
});

/** GET /api/network/health — RPC health check */
networkRouter.get('/health', async (c) => {
  const health = await getHealthCheck();
  const status = health.healthy ? 200 : 503;
  return c.json(health, status);
});

export const rpcRouter = new Hono();

/** POST /api/rpc — JSON-RPC proxy (allowlisted methods) */
rpcRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<{ method?: string; params?: unknown[] }>();
    if (!body.method) {
      return c.json({ error: { code: -32600, message: 'Missing "method" field' } }, 400);
    }
    const result = await proxyRpcCall(body.method, body.params ?? []);
    return c.json(result);
  } catch {
    return c.json({ error: { code: -32700, message: 'Parse error' } }, 400);
  }
});

/** GET /api/rpc/methods — List available RPC methods with docs */
rpcRouter.get('/methods', (c) => {
  const methods = ALLOWED_RPC_METHODS.map((method) => ({
    method,
    ...(RPC_METHOD_DOCS[method] ?? { description: '', params: '', example: [] }),
  }));
  return c.json({ total: methods.length, methods });
});
