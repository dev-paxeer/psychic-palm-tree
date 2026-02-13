import { Hono } from 'hono';
import {
  getSummary,
  listContracts,
  getContract,
  getCategories,
  getProtocols,
} from '../services/registry.service.js';

export const contractsRouter = new Hono();

/** GET /api/contracts — List contracts (paginated, filterable) */
contractsRouter.get('/', (c) => {
  const category = c.req.query('category');
  const protocol = c.req.query('protocol');
  const type = c.req.query('type');
  const search = c.req.query('search');
  const page = Number(c.req.query('page') ?? 1);
  const limit = Number(c.req.query('limit') ?? 20);

  const result = listContracts({ category, protocol, type, search, page, limit });
  return c.json(result);
});

/** GET /api/contracts/summary — Registry summary stats */
contractsRouter.get('/summary', (c) => {
  return c.json(getSummary());
});

/** GET /api/contracts/categories — List all categories */
contractsRouter.get('/categories', (c) => {
  return c.json(getCategories());
});

/** GET /api/contracts/protocols — List all protocols */
contractsRouter.get('/protocols', (c) => {
  return c.json(getProtocols());
});

/** GET /api/contracts/:id — Get contract by ID (with source code) */
contractsRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const contract = getContract(id);
  if (!contract) {
    return c.json({ error: 'Contract not found' }, 404);
  }
  return c.json(contract);
});
