import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Contract info from the SDK index */
export interface ContractInfo {
  id: string;
  name: string;
  fileName: string;
  path: string;
  type: 'contract' | 'interface' | 'library' | 'abstract';
  category: number;
  subCategory: string;
  protocol: string;
  license: string;
  solidityVersion: string;
  imports: string[];
  size: number;
  lines: number;
}

export interface ContractIndex {
  version: string;
  generatedAt: string;
  totalContracts: number;
  categories: Record<string, { id: number; count: number; contracts: string[] }>;
  protocols: Record<string, { count: number; contracts: string[] }>;
  contracts: Record<string, ContractInfo>;
}

const CATEGORY_NAMES: Record<number, string> = {
  0: 'CORE',
  1: 'TOKEN',
  2: 'ORACLE',
  3: 'GOVERNANCE',
  4: 'DEFI',
  5: 'SECURITY',
  6: 'LIBRARY',
  7: 'INTERFACE',
  8: 'PERIPHERY',
  9: 'UTILITY',
  10: 'TEST',
};

// Bundled data — works both locally and on Railway
const DATA_PATH = resolve(__dirname, '../../data');
const REGISTRY_PATH = resolve(DATA_PATH, 'registry');

let _index: ContractIndex | null = null;

function loadIndex(): ContractIndex {
  if (!_index) {
    const raw = readFileSync(resolve(DATA_PATH, 'contract-index.json'), 'utf-8');
    _index = JSON.parse(raw) as ContractIndex;
  }
  return _index;
}

export function getSummary() {
  const idx = loadIndex();
  const categories = Object.entries(idx.categories).map(([name, data]) => ({
    name,
    id: data.id,
    count: data.count,
  }));
  const protocols = Object.entries(idx.protocols).map(([name, data]) => ({
    name,
    count: data.count,
  }));
  return {
    version: idx.version,
    generatedAt: idx.generatedAt,
    totalContracts: idx.totalContracts,
    categories,
    protocols,
  };
}

export function listContracts(opts: {
  category?: string;
  protocol?: string;
  type?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const idx = loadIndex();
  let contracts = Object.values(idx.contracts);

  if (opts.category) {
    const catUpper = opts.category.toUpperCase();
    const catData = idx.categories[catUpper];
    if (catData) {
      const contractIds = new Set(catData.contracts);
      contracts = contracts.filter((c) => contractIds.has(c.id));
    }
  }

  if (opts.protocol) {
    const proto = opts.protocol.toLowerCase();
    contracts = contracts.filter((c) => c.protocol.toLowerCase().includes(proto));
  }

  if (opts.type) {
    contracts = contracts.filter((c) => c.type === opts.type);
  }

  if (opts.search) {
    const q = opts.search.toLowerCase();
    contracts = contracts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.fileName.toLowerCase().includes(q) ||
        c.protocol.toLowerCase().includes(q)
    );
  }

  const total = contracts.length;
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;

  const items = contracts.slice(offset, offset + limit).map((c) => ({
    id: c.id,
    name: c.name,
    fileName: c.fileName,
    type: c.type,
    category: CATEGORY_NAMES[c.category] ?? 'UNKNOWN',
    protocol: c.protocol,
    solidityVersion: c.solidityVersion,
    lines: c.lines,
    size: c.size,
  }));

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    items,
  };
}

export function getContract(id: string) {
  const idx = loadIndex();
  const contract = idx.contracts[id];
  if (!contract) return null;

  let source: string | null = null;
  try {
    // Try bundled registry folder (organized by category)
    const catName = CATEGORY_NAMES[contract.category] ?? 'UNKNOWN';
    const fileName = contract.fileName;
    const registryPath = resolve(REGISTRY_PATH, catName, fileName);
    source = readFileSync(registryPath, 'utf-8');
  } catch {
    // source file may not exist in all cases
  }

  return {
    ...contract,
    category: CATEGORY_NAMES[contract.category] ?? 'UNKNOWN',
    source,
  };
}

export function getCategories() {
  const idx = loadIndex();
  return Object.entries(idx.categories).map(([name, data]) => ({
    name,
    id: data.id,
    count: data.count,
  }));
}

export function getProtocols() {
  const idx = loadIndex();
  return Object.entries(idx.protocols).map(([name, data]) => ({
    name,
    count: data.count,
  }));
}
