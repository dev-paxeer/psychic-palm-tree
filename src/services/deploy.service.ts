import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getRedis } from './redis.service.js';

// ═══════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════

export type DeployStatus = 'queued' | 'compiling' | 'deploying' | 'verifying' | 'complete' | 'failed';

export interface ConstructorParam {
  name: string;
  type: string;        // solidity type from ABI
  label: string;       // human-friendly label
  description: string;
  placeholder?: string;
  isAddress?: boolean;  // true if type is address
}

export interface ContractMeta {
  id: string;
  contractName: string;
  sourceFile: string;
  description: string;
  category: 'token' | 'stablecoin' | 'oracle' | 'defi' | 'perps' | 'stocks' | 'utility';
  constructorParams: ConstructorParam[];
  dependencies: string[];   // contract IDs that should be deployed first
  postDeploySetup: string[];  // functions to call after deploy
  abi: any[];
  bytecodeSize: number;
}

export interface DeployJob {
  id: string;
  contractId: string;
  contractName: string;
  sourceFile: string;
  constructorArgs: string[];   // raw string values
  ownerAddress: string;
  status: DeployStatus;
  contractAddress?: string;
  txHash?: string;
  explorerUrl?: string;
  verified?: boolean;
  abi?: any[];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  PATHS
// ═══════════════════════════════════════════════════════════════════════

const DEPLOYER_DIR = resolve(process.cwd(), 'deployer');
const ARTIFACTS_DIR = resolve(DEPLOYER_DIR, '__COMPILED-ARTIFACTS__', 'contracts');

// ═══════════════════════════════════════════════════════════════════════
//  CONTRACT METADATA REGISTRY
//  Hand-curated metadata for each pre-compiled contract.
//  Constructor params extracted from ABI, descriptions from source.
// ═══════════════════════════════════════════════════════════════════════

const CONTRACT_REGISTRY: ContractMeta[] = [
  // ── TOKENS ────────────────────────────────────────────────────────
  {
    id: 'chain-usd',
    contractName: 'ChainUSD',
    sourceFile: 'ChainUSD.sol',
    description: 'Native stablecoin for HyperPaxeer. ERC20 with burn, permit, and owner-only minting. 18 decimals.',
    category: 'stablecoin',
    constructorParams: [],
    dependencies: [],
    postDeploySetup: [],
    abi: [],
    bytecodeSize: 0,
  },
  {
    id: 'simple-token',
    contractName: 'SimpleToken',
    sourceFile: 'ERC-20.sol',
    description: 'Basic ERC20 token. Constructor mints initialSupply * 1e18 to deployer. Simplest token deployment.',
    category: 'token',
    constructorParams: [
      { name: 'name', type: 'string', label: 'Token Name', description: 'Full name of the token', placeholder: 'My Token' },
      { name: 'symbol', type: 'string', label: 'Token Symbol', description: 'Ticker symbol (3-5 chars)', placeholder: 'MTK' },
      { name: 'initialSupply', type: 'uint256', label: 'Initial Supply', description: 'Number of tokens (whole units, 18 decimals added automatically)', placeholder: '1000000' },
    ],
    dependencies: [],
    postDeploySetup: [],
    abi: [],
    bytecodeSize: 0,
  },
  {
    id: 'usdc',
    contractName: 'USDC',
    sourceFile: 'usdc.sol',
    description: 'USDC stablecoin with bridge support, ERC1363, burnable, flashmint, and permit. 6 decimals. Mints 500M on chain 229.',
    category: 'stablecoin',
    constructorParams: [
      { name: 'tokenBridge_', type: 'address', label: 'Token Bridge', description: 'Address of the token bridge contract', placeholder: '0x...', isAddress: true },
      { name: 'recipient', type: 'address', label: 'Recipient', description: 'Address to receive initial mint', placeholder: '0x...', isAddress: true },
    ],
    dependencies: [],
    postDeploySetup: [],
    abi: [],
    bytecodeSize: 0,
  },
  {
    id: 'usdt',
    contractName: 'TetherUSD',
    sourceFile: 'usdt.sol',
    description: 'Tether USD stablecoin with bridge support, ERC1363, burnable, flashmint, and permit. 6 decimals.',
    category: 'stablecoin',
    constructorParams: [
      { name: 'tokenBridge_', type: 'address', label: 'Token Bridge', description: 'Address of the token bridge contract', placeholder: '0x...', isAddress: true },
      { name: 'recipient', type: 'address', label: 'Recipient', description: 'Address to receive initial mint', placeholder: '0x...', isAddress: true },
    ],
    dependencies: [],
    postDeploySetup: [],
    abi: [],
    bytecodeSize: 0,
  },

  // ── ORACLES ───────────────────────────────────────────────────────
  {
    id: 'price-oracle',
    contractName: 'PriceOracle',
    sourceFile: 'PriceOracle.sol',
    description: 'Token price oracle. Owner sets USD prices (18 decimals) per token address. Used by MultiAssetVault.',
    category: 'oracle',
    constructorParams: [],
    dependencies: [],
    postDeploySetup: ['updatePrice(address,uint256)', 'updatePrices(address[],uint256[])'],
    abi: [],
    bytecodeSize: 0,
  },
  {
    id: 'fx-price-oracle',
    contractName: 'FxPriceOracle',
    sourceFile: 'FxPriceOracle.sol',
    description: 'FX/commodity price oracle. Owner sets USD prices (18 decimals) per bytes32 market ID (e.g. keccak256("EUR/USD")). Used by FxVault.',
    category: 'oracle',
    constructorParams: [],
    dependencies: [],
    postDeploySetup: ['updatePrice(bytes32,uint256)', 'updatePrices(bytes32[],uint256[])'],
    abi: [],
    bytecodeSize: 0,
  },
  {
    id: 'perp-oracle',
    contractName: 'PerpOracle',
    sourceFile: 'PerpOracle.sol',
    description: 'Perpetual futures oracle. Stores mark/index prices, funding rates per perp market. Used by PerpMarketManager.',
    category: 'oracle',
    constructorParams: [],
    dependencies: [],
    postDeploySetup: ['updatePerpMarket(...)'],
    abi: [],
    bytecodeSize: 0,
  },
  {
    id: 'stock-price-oracle',
    contractName: 'StockPriceOracle',
    sourceFile: 'StockPriceOracle.sol',
    description: 'Stock/equity price oracle. Owner sets USD prices (18 decimals) per token address. Used by StockVault.',
    category: 'oracle',
    constructorParams: [],
    dependencies: [],
    postDeploySetup: ['updatePrice(address,uint256)'],
    abi: [],
    bytecodeSize: 0,
  },

  // ── DEFI ──────────────────────────────────────────────────────────
  {
    id: 'hybrid-dex',
    contractName: 'HybridDEX',
    sourceFile: 'HybridDEX.sol',
    description: 'Hybrid AMM + Order Book DEX for USDC/PAX trading. Constant product AMM with central limit order book, LP positions, maker/taker fees.',
    category: 'defi',
    constructorParams: [
      { name: '_usdc', type: 'address', label: 'USDC Address', description: 'Deployed USDC token contract address', placeholder: '0x...', isAddress: true },
      { name: '_feeCollector', type: 'address', label: 'Fee Collector', description: 'Address that collects trading fees', placeholder: '0x...', isAddress: true },
    ],
    dependencies: ['usdc'],
    postDeploySetup: ['addLiquidity (requires USDC approval + PAX)'],
    abi: [],
    bytecodeSize: 0,
  },
  {
    id: 'multi-asset-vault',
    contractName: 'MultiAssetVault',
    sourceFile: 'MultiAssetVault.sol',
    description: 'Multi-token vault with oracle-priced swaps. Register tokens, deposit, swap at oracle prices with 10% tolerance. No fees, no price impact.',
    category: 'defi',
    constructorParams: [
      { name: '_priceOracle', type: 'address', label: 'Price Oracle', description: 'Deployed PriceOracle contract address', placeholder: '0x...', isAddress: true },
      { name: '_usdc', type: 'address', label: 'USDC Address', description: 'Deployed USDC token contract address', placeholder: '0x...', isAddress: true },
    ],
    dependencies: ['price-oracle', 'usdc'],
    postDeploySetup: ['registerToken(address) for each supported token', 'deposit(address,uint256) to seed liquidity'],
    abi: [],
    bytecodeSize: 0,
  },

  // ── FX TRADING ────────────────────────────────────────────────────
  {
    id: 'fx-position-token',
    contractName: 'FxPositionToken',
    sourceFile: 'FxPositionToken.sol',
    description: 'Non-transferable ERC20 representing leveraged FX/commodity exposure. Only vault can mint/burn. One per market per side (long/short).',
    category: 'defi',
    constructorParams: [
      { name: 'name_', type: 'string', label: 'Token Name', description: 'e.g. "EUR/USD Long"', placeholder: 'EUR/USD Long' },
      { name: 'symbol_', type: 'string', label: 'Token Symbol', description: 'e.g. "fxEURLONG"', placeholder: 'fxEURLONG' },
      { name: 'initialVault', type: 'address', label: 'Vault Address', description: 'FxVault contract address (can be updated later)', placeholder: '0x...', isAddress: true },
    ],
    dependencies: ['fx-vault'],
    postDeploySetup: [],
    abi: [],
    bytecodeSize: 0,
  },
  {
    id: 'fx-vault',
    contractName: 'FxVault',
    sourceFile: 'FxVault.sol',
    description: 'Leveraged FX/commodity trading vault. Supports up to 1000x leverage, collateral management, pre-signed close orders, long/short positions with PnL settlement.',
    category: 'defi',
    constructorParams: [
      { name: '_priceOracle', type: 'address', label: 'FX Price Oracle', description: 'Deployed FxPriceOracle contract address', placeholder: '0x...', isAddress: true },
    ],
    dependencies: ['fx-price-oracle'],
    postDeploySetup: [
      'registerCollateralToken(address) for each stablecoin',
      'registerMarket(bytes32,address,address,uint256,uint256,uint256,uint256) for each FX pair',
      'Deploy FxPositionToken pairs (long+short) per market, then call setVault()',
    ],
    abi: [],
    bytecodeSize: 0,
  },

  // ── PERPETUAL FUTURES ─────────────────────────────────────────────
  {
    id: 'perp-market-manager',
    contractName: 'PerpMarketManager',
    sourceFile: 'PerpMarketManager.sol',
    description: 'Perpetual futures market manager. Collateral deposits, leveraged long/short positions, PnL tracking, liquidation detection, force-close by owner.',
    category: 'perps',
    constructorParams: [
      { name: '_collateralToken', type: 'address', label: 'Collateral Token', description: 'ERC20 token used as collateral (e.g. USDC)', placeholder: '0x...', isAddress: true },
      { name: '_perpOracle', type: 'address', label: 'Perp Oracle', description: 'Deployed PerpOracle contract address', placeholder: '0x...', isAddress: true },
    ],
    dependencies: ['perp-oracle', 'usdc'],
    postDeploySetup: ['configureMarket(address,bool,uint256,uint256,uint256,uint256,uint256,uint256) for each perp market'],
    abi: [],
    bytecodeSize: 0,
  },

  // ── TOKENIZED STOCKS ──────────────────────────────────────────────
  {
    id: 'tokenized-stock',
    contractName: 'TokenizedStock',
    sourceFile: 'TokenizedStock.sol',
    description: 'Tokenized stock/equity. Non-transferable initially, vault-minted. Supports one-time bootstrap mint of 1 token. Owner can change vault.',
    category: 'stocks',
    constructorParams: [
      { name: 'name_', type: 'string', label: 'Stock Name', description: 'e.g. "Tokenized Apple"', placeholder: 'Tokenized Apple' },
      { name: 'symbol_', type: 'string', label: 'Stock Symbol', description: 'e.g. "tAAPL"', placeholder: 'tAAPL' },
      { name: 'initialVault', type: 'address', label: 'Vault Address', description: 'StockVault contract address', placeholder: '0x...', isAddress: true },
    ],
    dependencies: ['stock-vault'],
    postDeploySetup: ['bootstrapMint(address) — one-time 1 token mint'],
    abi: [],
    bytecodeSize: 0,
  },
  {
    id: 'stock-vault',
    contractName: 'StockVault',
    sourceFile: 'StockVault.sol',
    description: 'Tokenized stock trading vault. Buy/sell tokenized stocks with stablecoins at oracle prices. Supports CUSD, USDC, USDT as payment.',
    category: 'stocks',
    constructorParams: [
      { name: '_priceOracle', type: 'address', label: 'Stock Price Oracle', description: 'Deployed StockPriceOracle contract address', placeholder: '0x...', isAddress: true },
      { name: '_cusd', type: 'address', label: 'ChainUSD Address', description: 'Deployed ChainUSD contract address', placeholder: '0x...', isAddress: true },
      { name: '_usdc', type: 'address', label: 'USDC Address', description: 'Deployed USDC contract address', placeholder: '0x...', isAddress: true },
      { name: '_usdt', type: 'address', label: 'USDT Address', description: 'Deployed USDT contract address', placeholder: '0x...', isAddress: true },
    ],
    dependencies: ['stock-price-oracle', 'chain-usd', 'usdc', 'usdt'],
    postDeploySetup: [
      'registerStock(address) for each TokenizedStock',
      'Deposit stablecoins for liquidity',
    ],
    abi: [],
    bytecodeSize: 0,
  },
];

// ═══════════════════════════════════════════════════════════════════════
//  INITIALIZATION — load ABI + bytecode size from artifacts
// ═══════════════════════════════════════════════════════════════════════

let initialized = false;

function loadArtifacts(): void {
  if (initialized) return;
  for (const meta of CONTRACT_REGISTRY) {
    const artifactPath = join(ARTIFACTS_DIR, meta.sourceFile, `${meta.contractName}.json`);
    if (existsSync(artifactPath)) {
      try {
        const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));
        meta.abi = artifact.abi || [];
        meta.bytecodeSize = artifact.bytecode ? Math.floor(artifact.bytecode.length / 2) : 0;
      } catch (e) {
        console.warn(`[deploy] Failed to load artifact for ${meta.contractName}:`, e);
      }
    } else {
      console.warn(`[deploy] Artifact not found: ${artifactPath}`);
    }
  }
  initialized = true;
  console.log(`[deploy] Loaded ${CONTRACT_REGISTRY.filter(c => c.abi.length > 0).length}/${CONTRACT_REGISTRY.length} contract artifacts`);
}

// ═══════════════════════════════════════════════════════════════════════
//  PUBLIC API — querying contracts
// ═══════════════════════════════════════════════════════════════════════

export function listContracts(): ContractMeta[] {
  loadArtifacts();
  return CONTRACT_REGISTRY;
}

export function getContract(id: string): ContractMeta | undefined {
  loadArtifacts();
  return CONTRACT_REGISTRY.find(c => c.id === id);
}

export function getContractArtifact(id: string): { abi: any[]; bytecode: string } | null {
  loadArtifacts();
  const meta = CONTRACT_REGISTRY.find(c => c.id === id);
  if (!meta) return null;
  const artifactPath = join(ARTIFACTS_DIR, meta.sourceFile, `${meta.contractName}.json`);
  if (!existsSync(artifactPath)) return null;
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));
  return { abi: artifact.abi, bytecode: artifact.bytecode };
}

export function searchContracts(query: string): ContractMeta[] {
  loadArtifacts();
  const q = query.toLowerCase();
  return CONTRACT_REGISTRY.filter(c =>
    c.contractName.toLowerCase().includes(q) ||
    c.description.toLowerCase().includes(q) ||
    c.category.includes(q) ||
    c.id.includes(q)
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  JOB QUEUE — Redis-backed deployment job management
// ═══════════════════════════════════════════════════════════════════════

const QUEUE_KEY = 'deploy:jobs';
const JOB_PREFIX = 'deploy:job:';
const HISTORY_KEY = 'deploy:history';

export async function submitDeployJob(
  contractId: string,
  constructorArgs: string[],
  ownerAddress: string,
): Promise<DeployJob> {
  loadArtifacts();
  const meta = CONTRACT_REGISTRY.find(c => c.id === contractId);
  if (!meta) throw new Error(`Unknown contract: ${contractId}`);
  if (meta.abi.length === 0) throw new Error(`No compiled artifact for: ${meta.contractName}`);

  const job: DeployJob = {
    id: randomUUID(),
    contractId,
    contractName: meta.contractName,
    sourceFile: meta.sourceFile,
    constructorArgs,
    ownerAddress,
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const redis = await getRedis();
  await redis.set(JOB_PREFIX + job.id, JSON.stringify(job));
  await redis.lPush(QUEUE_KEY, job.id);

  console.log(`[deploy] Job ${job.id} queued: ${meta.contractName}`);
  return job;
}

export async function getDeployJob(jobId: string): Promise<DeployJob | null> {
  const redis = await getRedis();
  const raw = await redis.get(JOB_PREFIX + jobId);
  return raw ? JSON.parse(raw) : null;
}

export async function updateDeployJob(job: DeployJob): Promise<void> {
  job.updatedAt = Date.now();
  const redis = await getRedis();
  await redis.set(JOB_PREFIX + job.id, JSON.stringify(job));

  // If terminal state, add to history
  if (job.status === 'complete' || job.status === 'failed') {
    await redis.lPush(HISTORY_KEY, JSON.stringify({
      id: job.id,
      contractId: job.contractId,
      contractName: job.contractName,
      status: job.status,
      contractAddress: job.contractAddress,
      txHash: job.txHash,
      explorerUrl: job.explorerUrl,
      ownerAddress: job.ownerAddress,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: Date.now(),
    }));
  }
}

export async function popNextJob(): Promise<string | null> {
  const redis = await getRedis();
  return redis.rPop(QUEUE_KEY);
}

export async function getDeployHistory(limit = 50): Promise<any[]> {
  const redis = await getRedis();
  const items = await redis.lRange(HISTORY_KEY, 0, limit - 1);
  return items.map(i => JSON.parse(i));
}

// ═══════════════════════════════════════════════════════════════════════
//  DEPLOYER DIR ACCESSOR
// ═══════════════════════════════════════════════════════════════════════

export function getDeployerDir(): string {
  return DEPLOYER_DIR;
}
