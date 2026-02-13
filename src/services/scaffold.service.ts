import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chain } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOL_TEMPLATES_DIR = resolve(__dirname, '../../../tools/products/Paxeer-Smart-Contract-SDK/templates');

// ═══════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════

export type ScaffoldType = 'contract' | 'dapp' | 'fullstack';

export type ContractTemplate = 'token' | 'nft' | 'staking' | 'amm' | 'vault' | 'governance' | 'oracle' | 'factory';
export type DappTemplate = 'token-dashboard' | 'nft-minter' | 'defi-dashboard' | 'wallet-connect' | 'portfolio-tracker';
export type FullstackTemplate = 'token-launchpad' | 'nft-marketplace' | 'dao-platform' | 'defi-protocol';

export type TemplateId = ContractTemplate | DappTemplate | FullstackTemplate;

export interface TemplateVariable {
  key: string;
  label: string;
  description: string;
  type: 'string' | 'number';
  required: boolean;
  default?: string;
}

export interface TemplateInfo {
  id: TemplateId;
  scaffoldType: ScaffoldType;
  name: string;
  description: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  estimatedFiles: number;
  variables: TemplateVariable[];
}

export interface GenerateOptions {
  scaffoldType: ScaffoldType;
  template: TemplateId;
  projectName: string;
  variables: Record<string, string>;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

// ═══════════════════════════════════════════════════════════════════════
//  TEMPLATE REGISTRY
// ═══════════════════════════════════════════════════════════════════════

const ALL_TEMPLATES: TemplateInfo[] = [
  // ── Contract Templates ───────────────────────────────────────────
  {
    id: 'token', scaffoldType: 'contract', name: 'ERC20 Token', category: 'TOKEN', difficulty: 'beginner',
    description: 'ERC20 token with burn, permit, and mint. Production-ready with OpenZeppelin.',
    tags: ['erc20', 'fungible', 'defi'],
    estimatedFiles: 8,
    variables: [
      { key: 'CONTRACT_NAME', label: 'Contract Name', description: 'PascalCase Solidity name', type: 'string', required: true, default: 'MyToken' },
      { key: 'NAME', label: 'Token Name', description: 'Human-readable name', type: 'string', required: true, default: 'My Token' },
      { key: 'SYMBOL', label: 'Symbol', description: 'Ticker symbol', type: 'string', required: true, default: 'MTK' },
      { key: 'DECIMALS', label: 'Decimals', description: 'Decimal places', type: 'number', required: true, default: '18' },
      { key: 'INITIAL_SUPPLY', label: 'Initial Supply', description: 'Supply before decimals', type: 'number', required: true, default: '1000000' },
    ],
  },
  {
    id: 'nft', scaffoldType: 'contract', name: 'ERC721 NFT Collection', category: 'TOKEN', difficulty: 'beginner',
    description: 'NFT collection with enumeration, URI storage, batch minting, and burn.',
    tags: ['erc721', 'nft', 'collectible'],
    estimatedFiles: 8,
    variables: [
      { key: 'CONTRACT_NAME', label: 'Contract Name', description: 'PascalCase Solidity name', type: 'string', required: true, default: 'MyNFT' },
      { key: 'NAME', label: 'Collection Name', description: 'Collection display name', type: 'string', required: true, default: 'My NFT Collection' },
      { key: 'SYMBOL', label: 'Symbol', description: 'Collection symbol', type: 'string', required: true, default: 'MNFT' },
      { key: 'BASE_URI', label: 'Base URI', description: 'Metadata base URI', type: 'string', required: false, default: 'ipfs://QmYourHash/' },
    ],
  },
  {
    id: 'staking', scaffoldType: 'contract', name: 'Staking Rewards', category: 'DEFI', difficulty: 'intermediate',
    description: 'Staking pool with time-weighted rewards, pause controls, and emergency withdraw.',
    tags: ['staking', 'rewards', 'defi', 'yield'],
    estimatedFiles: 8,
    variables: [
      { key: 'CONTRACT_NAME', label: 'Contract Name', description: 'PascalCase Solidity name', type: 'string', required: true, default: 'MyStaking' },
    ],
  },
  {
    id: 'amm', scaffoldType: 'contract', name: 'AMM Pool (x*y=k)', category: 'DEFI', difficulty: 'advanced',
    description: 'Constant product AMM with configurable fees, LP tokens, and full swap/liquidity lifecycle.',
    tags: ['amm', 'dex', 'swap', 'liquidity', 'defi'],
    estimatedFiles: 8,
    variables: [
      { key: 'CONTRACT_NAME', label: 'Contract Name', description: 'PascalCase Solidity name', type: 'string', required: true, default: 'MyAMMPool' },
      { key: 'NAME', label: 'Pool Name', description: 'LP token name prefix', type: 'string', required: true, default: 'MyAMM' },
      { key: 'SYMBOL', label: 'Symbol', description: 'LP token symbol prefix', type: 'string', required: true, default: 'MAMM' },
    ],
  },
  {
    id: 'vault', scaffoldType: 'contract', name: 'ERC4626 Vault', category: 'DEFI', difficulty: 'intermediate',
    description: 'Tokenized vault standard with performance fees and reentrancy protection.',
    tags: ['vault', 'erc4626', 'yield', 'defi'],
    estimatedFiles: 8,
    variables: [
      { key: 'CONTRACT_NAME', label: 'Contract Name', description: 'PascalCase Solidity name', type: 'string', required: true, default: 'MyVault' },
      { key: 'NAME', label: 'Vault Name', description: 'Share token name', type: 'string', required: true, default: 'My Vault Shares' },
      { key: 'SYMBOL', label: 'Symbol', description: 'Share token symbol', type: 'string', required: true, default: 'mvSHARE' },
    ],
  },
  {
    id: 'governance', scaffoldType: 'contract', name: 'Governance / DAO', category: 'GOVERNANCE', difficulty: 'advanced',
    description: 'On-chain governance with proposals, voting, timelock execution, and quorum.',
    tags: ['dao', 'governance', 'voting', 'timelock'],
    estimatedFiles: 8,
    variables: [
      { key: 'CONTRACT_NAME', label: 'Contract Name', description: 'PascalCase Solidity name', type: 'string', required: true, default: 'MyGovernor' },
    ],
  },
  {
    id: 'oracle', scaffoldType: 'contract', name: 'Price Oracle', category: 'ORACLE', difficulty: 'intermediate',
    description: 'Multi-asset price oracle with TWAP, staleness checks, and access control.',
    tags: ['oracle', 'price-feed', 'data'],
    estimatedFiles: 8,
    variables: [
      { key: 'CONTRACT_NAME', label: 'Contract Name', description: 'PascalCase Solidity name', type: 'string', required: true, default: 'MyOracle' },
    ],
  },
  {
    id: 'factory', scaffoldType: 'contract', name: 'Contract Factory', category: 'CORE', difficulty: 'intermediate',
    description: 'Deploys and registers child contracts with CREATE2 deterministic addresses.',
    tags: ['factory', 'create2', 'deployer'],
    estimatedFiles: 8,
    variables: [
      { key: 'CONTRACT_NAME', label: 'Contract Name', description: 'PascalCase Solidity name', type: 'string', required: true, default: 'MyFactory' },
    ],
  },

  // ── dApp Frontend Templates ──────────────────────────────────────
  {
    id: 'token-dashboard', scaffoldType: 'dapp', name: 'Token Dashboard', category: 'DEFI', difficulty: 'beginner',
    description: 'React + Viem dApp with wallet connect, token balance display, transfer UI, and transaction history.',
    tags: ['react', 'viem', 'wallet', 'erc20', 'dashboard'],
    estimatedFiles: 18,
    variables: [
      { key: 'APP_NAME', label: 'App Name', description: 'Display name for the dApp', type: 'string', required: true, default: 'My Token Dashboard' },
      { key: 'TOKEN_ADDRESS', label: 'Token Address', description: 'Deployed ERC20 contract address (or leave empty)', type: 'string', required: false, default: '' },
    ],
  },
  {
    id: 'nft-minter', scaffoldType: 'dapp', name: 'NFT Minting dApp', category: 'TOKEN', difficulty: 'beginner',
    description: 'React dApp for minting NFTs with image upload preview, wallet connect, and mint status tracking.',
    tags: ['react', 'nft', 'mint', 'erc721', 'ipfs'],
    estimatedFiles: 18,
    variables: [
      { key: 'APP_NAME', label: 'App Name', description: 'Display name', type: 'string', required: true, default: 'My NFT Minter' },
      { key: 'NFT_ADDRESS', label: 'NFT Contract Address', description: 'Deployed ERC721 address (or leave empty)', type: 'string', required: false, default: '' },
    ],
  },
  {
    id: 'defi-dashboard', scaffoldType: 'dapp', name: 'DeFi Dashboard', category: 'DEFI', difficulty: 'intermediate',
    description: 'Multi-protocol DeFi dashboard with staking, pool stats, portfolio value, and yield tracking.',
    tags: ['react', 'defi', 'staking', 'yield', 'portfolio'],
    estimatedFiles: 22,
    variables: [
      { key: 'APP_NAME', label: 'App Name', description: 'Display name', type: 'string', required: true, default: 'PaxDeFi Dashboard' },
    ],
  },
  {
    id: 'wallet-connect', scaffoldType: 'dapp', name: 'Wallet Connect Starter', category: 'CORE', difficulty: 'beginner',
    description: 'Minimal React dApp with wallet connect, network switching, balance display, and send PAX form. Perfect starting point.',
    tags: ['react', 'wallet', 'starter', 'minimal'],
    estimatedFiles: 14,
    variables: [
      { key: 'APP_NAME', label: 'App Name', description: 'Display name', type: 'string', required: true, default: 'My Paxeer dApp' },
    ],
  },
  {
    id: 'portfolio-tracker', scaffoldType: 'dapp', name: 'Portfolio Tracker', category: 'DEFI', difficulty: 'intermediate',
    description: 'Track token balances, NFT holdings, transaction history, and portfolio value on Paxeer.',
    tags: ['react', 'portfolio', 'tracker', 'balance'],
    estimatedFiles: 20,
    variables: [
      { key: 'APP_NAME', label: 'App Name', description: 'Display name', type: 'string', required: true, default: 'Paxeer Portfolio' },
    ],
  },

  // ── Fullstack Templates ──────────────────────────────────────────
  {
    id: 'token-launchpad', scaffoldType: 'fullstack', name: 'Token Launchpad', category: 'DEFI', difficulty: 'advanced',
    description: 'Full token launch platform: ERC20 contract + React frontend with deploy wizard, token config UI, and auto-verification.',
    tags: ['launchpad', 'token', 'deploy', 'fullstack'],
    estimatedFiles: 28,
    variables: [
      { key: 'APP_NAME', label: 'App Name', description: 'Platform name', type: 'string', required: true, default: 'PaxLaunch' },
      { key: 'CONTRACT_NAME', label: 'Contract Name', description: 'Factory contract name', type: 'string', required: true, default: 'TokenLaunchpad' },
    ],
  },
  {
    id: 'nft-marketplace', scaffoldType: 'fullstack', name: 'NFT Marketplace', category: 'TOKEN', difficulty: 'advanced',
    description: 'NFT marketplace with ERC721 contract, listing/buying/selling UI, metadata display, and collection pages.',
    tags: ['nft', 'marketplace', 'buy', 'sell', 'fullstack'],
    estimatedFiles: 32,
    variables: [
      { key: 'APP_NAME', label: 'App Name', description: 'Marketplace name', type: 'string', required: true, default: 'PaxMarket' },
      { key: 'CONTRACT_NAME', label: 'Contract Name', description: 'NFT contract name', type: 'string', required: true, default: 'MarketplaceNFT' },
    ],
  },
  {
    id: 'dao-platform', scaffoldType: 'fullstack', name: 'DAO Platform', category: 'GOVERNANCE', difficulty: 'advanced',
    description: 'Full DAO: governance contract + frontend with proposal creation, voting UI, delegation, and execution tracking.',
    tags: ['dao', 'governance', 'voting', 'fullstack'],
    estimatedFiles: 30,
    variables: [
      { key: 'APP_NAME', label: 'App Name', description: 'DAO name', type: 'string', required: true, default: 'PaxDAO' },
      { key: 'CONTRACT_NAME', label: 'Contract Name', description: 'Governor contract name', type: 'string', required: true, default: 'PaxGovernor' },
    ],
  },
  {
    id: 'defi-protocol', scaffoldType: 'fullstack', name: 'DeFi Protocol', category: 'DEFI', difficulty: 'advanced',
    description: 'Full DeFi protocol: AMM + staking contracts, swap UI, liquidity management, and analytics dashboard.',
    tags: ['defi', 'amm', 'staking', 'swap', 'fullstack'],
    estimatedFiles: 35,
    variables: [
      { key: 'APP_NAME', label: 'App Name', description: 'Protocol name', type: 'string', required: true, default: 'PaxSwap' },
      { key: 'CONTRACT_NAME', label: 'Contract Name', description: 'AMM pool contract name', type: 'string', required: true, default: 'PaxPool' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

export function listAllTemplates(): TemplateInfo[] {
  return ALL_TEMPLATES;
}

export function listTemplatesByType(scaffoldType: ScaffoldType): TemplateInfo[] {
  return ALL_TEMPLATES.filter((t) => t.scaffoldType === scaffoldType);
}

export function getTemplate(id: string): TemplateInfo | null {
  return ALL_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function searchTemplates(query: string): TemplateInfo[] {
  const q = query.toLowerCase();
  return ALL_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.includes(q)) ||
      t.category.toLowerCase().includes(q)
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  SHARED GENERATORS
// ═══════════════════════════════════════════════════════════════════════

function slug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function renderSolTemplate(templateType: ContractTemplate, vars: Record<string, string>): string {
  const templateFile = resolve(SOL_TEMPLATES_DIR, `${templateType}.sol.template`);
  let content = readFileSync(templateFile, 'utf-8');
  const now = new Date();
  const allVars: Record<string, string> = { YEAR: now.getFullYear().toString(), TIMESTAMP: now.toISOString(), ...vars };
  for (const [key, value] of Object.entries(allVars)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content;
}

function getConstructorArgs(t: ContractTemplate): string {
  switch (t) {
    case 'staking': return '/* stakingTokenAddress, rewardTokenAddress */';
    case 'amm': return '/* token0Address, token1Address, swapFeeBps */';
    case 'vault': return '/* underlyingAssetAddress */';
    default: return '';
  }
}

function hardhatConfig(): string {
  return `require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {},
    paxeer: {
      url: "${chain.rpc.evmJsonRpc}",
      chainId: ${chain.evmChainId},
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: { paxeer: process.env.EXPLORER_API_KEY || "" },
    customChains: [{
      network: "paxeer",
      chainId: ${chain.evmChainId},
      urls: {
        apiURL: "${chain.explorer.mainnet}/api",
        browserURL: "${chain.explorer.mainnet}",
      },
    }],
  },
};
`;
}

function envExample(): string {
  return `# ${chain.name} — Configuration
# Copy to .env — NEVER commit .env!

PRIVATE_KEY=your_private_key_here
EXPLORER_API_KEY=your_explorer_api_key

# RPC (pre-configured in hardhat.config.js)
# PAXEER_RPC_URL=${chain.rpc.evmJsonRpc}
`;
}

function deployScript(contractName: string, templateType: ContractTemplate): string {
  const args = getConstructorArgs(templateType);
  return `const hre = require("hardhat");

async function main() {
  console.log("Deploying ${contractName} to", hre.network.name, "...");
  const Contract = await hre.ethers.getContractFactory("${contractName}");
  const contract = await Contract.deploy(${args});
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("${contractName} deployed to:", address);
  console.log("Explorer: ${chain.explorer.mainnet}/address/" + address);

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Waiting 30s for explorer indexing...");
    await new Promise((r) => setTimeout(r, 30000));
    try {
      await hre.run("verify:verify", { address, constructorArguments: [${args}] });
      console.log("Verified!");
    } catch (err) {
      console.log("Verification failed:", err.message);
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
`;
}

function testFile(contractName: string, templateType: ContractTemplate): string {
  return `const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("${contractName}", function () {
  let contract, owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("${contractName}");
    contract = await Factory.deploy(${getConstructorArgs(templateType)});
    await contract.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      expect(await contract.getAddress()).to.be.properAddress;
    });

    it("Should set the right owner", async function () {
      // Adjust based on your contract
      try {
        expect(await contract.owner()).to.equal(owner.address);
      } catch { /* contract may not have owner() */ }
    });
  });
});
`;
}

function contractPackageJson(projectName: string): string {
  return JSON.stringify({
    name: slug(projectName),
    version: '0.1.0',
    description: `${projectName} — Built on ${chain.name}`,
    scripts: {
      compile: 'hardhat compile',
      test: 'hardhat test',
      'test:coverage': 'hardhat coverage',
      'test:gas': 'REPORT_GAS=true hardhat test',
      deploy: 'hardhat run scripts/deploy.js --network paxeer',
      'deploy:local': 'hardhat run scripts/deploy.js --network localhost',
      verify: 'hardhat verify',
      clean: 'hardhat clean',
      node: 'hardhat node',
    },
    dependencies: { '@openzeppelin/contracts': '^5.0.0', dotenv: '^16.3.1', ethers: '^6.9.0' },
    devDependencies: { '@nomicfoundation/hardhat-toolbox': '^4.0.0', hardhat: '^2.19.0' },
    license: 'GPL-3.0',
  }, null, 2);
}

function gitignore(): string {
  return `node_modules/\ncache/\nartifacts/\ntypechain-types/\ncoverage/\ncoverage.json\n.env\ndist/\n.next/\n`;
}

// ═══════════════════════════════════════════════════════════════════════
//  dApp GENERATORS — React + Vite + Viem + TailwindCSS
// ═══════════════════════════════════════════════════════════════════════

function paxeerChainDef(): string {
  return `import { defineChain } from "viem";

export const paxeer = defineChain({
  id: ${chain.evmChainId},
  name: "${chain.name}",
  nativeCurrency: { name: "${chain.token.name}", symbol: "${chain.token.symbol}", decimals: ${chain.token.decimals} },
  rpcUrls: {
    default: { http: ["${chain.rpc.evmJsonRpc}"] },
  },
  blockExplorers: {
    default: { name: "PaxScan", url: "${chain.explorer.mainnet}" },
  },
});
`;
}

function viemClientSetup(): string {
  return `import { createPublicClient, createWalletClient, http, custom } from "viem";
import { paxeer } from "./chain";

export const publicClient = createPublicClient({
  chain: paxeer,
  transport: http(),
});

export function getWalletClient() {
  if (typeof window === "undefined" || !window.ethereum) return null;
  return createWalletClient({
    chain: paxeer,
    transport: custom(window.ethereum),
  });
}

export async function connectWallet() {
  if (!window.ethereum) throw new Error("No wallet found. Install MetaMask.");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const walletClient = getWalletClient();
  return { address: accounts[0], walletClient };
}

export async function switchToPaxeer() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + (${chain.evmChainId}).toString(16) }],
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x" + (${chain.evmChainId}).toString(16),
          chainName: "${chain.name}",
          nativeCurrency: { name: "${chain.token.name}", symbol: "${chain.token.symbol}", decimals: ${chain.token.decimals} },
          rpcUrls: ["${chain.rpc.evmJsonRpc}"],
          blockExplorerUrls: ["${chain.explorer.mainnet}"],
        }],
      });
    }
  }
}
`;
}

function dappPackageJson(projectName: string, extra: Record<string, string> = {}): string {
  return JSON.stringify({
    name: slug(projectName),
    version: '0.1.0',
    private: true,
    type: 'module',
    description: `${projectName} — dApp on ${chain.name}`,
    scripts: {
      dev: 'vite',
      build: 'tsc -b && vite build',
      preview: 'vite preview',
    },
    dependencies: {
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      viem: '^2.23.0',
      'tailwind-merge': '^3.0.0',
      clsx: '^2.1.0',
      'lucide-react': '^0.460.0',
      ...extra,
    },
    devDependencies: {
      '@vitejs/plugin-react': '^4.3.0',
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
      vite: '^6.0.0',
      typescript: '^5.7.0',
      tailwindcss: '^4.0.0',
      '@tailwindcss/vite': '^4.0.0',
    },
    license: 'MIT',
  }, null, 2);
}

function dappViteConfig(): string {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
`;
}

function dappTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2020', module: 'ESNext', moduleResolution: 'bundler',
      jsx: 'react-jsx', strict: true, skipLibCheck: true,
      esModuleInterop: true, resolveJsonModule: true,
      isolatedModules: true, outDir: 'dist',
    },
    include: ['src'],
  }, null, 2);
}

function dappIndexHtml(appName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function dappMainTsx(): string {
  return `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
}

function dappIndexCss(): string {
  return `@import "tailwindcss";

:root {
  --pax-primary: #6366f1;
  --pax-bg: #0f0f23;
  --pax-surface: #1a1a3e;
  --pax-text: #e2e8f0;
  --pax-muted: #94a3b8;
}

body {
  background: var(--pax-bg);
  color: var(--pax-text);
  font-family: system-ui, -apple-system, sans-serif;
}
`;
}

function walletConnectApp(appName: string): string {
  return `import { useState, useEffect } from "react";
import { formatEther } from "viem";
import { publicClient, connectWallet, switchToPaxeer } from "./lib/client";

export default function App() {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    try {
      await switchToPaxeer();
      const { address: addr } = await connectWallet();
      setAddress(addr);
      const bal = await publicClient.getBalance({ address: addr as \`0x\${string}\` });
      setBalance(formatEther(bal));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
        ${appName}
      </h1>
      <p className="text-[var(--pax-muted)] text-lg">Built on HyperPaxeer Network</p>

      {!address ? (
        <button
          onClick={handleConnect}
          disabled={loading}
          className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50"
        >
          {loading ? "Connecting..." : "Connect Wallet"}
        </button>
      ) : (
        <div className="bg-[var(--pax-surface)] rounded-2xl p-8 space-y-4 min-w-[400px]">
          <div>
            <span className="text-[var(--pax-muted)] text-sm">Connected</span>
            <p className="font-mono text-sm truncate">{address}</p>
          </div>
          <div>
            <span className="text-[var(--pax-muted)] text-sm">Balance</span>
            <p className="text-3xl font-bold">{Number(balance).toFixed(4)} PAX</p>
          </div>
          <a
            href={\`${chain.explorer.mainnet}/address/\${address}\`}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-400 hover:underline text-sm"
          >
            View on PaxScan &rarr;
          </a>
        </div>
      )}
    </div>
  );
}
`;
}

// ═══════════════════════════════════════════════════════════════════════
//  DexKit-INSPIRED HOOKS (adapted from ethers.js → Viem)
// ═══════════════════════════════════════════════════════════════════════

/** Wallet connect hook (shared across all dApp templates) */
function useWalletHook(): string {
  return `import { useState, useCallback } from "react";
import { connectWallet, switchToPaxeer, publicClient } from "../lib/client";
import { formatEther } from "viem";

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await switchToPaxeer();
      const { address: addr } = await connectWallet();
      setAddress(addr);
      const bal = await publicClient.getBalance({ address: addr as \`0x\${string}\` });
      setBalance(formatEther(bal));
    } catch (err: any) {
      setError(err.message ?? "Connection failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setBalance("0");
  }, []);

  return { address, balance, loading, error, connect, disconnect, isConnected: !!address };
}
`;
}

/** ERC20 interaction hook — balance, allowance, approve, transfer (inspired by DexKit balances.ts) */
function useERC20Hook(): string {
  return `import { useState, useCallback, useEffect } from "react";
import { publicClient, getWalletClient } from "../lib/client";
import { formatUnits, parseUnits, type Address } from "viem";

const ERC20_ABI = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export interface TokenInfo {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
}

export function useERC20(tokenAddress?: string) {
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [balance, setBalance] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addr = tokenAddress as Address | undefined;

  const fetchInfo = useCallback(async () => {
    if (!addr) return;
    setLoading(true);
    try {
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        publicClient.readContract({ address: addr, abi: ERC20_ABI, functionName: "name" }),
        publicClient.readContract({ address: addr, abi: ERC20_ABI, functionName: "symbol" }),
        publicClient.readContract({ address: addr, abi: ERC20_ABI, functionName: "decimals" }),
        publicClient.readContract({ address: addr, abi: ERC20_ABI, functionName: "totalSupply" }),
      ]);
      setInfo({ address: addr, name, symbol, decimals, totalSupply: formatUnits(totalSupply, decimals) });
    } catch (err: any) {
      setError(err.message ?? "Failed to fetch token info");
    } finally {
      setLoading(false);
    }
  }, [addr]);

  const fetchBalance = useCallback(async (owner: Address) => {
    if (!addr) return "0";
    const raw = await publicClient.readContract({ address: addr, abi: ERC20_ABI, functionName: "balanceOf", args: [owner] });
    const decimals = info?.decimals ?? 18;
    const formatted = formatUnits(raw, decimals);
    setBalance(formatted);
    return formatted;
  }, [addr, info]);

  const approve = useCallback(async (spender: Address, amount: string) => {
    if (!addr || !info) throw new Error("Token not loaded");
    const walletClient = getWalletClient();
    if (!walletClient) throw new Error("Wallet not connected");
    const [account] = await walletClient.getAddresses();
    const hash = await walletClient.writeContract({
      address: addr, abi: ERC20_ABI, functionName: "approve",
      args: [spender, parseUnits(amount, info.decimals)], account,
    });
    return publicClient.waitForTransactionReceipt({ hash });
  }, [addr, info]);

  const transfer = useCallback(async (to: Address, amount: string) => {
    if (!addr || !info) throw new Error("Token not loaded");
    const walletClient = getWalletClient();
    if (!walletClient) throw new Error("Wallet not connected");
    const [account] = await walletClient.getAddresses();
    const hash = await walletClient.writeContract({
      address: addr, abi: ERC20_ABI, functionName: "transfer",
      args: [to as Address, parseUnits(amount, info.decimals)], account,
    });
    return publicClient.waitForTransactionReceipt({ hash });
  }, [addr, info]);

  const checkAllowance = useCallback(async (owner: Address, spender: Address) => {
    if (!addr || !info) return "0";
    const raw = await publicClient.readContract({ address: addr, abi: ERC20_ABI, functionName: "allowance", args: [owner, spender] });
    return formatUnits(raw, info.decimals);
  }, [addr, info]);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  return { info, balance, loading, error, fetchInfo, fetchBalance, approve, transfer, checkAllowance };
}
`;
}

/** Generic contract read/write hook (inspired by DexKit web3forms hooks) */
function useContractHook(): string {
  return `import { useState, useCallback } from "react";
import { publicClient, getWalletClient } from "../lib/client";
import type { Abi, Address } from "viem";

export interface ContractCallResult {
  data: any;
  loading: boolean;
  error: string | null;
}

export function useContractRead(address?: string, abi?: Abi) {
  const [result, setResult] = useState<ContractCallResult>({ data: null, loading: false, error: null });

  const read = useCallback(async (functionName: string, args: any[] = []) => {
    if (!address || !abi) return null;
    setResult({ data: null, loading: true, error: null });
    try {
      const data = await publicClient.readContract({
        address: address as Address,
        abi,
        functionName,
        args,
      });
      setResult({ data, loading: false, error: null });
      return data;
    } catch (err: any) {
      setResult({ data: null, loading: false, error: err.message });
      return null;
    }
  }, [address, abi]);

  return { ...result, read };
}

export function useContractWrite(address?: string, abi?: Abi) {
  const [txHash, setTxHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const write = useCallback(async (functionName: string, args: any[] = [], value?: bigint) => {
    if (!address || !abi) throw new Error("Contract not configured");
    const walletClient = getWalletClient();
    if (!walletClient) throw new Error("Wallet not connected");
    setLoading(true);
    setError(null);
    try {
      const [account] = await walletClient.getAddresses();
      const hash = await walletClient.writeContract({
        address: address as Address,
        abi,
        functionName,
        args,
        account,
        ...(value ? { value } : {}),
      });
      setTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setLoading(false);
      return receipt;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [address, abi]);

  return { txHash, loading, error, write };
}
`;
}

/** Transaction watcher hook (inspired by DexKit TransactionUpdater) */
function useTransactionsHook(): string {
  return `import { useState, useCallback } from "react";
import { publicClient } from "../lib/client";
import type { Hash, TransactionReceipt } from "viem";

export type TxStatus = "pending" | "confirmed" | "failed";

export interface TrackedTx {
  hash: Hash;
  status: TxStatus;
  description: string;
  receipt?: TransactionReceipt;
  timestamp: number;
}

export function useTransactions() {
  const [transactions, setTransactions] = useState<TrackedTx[]>([]);

  const track = useCallback(async (hash: Hash, description: string) => {
    const tx: TrackedTx = { hash, status: "pending", description, timestamp: Date.now() };
    setTransactions((prev) => [tx, ...prev]);

    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setTransactions((prev) =>
        prev.map((t) =>
          t.hash === hash
            ? { ...t, status: receipt.status === "success" ? "confirmed" : "failed", receipt }
            : t
        )
      );
      return receipt;
    } catch {
      setTransactions((prev) =>
        prev.map((t) => (t.hash === hash ? { ...t, status: "failed" } : t))
      );
      return null;
    }
  }, []);

  const clear = useCallback(() => setTransactions([]), []);

  return {
    transactions,
    pending: transactions.filter((t) => t.status === "pending"),
    confirmed: transactions.filter((t) => t.status === "confirmed"),
    track,
    clear,
  };
}
`;
}

/** Reusable UI components for dApp scaffolds */
function sharedComponents(): string {
  return `import React from "react";

/** Truncate an address to 0x1234...abcd */
export function shortenAddress(address: string, chars = 4): string {
  return \`\${address.slice(0, chars + 2)}...\${address.slice(-chars)}\`;
}

/** Copy to clipboard button */
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className={\`text-xs text-indigo-400 hover:text-indigo-300 \${className ?? ""}\`}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

/** Address display with copy */
export function AddressDisplay({ address, label }: { address: string; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-[var(--pax-muted)] text-sm">{label}</span>}
      <span className="font-mono text-sm">{shortenAddress(address)}</span>
      <CopyButton text={address} />
    </div>
  );
}

/** Transaction status badge */
export function TxBadge({ status }: { status: "pending" | "confirmed" | "failed" }) {
  const colors = {
    pending: "bg-yellow-500/20 text-yellow-400",
    confirmed: "bg-green-500/20 text-green-400",
    failed: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={\`px-2 py-0.5 rounded-full text-xs font-medium \${colors[status]}\`}>
      {status}
    </span>
  );
}

/** Loading spinner */
export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-8 h-8" }[size];
  return (
    <div className={\`\${s} border-2 border-indigo-400 border-t-transparent rounded-full animate-spin\`} />
  );
}

/** Card wrapper */
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={\`bg-[var(--pax-surface)] rounded-2xl p-6 \${className ?? ""}\`}>
      {children}
    </div>
  );
}
`;
}

/** Token dashboard App with balances, transfer form — uses DexKit-inspired hooks */
function tokenDashboardApp(appName: string): string {
  return `import { useState } from "react";
import { useWallet } from "./hooks/useWallet";
import { useERC20 } from "./hooks/useERC20";
import { useTransactions } from "./hooks/useTransactions";
import { Card, AddressDisplay, TxBadge, Spinner, shortenAddress } from "./components/ui";
import type { Address } from "viem";

const TOKEN_ADDRESS = import.meta.env.VITE_TOKEN_ADDRESS || "";

export default function App() {
  const wallet = useWallet();
  const token = useERC20(TOKEN_ADDRESS || undefined);
  const txs = useTransactions();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);

  // Fetch balance when wallet connects
  const handleConnect = async () => {
    await wallet.connect();
  };

  const handleFetchBalance = async () => {
    if (wallet.address && token.info) {
      await token.fetchBalance(wallet.address as Address);
    }
  };

  const handleTransfer = async () => {
    if (!to || !amount) return;
    setSending(true);
    try {
      const receipt = await token.transfer(to as Address, amount);
      if (receipt) {
        await txs.track(receipt.transactionHash, \`Transfer \${amount} \${token.info?.symbol} to \${shortenAddress(to)}\`);
        setTo("");
        setAmount("");
        handleFetchBalance();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
          ${appName}
        </h1>
        <p className="text-[var(--pax-muted)]">Token management on HyperPaxeer Network</p>
      </div>

      {!wallet.isConnected ? (
        <div className="flex justify-center">
          <button onClick={handleConnect} disabled={wallet.loading}
            className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50">
            {wallet.loading ? "Connecting..." : "Connect Wallet"}
          </button>
        </div>
      ) : (
        <>
          {/* Wallet Info */}
          <Card>
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className="text-[var(--pax-muted)] text-sm">Wallet</span>
                <AddressDisplay address={wallet.address!} />
              </div>
              <div className="text-right">
                <span className="text-[var(--pax-muted)] text-sm">PAX Balance</span>
                <p className="text-2xl font-bold">{Number(wallet.balance).toFixed(4)}</p>
              </div>
            </div>
          </Card>

          {/* Token Info */}
          {token.info && (
            <Card>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{token.info.name} ({token.info.symbol})</h3>
                  <AddressDisplay address={token.info.address} label="Contract" />
                  <p className="text-sm text-[var(--pax-muted)] mt-1">Supply: {Number(token.info.totalSupply).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <span className="text-[var(--pax-muted)] text-sm">Your Balance</span>
                  <p className="text-2xl font-bold">{Number(token.balance).toLocaleString()}</p>
                  <button onClick={handleFetchBalance} className="text-xs text-indigo-400 hover:underline mt-1">Refresh</button>
                </div>
              </div>
            </Card>
          )}

          {!TOKEN_ADDRESS && (
            <Card className="border border-yellow-500/30">
              <p className="text-yellow-400 text-sm">Set <code>VITE_TOKEN_ADDRESS</code> in your <code>.env</code> to enable token features.</p>
            </Card>
          )}

          {/* Transfer Form */}
          {token.info && (
            <Card>
              <h3 className="font-semibold mb-4">Transfer {token.info.symbol}</h3>
              <div className="space-y-3">
                <input type="text" placeholder="Recipient address (0x...)" value={to} onChange={(e) => setTo(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-[var(--pax-bg)] border border-white/10 text-white placeholder:text-[var(--pax-muted)]" />
                <input type="text" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-[var(--pax-bg)] border border-white/10 text-white placeholder:text-[var(--pax-muted)]" />
                <button onClick={handleTransfer} disabled={sending || !to || !amount}
                  className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {sending && <Spinner size="sm" />}
                  {sending ? "Sending..." : "Transfer"}
                </button>
              </div>
            </Card>
          )}

          {/* Transaction History */}
          {txs.transactions.length > 0 && (
            <Card>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold">Recent Transactions</h3>
                <button onClick={txs.clear} className="text-xs text-[var(--pax-muted)] hover:text-white">Clear</button>
              </div>
              <div className="space-y-2">
                {txs.transactions.map((tx) => (
                  <div key={tx.hash} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                    <div>
                      <p className="text-sm">{tx.description}</p>
                      <a href={\`${chain.explorer.mainnet}/tx/\${tx.hash}\`} target="_blank" rel="noreferrer"
                        className="text-xs text-indigo-400 hover:underline font-mono">{shortenAddress(tx.hash, 8)}</a>
                    </div>
                    <TxBadge status={tx.status} />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
`;
}

// ═══════════════════════════════════════════════════════════════════════
//  README GENERATORS
// ═══════════════════════════════════════════════════════════════════════

function contractReadme(projectName: string, contractName: string, desc: string): string {
  return `# ${projectName}

> Built on **${chain.name}** | Chain ID: \`${chain.evmChainId}\` | Token: \`${chain.token.symbol}\`

${desc}

## Quick Start

\`\`\`bash
npm install
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.js --network paxeer
\`\`\`

## Network

| Param | Value |
|-------|-------|
| **Chain ID** | \`${chain.evmChainId}\` |
| **RPC** | \`${chain.rpc.evmJsonRpc}\` |
| **Explorer** | [${chain.explorer.mainnet}](${chain.explorer.mainnet}) |
| **Token** | ${chain.token.symbol} |

## Resources

- [Paxeer Docs](${chain.docs})
- [Block Explorer](${chain.explorer.mainnet})
- [Smart Contract SDK](https://github.com/Paxeer-Network/Paxeer-Smart-Contract-SDK)
`;
}

function dappReadme(projectName: string, desc: string): string {
  return `# ${projectName}

> dApp on **${chain.name}** | Chain ID: \`${chain.evmChainId}\`

${desc}

## Stack

- **React 19** + **TypeScript** + **Vite**
- **Viem** for blockchain interaction
- **TailwindCSS** for styling
- Pre-configured for HyperPaxeer (chain ID ${chain.evmChainId})

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:5173](http://localhost:5173).

## Network

| Param | Value |
|-------|-------|
| **Chain ID** | \`${chain.evmChainId}\` |
| **RPC** | \`${chain.rpc.evmJsonRpc}\` |
| **Explorer** | [${chain.explorer.mainnet}](${chain.explorer.mainnet}) |

## Resources

- [Paxeer Docs](${chain.docs})
- [Viem Docs](https://viem.sh)
`;
}

function fullstackReadme(projectName: string, desc: string): string {
  return `# ${projectName}

> Fullstack dApp on **${chain.name}** | Chain ID: \`${chain.evmChainId}\`

${desc}

## Structure

\`\`\`
├── contracts/          # Solidity smart contracts (Hardhat)
├── frontend/           # React + Vite frontend
├── hardhat.config.js
└── package.json
\`\`\`

## Quick Start

\`\`\`bash
# Install all deps
npm install
cd frontend && npm install && cd ..

# Compile contracts
npx hardhat compile

# Start frontend
cd frontend && npm run dev
\`\`\`

## Deploy Flow

\`\`\`bash
# 1. Deploy contracts
npx hardhat run scripts/deploy.js --network paxeer

# 2. Copy contract address to frontend/.env
# 3. Build & deploy frontend
cd frontend && npm run build
\`\`\`
`;
}

// ═══════════════════════════════════════════════════════════════════════
//  COMPLETE APP COMPONENTS (fully functional out of the box)
// ═══════════════════════════════════════════════════════════════════════

function nftMinterApp(appName: string): string {
  return `import { useState, useEffect } from "react";
import { useWallet } from "./hooks/useWallet";
import { useContractWrite, useContractRead } from "./hooks/useContract";
import { useTransactions } from "./hooks/useTransactions";
import { Card, AddressDisplay, TxBadge, Spinner, shortenAddress } from "./components/ui";
import { formatEther, parseEther } from "viem";
import { publicClient } from "./lib/client";

const NFT_ADDRESS = import.meta.env.VITE_NFT_ADDRESS || "";

const NFT_ABI = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "tokenURI", type: "function", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "string" }] },
  { name: "mint", type: "function", stateMutability: "payable", inputs: [{ name: "to", type: "address" }], outputs: [] },
  { name: "safeMint", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "uri", type: "string" }], outputs: [] },
] as const;

export default function App() {
  const wallet = useWallet();
  const txs = useTransactions();
  const reader = useContractRead(NFT_ADDRESS, NFT_ABI as any);
  const writer = useContractWrite(NFT_ADDRESS, NFT_ABI as any);
  const [collectionName, setCollectionName] = useState("");
  const [totalSupply, setTotalSupply] = useState(0);
  const [ownedCount, setOwnedCount] = useState(0);
  const [mintUri, setMintUri] = useState("");
  const [tab, setTab] = useState<"mint" | "collection">("mint");

  useEffect(() => {
    if (NFT_ADDRESS) {
      reader.read("name").then((n) => n && setCollectionName(n as string));
      reader.read("totalSupply").then((s) => s && setTotalSupply(Number(s)));
    }
  }, [NFT_ADDRESS]);

  useEffect(() => {
    if (wallet.address && NFT_ADDRESS) {
      reader.read("balanceOf", [wallet.address]).then((b) => b && setOwnedCount(Number(b)));
    }
  }, [wallet.address]);

  const handleMint = async () => {
    if (!wallet.address) return;
    try {
      const receipt = await writer.write("safeMint", [wallet.address, mintUri || "ipfs://placeholder"]);
      if (receipt) {
        await txs.track(receipt.transactionHash, "Minted NFT");
        setMintUri("");
        reader.read("totalSupply").then((s) => s && setTotalSupply(Number(s)));
        reader.read("balanceOf", [wallet.address]).then((b) => b && setOwnedCount(Number(b)));
      }
    } catch (err) { console.error(err); }
  };

  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
          ${appName}
        </h1>
        <p className="text-[var(--pax-muted)]">{collectionName || "NFT Minting"} on HyperPaxeer</p>
      </div>

      {!wallet.isConnected ? (
        <div className="flex justify-center">
          <button onClick={wallet.connect} disabled={wallet.loading}
            className="px-8 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition disabled:opacity-50">
            {wallet.loading ? "Connecting..." : "Connect Wallet"}
          </button>
        </div>
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-3xl font-bold">{totalSupply}</p>
                <p className="text-[var(--pax-muted)] text-sm">Total Minted</p>
              </div>
              <div>
                <p className="text-3xl font-bold">{ownedCount}</p>
                <p className="text-[var(--pax-muted)] text-sm">You Own</p>
              </div>
              <div>
                <p className="text-3xl font-bold">{Number(wallet.balance).toFixed(2)}</p>
                <p className="text-[var(--pax-muted)] text-sm">PAX Balance</p>
              </div>
            </div>
          </Card>

          <div className="flex gap-2">
            <button onClick={() => setTab("mint")}
              className={\`px-4 py-2 rounded-lg font-medium transition \${tab === "mint" ? "bg-purple-600 text-white" : "bg-[var(--pax-surface)] text-[var(--pax-muted)]"}\`}>
              Mint
            </button>
            <button onClick={() => setTab("collection")}
              className={\`px-4 py-2 rounded-lg font-medium transition \${tab === "collection" ? "bg-purple-600 text-white" : "bg-[var(--pax-surface)] text-[var(--pax-muted)]"}\`}>
              Collection
            </button>
          </div>

          {tab === "mint" && (
            <Card>
              <h3 className="font-semibold text-lg mb-4">Mint New NFT</h3>
              {!NFT_ADDRESS ? (
                <p className="text-yellow-400 text-sm">Set <code>VITE_NFT_ADDRESS</code> in .env to enable minting.</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-[var(--pax-muted)] mb-1 block">Token URI (IPFS or HTTP)</label>
                    <input type="text" placeholder="ipfs://QmYourMetadataHash" value={mintUri} onChange={(e) => setMintUri(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg bg-[var(--pax-bg)] border border-white/10 text-white placeholder:text-[var(--pax-muted)]" />
                  </div>
                  <button onClick={handleMint} disabled={writer.loading}
                    className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition disabled:opacity-50 flex items-center justify-center gap-2">
                    {writer.loading && <Spinner size="sm" />}
                    {writer.loading ? "Minting..." : "Mint NFT"}
                  </button>
                  {writer.error && <p className="text-red-400 text-sm">{writer.error}</p>}
                </div>
              )}
            </Card>
          )}

          {tab === "collection" && (
            <Card>
              <h3 className="font-semibold text-lg mb-4">Your Collection</h3>
              {ownedCount === 0 ? (
                <p className="text-[var(--pax-muted)]">No NFTs yet. Mint your first one!</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {Array.from({ length: ownedCount }, (_, i) => (
                    <div key={i} className="bg-[var(--pax-bg)] rounded-xl p-4 text-center">
                      <div className="w-full aspect-square bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg mb-2 flex items-center justify-center">
                        <span className="text-4xl">#{i + 1}</span>
                      </div>
                      <p className="text-sm font-medium">Token #{i + 1}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {txs.transactions.length > 0 && (
            <Card>
              <h3 className="font-semibold mb-3">Transactions</h3>
              {txs.transactions.map((tx) => (
                <div key={tx.hash} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                  <div>
                    <p className="text-sm">{tx.description}</p>
                    <a href={\`${chain.explorer.mainnet}/tx/\${tx.hash}\`} target="_blank" rel="noreferrer"
                      className="text-xs text-purple-400 hover:underline font-mono">{shortenAddress(tx.hash, 8)}</a>
                  </div>
                  <TxBadge status={tx.status} />
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
`;
}

function defiDashboardApp(appName: string): string {
  return `import { useState, useEffect } from "react";
import { useWallet } from "./hooks/useWallet";
import { useERC20 } from "./hooks/useERC20";
import { Card, AddressDisplay, Spinner, shortenAddress } from "./components/ui";
import { formatEther } from "viem";
import { publicClient } from "./lib/client";

export default function App() {
  const wallet = useWallet();
  const [blockNumber, setBlockNumber] = useState<number>(0);
  const [gasPrice, setGasPrice] = useState<string>("0");
  const [tab, setTab] = useState<"overview" | "staking" | "pools">("overview");

  useEffect(() => {
    const fetchChainData = async () => {
      try {
        const [block, gas] = await Promise.all([
          publicClient.getBlockNumber(),
          publicClient.getGasPrice(),
        ]);
        setBlockNumber(Number(block));
        setGasPrice((Number(gas) / 1e9).toFixed(2));
      } catch {}
    };
    fetchChainData();
    const interval = setInterval(fetchChainData, 12000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            ${appName}
          </h1>
          <p className="text-[var(--pax-muted)] text-sm">DeFi Analytics on HyperPaxeer</p>
        </div>
        {!wallet.isConnected ? (
          <button onClick={wallet.connect} disabled={wallet.loading}
            className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition disabled:opacity-50 text-sm">
            {wallet.loading ? "..." : "Connect"}
          </button>
        ) : (
          <div className="text-right">
            <p className="font-mono text-sm">{shortenAddress(wallet.address!)}</p>
            <p className="text-emerald-400 font-bold">{Number(wallet.balance).toFixed(4)} PAX</p>
          </div>
        )}
      </div>

      {/* Network Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="text-center">
          <p className="text-2xl font-bold text-emerald-400">{blockNumber.toLocaleString()}</p>
          <p className="text-[var(--pax-muted)] text-xs mt-1">Block Height</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-cyan-400">{gasPrice}</p>
          <p className="text-[var(--pax-muted)] text-xs mt-1">Gas (Gwei)</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-purple-400">125</p>
          <p className="text-[var(--pax-muted)] text-xs mt-1">Chain ID</p>
        </Card>
        <Card className="text-center">
          <div className="w-3 h-3 rounded-full bg-emerald-400 mx-auto mb-1 animate-pulse" />
          <p className="text-[var(--pax-muted)] text-xs">Network Live</p>
        </Card>
      </div>

      <div className="flex gap-2">
        {(["overview", "staking", "pools"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={\`px-4 py-2 rounded-lg font-medium text-sm transition capitalize \${tab === t ? "bg-emerald-600 text-white" : "bg-[var(--pax-surface)] text-[var(--pax-muted)]"}\`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <h3 className="font-semibold mb-4">Portfolio Value</h3>
            <p className="text-4xl font-bold">{wallet.isConnected ? Number(wallet.balance).toFixed(4) : "—"} <span className="text-lg text-[var(--pax-muted)]">PAX</span></p>
            <p className="text-[var(--pax-muted)] text-sm mt-2">Native token balance on HyperPaxeer</p>
            {wallet.isConnected && (
              <a href={\`${chain.explorer.mainnet}/address/\${wallet.address}\`} target="_blank" rel="noreferrer"
                className="text-emerald-400 hover:underline text-sm mt-3 inline-block">View on PaxScan &rarr;</a>
            )}
          </Card>
          <Card>
            <h3 className="font-semibold mb-4">Network Info</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-[var(--pax-muted)]">Network</span><span>HyperPaxeer</span></div>
              <div className="flex justify-between"><span className="text-[var(--pax-muted)]">RPC</span><span className="font-mono text-xs">${chain.rpc.evmJsonRpc}</span></div>
              <div className="flex justify-between"><span className="text-[var(--pax-muted)]">Explorer</span><a href="${chain.explorer.mainnet}" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">PaxScan</a></div>
              <div className="flex justify-between"><span className="text-[var(--pax-muted)]">Token</span><span>PAX (18 decimals)</span></div>
            </div>
          </Card>
        </div>
      )}

      {tab === "staking" && (
        <Card>
          <h3 className="font-semibold mb-4">Staking Pools</h3>
          <p className="text-[var(--pax-muted)] mb-4">Connect your staking contract to see live pool data.</p>
          <div className="bg-[var(--pax-bg)] rounded-xl p-4 space-y-3">
            <div className="flex justify-between text-sm"><span className="text-[var(--pax-muted)]">Status</span><span className="text-yellow-400">Awaiting Contract</span></div>
            <p className="text-xs text-[var(--pax-muted)]">Set <code>VITE_STAKING_ADDRESS</code> in your .env and update the ABI to connect a staking pool.</p>
          </div>
        </Card>
      )}

      {tab === "pools" && (
        <Card>
          <h3 className="font-semibold mb-4">Liquidity Pools</h3>
          <p className="text-[var(--pax-muted)] mb-4">Connect your AMM contract to see pool data.</p>
          <div className="bg-[var(--pax-bg)] rounded-xl p-4 space-y-3">
            <div className="flex justify-between text-sm"><span className="text-[var(--pax-muted)]">Status</span><span className="text-yellow-400">Awaiting Contract</span></div>
            <p className="text-xs text-[var(--pax-muted)]">Set <code>VITE_POOL_ADDRESS</code> in your .env and update the ABI to connect a liquidity pool.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
`;
}

function portfolioTrackerApp(appName: string): string {
  return `import { useState, useEffect } from "react";
import { useWallet } from "./hooks/useWallet";
import { useTransactions } from "./hooks/useTransactions";
import { Card, AddressDisplay, Spinner, shortenAddress } from "./components/ui";
import { formatEther, formatUnits, type Address } from "viem";
import { publicClient } from "./lib/client";

const ERC20_ABI = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

interface TokenBalance {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
}

// Add your token addresses here
const TRACKED_TOKENS: string[] = (import.meta.env.VITE_TRACKED_TOKENS || "").split(",").filter(Boolean);

export default function App() {
  const wallet = useWallet();
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [txCount, setTxCount] = useState(0);

  const fetchTokenBalances = async () => {
    if (!wallet.address || TRACKED_TOKENS.length === 0) return;
    setLoadingTokens(true);
    const balances: TokenBalance[] = [];
    for (const addr of TRACKED_TOKENS) {
      try {
        const [name, symbol, decimals, bal] = await Promise.all([
          publicClient.readContract({ address: addr as Address, abi: ERC20_ABI, functionName: "name" }),
          publicClient.readContract({ address: addr as Address, abi: ERC20_ABI, functionName: "symbol" }),
          publicClient.readContract({ address: addr as Address, abi: ERC20_ABI, functionName: "decimals" }),
          publicClient.readContract({ address: addr as Address, abi: ERC20_ABI, functionName: "balanceOf", args: [wallet.address as Address] }),
        ]);
        balances.push({ address: addr, name, symbol, decimals, balance: formatUnits(bal, decimals) });
      } catch {}
    }
    setTokenBalances(balances);
    setLoadingTokens(false);
  };

  useEffect(() => {
    if (wallet.address) {
      fetchTokenBalances();
      publicClient.getTransactionCount({ address: wallet.address as Address }).then(setTxCount).catch(() => {});
    }
  }, [wallet.address]);

  const totalValue = tokenBalances.reduce((sum, t) => sum + Number(t.balance), 0);

  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
          ${appName}
        </h1>
        <p className="text-[var(--pax-muted)]">Track your assets on HyperPaxeer</p>
      </div>

      {!wallet.isConnected ? (
        <div className="flex justify-center">
          <button onClick={wallet.connect} disabled={wallet.loading}
            className="px-8 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium transition disabled:opacity-50">
            {wallet.loading ? "Connecting..." : "Connect Wallet"}
          </button>
        </div>
      ) : (
        <>
          <Card>
            <div className="flex justify-between items-start">
              <div>
                <AddressDisplay address={wallet.address!} label="Wallet" />
                <p className="text-sm text-[var(--pax-muted)] mt-1">{txCount} transactions</p>
              </div>
              <a href={\`${chain.explorer.mainnet}/address/\${wallet.address}\`} target="_blank" rel="noreferrer"
                className="text-amber-400 hover:underline text-sm">PaxScan &rarr;</a>
            </div>
          </Card>

          {/* Native Balance */}
          <Card>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center font-bold text-sm">PAX</div>
                <div>
                  <p className="font-semibold">PAX</p>
                  <p className="text-xs text-[var(--pax-muted)]">Native Token</p>
                </div>
              </div>
              <p className="text-xl font-bold">{Number(wallet.balance).toFixed(4)}</p>
            </div>
          </Card>

          {/* ERC20 Tokens */}
          {TRACKED_TOKENS.length > 0 ? (
            <>
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Token Balances</h3>
                <button onClick={fetchTokenBalances} disabled={loadingTokens}
                  className="text-sm text-amber-400 hover:underline flex items-center gap-1">
                  {loadingTokens && <Spinner size="sm" />} Refresh
                </button>
              </div>
              {tokenBalances.map((t) => (
                <Card key={t.address}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[var(--pax-bg)] flex items-center justify-center font-bold text-xs">{t.symbol.slice(0, 3)}</div>
                      <div>
                        <p className="font-semibold">{t.name}</p>
                        <p className="text-xs text-[var(--pax-muted)]">{t.symbol} &middot; {shortenAddress(t.address)}</p>
                      </div>
                    </div>
                    <p className="text-xl font-bold">{Number(t.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
                  </div>
                </Card>
              ))}
            </>
          ) : (
            <Card className="border border-yellow-500/30">
              <p className="text-yellow-400 text-sm">Set <code>VITE_TRACKED_TOKENS</code> in your .env (comma-separated addresses) to track ERC20 tokens.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
`;
}

/** Deploy script for fullstack that writes contract address to frontend/.env */
function fullstackDeployScript(contractName: string, solTemplate: ContractTemplate): string {
  const args = getConstructorArgs(solTemplate);
  return `const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying ${contractName} to", hre.network.name, "...");
  const Contract = await hre.ethers.getContractFactory("${contractName}");
  const contract = await Contract.deploy(${args});
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("\\n════════════════════════════════════════════");
  console.log("  ${contractName} deployed to:", address);
  console.log("  Explorer: ${chain.explorer.mainnet}/address/" + address);
  console.log("════════════════════════════════════════════\\n");

  // Auto-write to frontend/.env
  const envPath = path.join(__dirname, "..", "frontend", ".env");
  const envContent = \`VITE_CONTRACT_ADDRESS=\${address}\\n\`;
  fs.writeFileSync(envPath, envContent);
  console.log("✓ Contract address written to frontend/.env");
  console.log("  Run: cd frontend && npm run dev\\n");

  // Verify on explorer
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Waiting 30s for explorer indexing...");
    await new Promise((r) => setTimeout(r, 30000));
    try {
      await hre.run("verify:verify", { address, constructorArguments: [${args}] });
      console.log("✓ Contract verified on PaxScan!");
    } catch (err) {
      console.log("Verification failed:", err.message);
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
`;
}

/** Get the right App component for each dApp template */
function getDappAppComponent(template: DappTemplate, appName: string): string {
  switch (template) {
    case 'token-dashboard': return tokenDashboardApp(appName);
    case 'nft-minter': return nftMinterApp(appName);
    case 'defi-dashboard': return defiDashboardApp(appName);
    case 'portfolio-tracker': return portfolioTrackerApp(appName);
    case 'wallet-connect':
    default: return walletConnectApp(appName);
  }
}

/** Get the right App component for each fullstack template frontend */
function getFullstackAppComponent(template: FullstackTemplate, appName: string): string {
  switch (template) {
    case 'token-launchpad': return tokenDashboardApp(appName);
    case 'nft-marketplace': return nftMinterApp(appName);
    case 'dao-platform': return walletConnectApp(appName);
    case 'defi-protocol': return defiDashboardApp(appName);
    default: return walletConnectApp(appName);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  PROJECT GENERATION
// ═══════════════════════════════════════════════════════════════════════

function generateContractProject(template: ContractTemplate, projectName: string, vars: Record<string, string>): GeneratedFile[] {
  const contractName = vars.CONTRACT_NAME ?? 'MyContract';
  const info = ALL_TEMPLATES.find((t) => t.id === template)!;
  return [
    { path: `contracts/${contractName}.sol`, content: renderSolTemplate(template, vars) },
    { path: 'hardhat.config.js', content: hardhatConfig() },
    { path: '.env.example', content: envExample() },
    { path: 'scripts/deploy.js', content: deployScript(contractName, template) },
    { path: `test/${contractName}.test.js`, content: testFile(contractName, template) },
    { path: 'README.md', content: contractReadme(projectName, contractName, info.description) },
    { path: 'package.json', content: contractPackageJson(projectName) },
    { path: '.gitignore', content: gitignore() },
  ];
}

function generateDappProject(template: DappTemplate, projectName: string, vars: Record<string, string>): GeneratedFile[] {
  const appName = vars.APP_NAME ?? projectName;
  const info = ALL_TEMPLATES.find((t) => t.id === template)!;

  const appContent = getDappAppComponent(template, appName);

  const files: GeneratedFile[] = [
    { path: 'package.json', content: dappPackageJson(projectName) },
    { path: 'vite.config.ts', content: dappViteConfig() },
    { path: 'tsconfig.json', content: dappTsConfig() },
    { path: 'index.html', content: dappIndexHtml(appName) },
    { path: 'src/main.tsx', content: dappMainTsx() },
    { path: 'src/index.css', content: dappIndexCss() },
    { path: 'src/lib/chain.ts', content: paxeerChainDef() },
    { path: 'src/lib/client.ts', content: viemClientSetup() },
    { path: 'src/App.tsx', content: appContent },
    { path: 'README.md', content: dappReadme(projectName, info.description) },
    { path: '.gitignore', content: gitignore() },
    { path: '.env.example', content: `# Contract addresses\nVITE_TOKEN_ADDRESS=\nVITE_NFT_ADDRESS=\n` },
    { path: 'src/lib/abi.ts', content: `// Paste your contract ABI here after deployment\n// You can get it from artifacts/contracts/YourContract.sol/YourContract.json\nexport const CONTRACT_ABI = [] as const;\n` },

    // DexKit-inspired hooks
    { path: 'src/hooks/useWallet.ts', content: useWalletHook() },
    { path: 'src/hooks/useERC20.ts', content: useERC20Hook() },
    { path: 'src/hooks/useContract.ts', content: useContractHook() },
    { path: 'src/hooks/useTransactions.ts', content: useTransactionsHook() },

    // Shared UI components
    { path: 'src/components/ui.tsx', content: sharedComponents() },
  ];

  return files;
}

function generateFullstackProject(template: FullstackTemplate, projectName: string, vars: Record<string, string>): GeneratedFile[] {
  const appName = vars.APP_NAME ?? projectName;
  const contractName = vars.CONTRACT_NAME ?? 'MyContract';
  const info = ALL_TEMPLATES.find((t) => t.id === template)!;

  // Determine which Solidity template to use
  let solTemplate: ContractTemplate = 'token';
  if (template === 'nft-marketplace') solTemplate = 'nft';
  else if (template === 'dao-platform') solTemplate = 'governance';
  else if (template === 'defi-protocol') solTemplate = 'amm';

  const files: GeneratedFile[] = [
    // Root
    { path: 'package.json', content: contractPackageJson(projectName) },
    { path: 'hardhat.config.js', content: hardhatConfig() },
    { path: '.env.example', content: envExample() + `\n# Frontend (auto-written by deploy script)\nVITE_CONTRACT_ADDRESS=\n` },
    { path: '.gitignore', content: gitignore() },
    { path: 'README.md', content: fullstackReadme(projectName, info.description) },

    // Contracts
    { path: `contracts/${contractName}.sol`, content: renderSolTemplate(solTemplate, { ...vars, CONTRACT_NAME: contractName }) },
    { path: 'scripts/deploy.js', content: fullstackDeployScript(contractName, solTemplate) },
    { path: `test/${contractName}.test.js`, content: testFile(contractName, solTemplate) },

    // Frontend — template-specific App + all hooks + UI components
    { path: 'frontend/package.json', content: dappPackageJson(`${projectName}-frontend`) },
    { path: 'frontend/vite.config.ts', content: dappViteConfig() },
    { path: 'frontend/tsconfig.json', content: dappTsConfig() },
    { path: 'frontend/index.html', content: dappIndexHtml(appName) },
    { path: 'frontend/src/main.tsx', content: dappMainTsx() },
    { path: 'frontend/src/index.css', content: dappIndexCss() },
    { path: 'frontend/src/lib/chain.ts', content: paxeerChainDef() },
    { path: 'frontend/src/lib/client.ts', content: viemClientSetup() },
    { path: 'frontend/src/App.tsx', content: getFullstackAppComponent(template, appName) },
    { path: 'frontend/src/lib/abi.ts', content: `// Auto-generated: paste ABI from artifacts/ after npx hardhat compile\nexport const CONTRACT_ABI = [] as const;\n` },
    { path: 'frontend/src/hooks/useWallet.ts', content: useWalletHook() },
    { path: 'frontend/src/hooks/useERC20.ts', content: useERC20Hook() },
    { path: 'frontend/src/hooks/useContract.ts', content: useContractHook() },
    { path: 'frontend/src/hooks/useTransactions.ts', content: useTransactionsHook() },
    { path: 'frontend/src/components/ui.tsx', content: sharedComponents() },
    { path: 'frontend/.gitignore', content: gitignore() },
  ];

  return files;
}

/**
 * Main entry point — generates a complete project based on scaffold type + template.
 */
export function generateProject(opts: GenerateOptions): GeneratedFile[] {
  const { scaffoldType, template, projectName, variables } = opts;

  switch (scaffoldType) {
    case 'contract':
      return generateContractProject(template as ContractTemplate, projectName, variables);
    case 'dapp':
      return generateDappProject(template as DappTemplate, projectName, variables);
    case 'fullstack':
      return generateFullstackProject(template as FullstackTemplate, projectName, variables);
    default:
      throw new Error(`Unknown scaffold type: ${scaffoldType}`);
  }
}
