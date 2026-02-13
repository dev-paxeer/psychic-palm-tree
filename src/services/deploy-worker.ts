import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { popNextJob, getDeployJob, updateDeployJob, getDeployerDir } from './deploy.service.js';

const POLL_INTERVAL_MS = 2_000;
let running = false;

/**
 * Start the deploy worker loop. Polls Redis queue for jobs
 * and spawns `npx hardhat run scripts/deploy-contract.js --network paxeer-network`
 * with environment variables for CONTRACT_NAME, CONSTRUCTOR_ARGS, etc.
 */
export function startDeployWorker(): void {
  if (running) return;
  running = true;
  console.log('[deploy-worker] Started');
  pollLoop();
}

export function stopDeployWorker(): void {
  running = false;
  console.log('[deploy-worker] Stopped');
}

async function pollLoop(): Promise<void> {
  while (running) {
    try {
      const jobId = await popNextJob();
      if (jobId) {
        await processJob(jobId);
      } else {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (err) {
      console.error('[deploy-worker] Poll error:', err);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

async function processJob(jobId: string): Promise<void> {
  const job = await getDeployJob(jobId);
  if (!job) {
    console.warn(`[deploy-worker] Job ${jobId} not found, skipping`);
    return;
  }

  console.log(`[deploy-worker] Processing job ${job.id}: ${job.contractName}`);

  // Update status to deploying
  job.status = 'deploying';
  await updateDeployJob(job);

  const deployerDir = getDeployerDir();
  const outputFile = join(deployerDir, `tmp-result-${job.id}.json`);

  // Build env vars for the deploy script
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    CONTRACT_NAME: job.contractName,
    SOURCE_FILE: job.sourceFile,
    CONSTRUCTOR_ARGS: JSON.stringify(job.constructorArgs),
    OWNER_ADDRESS: job.ownerAddress,
    JOB_ID: job.id,
    OUTPUT_FILE: outputFile,
  };

  // Copy DEPLOYER_PRIVATE_KEY from parent env
  if (process.env.DEPLOYER_PRIVATE_KEY) {
    env.DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
    env.PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
  }

  try {
    const result = await runHardhatDeploy(deployerDir, env);

    // Try to read the output file
    if (existsSync(outputFile)) {
      try {
        const data = JSON.parse(readFileSync(outputFile, 'utf-8'));
        if (data.status === 'complete' && data.address) {
          job.status = 'complete';
          job.contractAddress = data.address;
          job.txHash = data.txHash;
          job.explorerUrl = data.explorerUrl;
          job.abi = data.abi;
          (job as any).verified = data.verified || false;
        } else if (data.status === 'failed') {
          job.status = 'failed';
          job.error = data.error || 'Deployment failed';
        } else {
          job.status = 'failed';
          job.error = 'Unexpected result format';
        }
      } catch (parseErr: any) {
        job.status = 'failed';
        job.error = `Failed to parse deploy result: ${parseErr.message}`;
      }
      // Clean up temp file
      try { unlinkSync(outputFile); } catch {}
    } else {
      // Try parsing from stdout
      const match = result.stdout.match(/__DEPLOY_RESULT__(.*?)__END_RESULT__/);
      if (match) {
        const data = JSON.parse(match[1]);
        if (data.address) {
          job.status = 'complete';
          job.contractAddress = data.address;
          job.txHash = data.txHash;
          job.explorerUrl = data.explorerUrl;
          job.abi = data.abi;
          (job as any).verified = data.verified || false;
        } else {
          job.status = 'failed';
          job.error = data.error || 'No address in result';
        }
      } else {
        job.status = 'failed';
        job.error = result.stderr || 'No output from deploy script';
      }
    }
  } catch (err: any) {
    job.status = 'failed';
    job.error = err.message || 'Spawn error';
  }

  await updateDeployJob(job);
  console.log(`[deploy-worker] Job ${job.id} ${job.status}: ${job.contractAddress || job.error}`);
}

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runHardhatDeploy(cwd: string, env: Record<string, string>): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [
      'scripts/deploy-contract.js'
    ], {
      cwd,
      env,
      shell: false,
      timeout: 180_000, // 3 min timeout (deploy + verification polling)
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      const s = data.toString();
      stdout += s;
      // Stream deploy output to server console
      process.stdout.write(`[deploy] ${s}`);
    });

    child.stderr.on('data', (data: Buffer) => {
      const s = data.toString();
      stderr += s;
      process.stderr.write(`[deploy-err] ${s}`);
    });

    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
