import { Hono } from 'hono';
import {
  listContracts,
  getContract,
  getContractArtifact,
  submitDeployJob,
  getDeployJob,
  getDeployHistory,
  searchContracts,
} from '../services/deploy.service.js';

const deploy = new Hono();

// ── List all deployable contracts ────────────────────────────────────
deploy.get('/contracts', (c) => {
  const contracts = listContracts().map(({ abi, ...rest }) => ({
    ...rest,
    abiItemCount: abi.length,
  }));
  return c.json({ contracts, count: contracts.length });
});

// ── Search contracts ─────────────────────────────────────────────────
deploy.get('/contracts/search', (c) => {
  const q = c.req.query('q') || '';
  if (!q) return c.json({ error: 'Missing ?q= parameter' }, 400);
  const results = searchContracts(q).map(({ abi, ...rest }) => ({
    ...rest,
    abiItemCount: abi.length,
  }));
  return c.json({ results, count: results.length });
});

// ── Get single contract details (with full ABI) ─────────────────────
deploy.get('/contracts/:id', (c) => {
  const id = c.req.param('id');
  const meta = getContract(id);
  if (!meta) return c.json({ error: 'Contract not found' }, 404);
  return c.json(meta);
});

// ── Get contract artifact (ABI + bytecode) ───────────────────────────
deploy.get('/contracts/:id/artifact', (c) => {
  const id = c.req.param('id');
  const artifact = getContractArtifact(id);
  if (!artifact) return c.json({ error: 'Artifact not found' }, 404);
  return c.json(artifact);
});

// ── Submit a deployment job ──────────────────────────────────────────
deploy.post('/submit', async (c) => {
  try {
    const body = await c.req.json();
    const { contractId, constructorArgs, ownerAddress } = body;

    if (!contractId) return c.json({ error: 'Missing contractId' }, 400);
    if (!ownerAddress) return c.json({ error: 'Missing ownerAddress' }, 400);
    if (!Array.isArray(constructorArgs)) return c.json({ error: 'constructorArgs must be an array' }, 400);

    // Validate contract exists
    const meta = getContract(contractId);
    if (!meta) return c.json({ error: `Unknown contract: ${contractId}` }, 404);

    // Validate constructor args count
    if (constructorArgs.length !== meta.constructorParams.length) {
      return c.json({
        error: `Expected ${meta.constructorParams.length} constructor args, got ${constructorArgs.length}`,
        expected: meta.constructorParams.map(p => `${p.name} (${p.type})`),
      }, 400);
    }

    const job = await submitDeployJob(contractId, constructorArgs, ownerAddress);
    return c.json({
      jobId: job.id,
      status: job.status,
      contractName: job.contractName,
      message: `Deployment job queued. Poll /api/deploy/status/${job.id} for updates.`,
    }, 202);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ── Check job status ─────────────────────────────────────────────────
deploy.get('/status/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  const job = await getDeployJob(jobId);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json(job);
});

// ── Deployment history ───────────────────────────────────────────────
deploy.get('/history', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const history = await getDeployHistory(limit);
  return c.json({ deployments: history, count: history.length });
});

export default deploy;
