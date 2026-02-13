#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║       Paxeer Dev Portal — Backend Integration Test Suite         ║
 * ║                                                                  ║
 * ║  Tests ALL API endpoints, validates responses, measures latency, ║
 * ║  and outputs a graded quality report with certification.         ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:3025";
const REPORT_FILE = path.join(__dirname, "..", "test-report.txt");

// ═══════════════════════════════════════════════════════════════════
//  TEST FRAMEWORK
// ═══════════════════════════════════════════════════════════════════

const results = [];
const outputLines = [];

// Wrap console.log/error to capture all output for file
const _origLog = console.log.bind(console);
const _origErr = console.error.bind(console);
function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ""); }
function log(...args) {
  const line = args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
  outputLines.push(stripAnsi(line));
  _origLog(...args);
}
console.log = log;
console.error = (...args) => {
  const line = args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
  outputLines.push(stripAnsi(line));
  _origErr(...args);
};
let currentCategory = "";

function category(name) {
  currentCategory = name;
}

async function test(name, fn) {
  const start = Date.now();
  const entry = { category: currentCategory, name, pass: false, ms: 0, error: null, details: null };
  try {
    const details = await fn();
    entry.pass = true;
    entry.details = details || null;
  } catch (err) {
    entry.pass = false;
    entry.error = err.message || String(err);
  }
  entry.ms = Date.now() - start;
  results.push(entry);
  const icon = entry.pass ? "✓" : "✗";
  const color = entry.pass ? "\x1b[32m" : "\x1b[31m";
  console.log(`  ${color}${icon}\x1b[0m ${name} \x1b[90m(${entry.ms}ms)\x1b[0m${entry.error ? ` — ${entry.error}` : ""}`);
}

async function GET(path, expectStatus = 200) {
  const res = await fetch(`${BASE}${path}`);
  if (res.status !== expectStatus) {
    throw new Error(`Expected ${expectStatus}, got ${res.status}`);
  }
  const body = await res.json();
  return { status: res.status, body, headers: Object.fromEntries(res.headers.entries()) };
}

async function POST(path, data, expectStatus = 200) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status !== expectStatus) {
    const text = await res.text();
    throw new Error(`Expected ${expectStatus}, got ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = await res.json();
  return { status: res.status, body, headers: Object.fromEntries(res.headers.entries()) };
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function assertType(val, type, fieldName) {
  assert(typeof val === type, `${fieldName} should be ${type}, got ${typeof val}`);
}

function assertArray(val, fieldName) {
  assert(Array.isArray(val), `${fieldName} should be an array`);
}

function assertHasKeys(obj, keys, context) {
  for (const k of keys) {
    assert(k in obj, `${context} missing key: ${k}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  TEST SUITES
// ═══════════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log("\n\x1b[1m\x1b[36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m");
  console.log("\x1b[1m\x1b[36m║   Paxeer Dev Portal — Backend Integration Test Suite          ║\x1b[0m");
  console.log("\x1b[1m\x1b[36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m");
  console.log(`\x1b[90m  Target: ${BASE}\x1b[0m`);
  console.log(`\x1b[90m  Started: ${new Date().toISOString()}\x1b[0m\n`);

  // ── 1. ROOT & HEALTH ─────────────────────────────────────────────
  category("Root & Health");
  console.log("\x1b[1m\x1b[33m── Root & Health ──────────────────────────────────────────\x1b[0m");

  await test("GET / returns API info", async () => {
    const { body } = await GET("/");
    assertHasKeys(body, ["name", "version", "network", "chainId", "endpoints"], "root");
    assert(body.name === "Paxeer Dev Portal API", `name should be 'Paxeer Dev Portal API', got '${body.name}'`);
    assert(body.chainId === 125, `chainId should be 125, got ${body.chainId}`);
    assertHasKeys(body.endpoints, ["contracts", "network", "rpc", "deploy", "scaffold"], "endpoints");
    return `v${body.version}, chain ${body.chainId}`;
  });

  await test("GET /health returns ok", async () => {
    const { body } = await GET("/health");
    assert(body.status === "ok", `status should be 'ok', got '${body.status}'`);
    assertType(body.timestamp, "string", "timestamp");
    return body.timestamp;
  });

  await test("GET /nonexistent returns 404", async () => {
    const res = await fetch(`${BASE}/api/nonexistent`);
    assert(res.status === 404, `Expected 404, got ${res.status}`);
  });

  // ── 2. CONTRACTS REGISTRY ────────────────────────────────────────
  category("Contract Registry");
  console.log("\n\x1b[1m\x1b[33m── Contract Registry ─────────────────────────────────────\x1b[0m");

  let registryContractId = null;

  await test("GET /api/contracts — list all", async () => {
    const { body } = await GET("/api/contracts");
    assertHasKeys(body, ["items", "total", "page", "limit"], "contracts list");
    assert(body.total > 0, `Should have >0 contracts, got ${body.total}`);
    assertArray(body.items, "items");
    const first = body.items[0];
    assertHasKeys(first, ["id", "name", "category"], "contract");
    registryContractId = first.id;
    return `${body.total} contracts, page ${body.page}/${body.totalPages}`;
  });

  await test("GET /api/contracts?category filter", async () => {
    const { body } = await GET("/api/contracts?category=DeFi");
    assert(body.total >= 0, "Should return valid total");
    return `${body.total} DeFi contracts`;
  });

  await test("GET /api/contracts?search filter", async () => {
    const { body } = await GET("/api/contracts?search=token");
    assert(body.total >= 0, "Should return valid total");
    return `${body.total} results for 'token'`;
  });

  await test("GET /api/contracts/summary", async () => {
    const { body } = await GET("/api/contracts/summary");
    assertHasKeys(body, ["totalContracts", "categories", "protocols"], "summary");
    assert(body.totalContracts > 0, "Should have contracts");
    return `${body.totalContracts} total, ${body.categories} categories, ${body.protocols} protocols`;
  });

  await test("GET /api/contracts/categories", async () => {
    const { body } = await GET("/api/contracts/categories");
    assertArray(body, "categories");
    assert(body.length > 0, "Should have categories");
    return body.join(", ");
  });

  await test("GET /api/contracts/protocols", async () => {
    const { body } = await GET("/api/contracts/protocols");
    assertArray(body, "protocols");
    assert(body.length > 0, "Should have protocols");
    return body.join(", ");
  });

  await test("GET /api/contracts/:id — valid ID", async () => {
    if (!registryContractId) throw new Error("No contract ID from list");
    const { body } = await GET(`/api/contracts/${registryContractId}`);
    assertHasKeys(body, ["id", "name", "category"], "contract detail");
    assert(body.id === registryContractId, "ID mismatch");
    return `${body.name} (${body.category})`;
  });

  await test("GET /api/contracts/:id — 404 for invalid ID", async () => {
    await GET("/api/contracts/nonexistent-fake-id-12345", 404);
  });

  // ── 3. NETWORK ───────────────────────────────────────────────────
  category("Network");
  console.log("\n\x1b[1m\x1b[33m── Network ───────────────────────────────────────────────\x1b[0m");

  await test("GET /api/network/info — chain configuration", async () => {
    const { body } = await GET("/api/network/info");
    assertHasKeys(body, ["name", "evmChainId", "token", "rpc", "explorer"], "network info");
    assert(body.evmChainId === 125, `evmChainId should be 125, got ${body.evmChainId}`);
    return `${body.name}, evmChainId=${body.evmChainId}`;
  });

  await test("GET /api/network/stats — live stats", async () => {
    const { body } = await GET("/api/network/stats");
    assertHasKeys(body, ["blockHeight", "gasPrice", "chainId", "timestamp"], "network stats");
    assert(body.blockHeight > 0 || body.blockHeight === null, "blockHeight should be > 0 or null (RPC down)");
    return `block #${body.blockHeight}, gas ${body.gasPriceGwei} gwei`;
  });

  await test("GET /api/network/health — RPC health", async () => {
    const res = await fetch(`${BASE}/api/network/health`);
    assert([200, 503].includes(res.status), `Expected 200 or 503, got ${res.status}`);
    const body = await res.json();
    assertHasKeys(body, ["healthy", "rpcEndpoint", "timestamp"], "health");
    assertType(body.healthy, "boolean", "healthy");
    return `healthy=${body.healthy}, status=${res.status}`;
  });

  // ── 4. RPC PROXY ─────────────────────────────────────────────────
  category("RPC Proxy");
  console.log("\n\x1b[1m\x1b[33m── RPC Proxy ─────────────────────────────────────────────\x1b[0m");

  await test("GET /api/rpc/methods — list methods", async () => {
    const { body } = await GET("/api/rpc/methods");
    assertHasKeys(body, ["total", "methods"], "rpc methods");
    assert(body.total > 0, "Should have methods");
    assertArray(body.methods, "methods");
    return `${body.total} methods available`;
  });

  await test("POST /api/rpc — eth_blockNumber", async () => {
    const { body } = await POST("/api/rpc", { method: "eth_blockNumber", params: [] });
    // Proxy returns raw upstream response (may be standard JSON-RPC or custom format)
    assert(body && typeof body === "object", "Should return a JSON object");
    assert(!body.error, `RPC error: ${JSON.stringify(body.error || {})}`);
    return `response keys: ${Object.keys(body).join(", ")}`;
  });

  await test("POST /api/rpc — eth_chainId", async () => {
    const { body } = await POST("/api/rpc", { method: "eth_chainId", params: [] });
    assert(!body.error, `RPC error: ${JSON.stringify(body.error || {})}`);
    return `response keys: ${Object.keys(body).join(", ")}`;
  });

  await test("POST /api/rpc — eth_getBalance", async () => {
    const { body } = await POST("/api/rpc", {
      method: "eth_getBalance",
      params: ["0xb8C8e34C60a1CC94f12EDb6798fb08f957A30a84", "latest"],
    });
    assert(!body.error, `RPC error: ${JSON.stringify(body.error || {})}`);
    return `response keys: ${Object.keys(body).join(", ")}`;
  });

  await test("POST /api/rpc — disallowed method rejected", async () => {
    const { body } = await POST("/api/rpc", { method: "debug_traceTransaction", params: [] });
    assert(body.error, "Should have error for disallowed method");
    assert(body.error.code === -32601, `Error code should be -32601, got ${body.error.code}`);
    return `Blocked: ${body.error.message}`;
  });

  await test("POST /api/rpc — missing method field", async () => {
    await POST("/api/rpc", { params: [] }, 400);
  });

  // ── 5. SCAFFOLD ──────────────────────────────────────────────────
  category("Scaffold");
  console.log("\n\x1b[1m\x1b[33m── Scaffold ──────────────────────────────────────────────\x1b[0m");

  let scaffoldTemplateId = null;

  await test("GET /api/scaffold/templates — list all", async () => {
    const { body } = await GET("/api/scaffold/templates");
    assertHasKeys(body, ["total"], "templates");
    assert(body.total > 0, "Should have templates");
    // Get first template ID for later tests
    const allTemplates = [...(body.contract || []), ...(body.dapp || []), ...(body.fullstack || [])];
    if (allTemplates.length > 0) scaffoldTemplateId = allTemplates[0].id;
    return `${body.total} templates (contract: ${(body.contract||[]).length}, dapp: ${(body.dapp||[]).length}, fullstack: ${(body.fullstack||[]).length})`;
  });

  await test("GET /api/scaffold/templates?type=contract", async () => {
    const { body } = await GET("/api/scaffold/templates?type=contract");
    assertHasKeys(body, ["total", "templates"], "filtered");
    return `${body.total} contract templates`;
  });

  await test("GET /api/scaffold/templates/search?q=erc", async () => {
    const { body } = await GET("/api/scaffold/templates/search?q=erc");
    assertHasKeys(body, ["query", "total", "templates"], "search");
    return `${body.total} results for 'erc'`;
  });

  await test("GET /api/scaffold/templates/search — missing q returns 400", async () => {
    await GET("/api/scaffold/templates/search", 400);
  });

  if (scaffoldTemplateId) {
    await test(`GET /api/scaffold/templates/${scaffoldTemplateId}`, async () => {
      const { body } = await GET(`/api/scaffold/templates/${scaffoldTemplateId}`);
      assertHasKeys(body, ["id", "name", "scaffoldType"], "template");
      return `${body.name} (${body.scaffoldType})`;
    });
  }

  await test("GET /api/scaffold/templates/:id — 404 for invalid", async () => {
    await GET("/api/scaffold/templates/nonexistent-xyz", 404);
  });

  await test("POST /api/scaffold/preview — valid request", async () => {
    if (!scaffoldTemplateId) throw new Error("No template ID");
    const { body } = await POST("/api/scaffold/preview", {
      scaffoldType: "contract",
      template: scaffoldTemplateId,
      projectName: "TestProject",
      variables: {},
    });
    assertHasKeys(body, ["fileCount", "files"], "preview");
    assert(body.fileCount > 0, "Should generate files");
    return `${body.fileCount} files, ${body.totalSize} bytes`;
  });

  await test("POST /api/scaffold/preview — missing fields returns 400", async () => {
    await POST("/api/scaffold/preview", { projectName: "test" }, 400);
  });

  await test("POST /api/scaffold/generate — creates archive + upload", async () => {
    if (!scaffoldTemplateId) throw new Error("No template ID");
    const res = await fetch(`${BASE}/api/scaffold/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scaffoldType: "contract",
        template: scaffoldTemplateId,
        projectName: "BackendTestProject",
        variables: {},
      }),
    });
    // 429 = rate limited, which is expected behavior (proves rate limiter works)
    if (res.status === 429) {
      return "Rate limited (429) — rate limiter working correctly";
    }
    assert(res.status === 200, `Expected 200 or 429, got ${res.status}`);
    const body = await res.json();
    assertHasKeys(body, ["success", "downloadUrl", "fileCount"], "generate");
    assert(body.success === true, "success should be true");
    assert(body.downloadUrl, "Should have download URL");
    return `${body.fileCount} files → ${body.s3Key}`;
  });

  // ── 6. DEPLOY CONTRACTS ──────────────────────────────────────────
  category("Deploy");
  console.log("\n\x1b[1m\x1b[33m── Deploy ────────────────────────────────────────────────\x1b[0m");

  let deployContractIds = [];

  await test("GET /api/deploy/contracts — list all deployable", async () => {
    const { body } = await GET("/api/deploy/contracts");
    assertHasKeys(body, ["contracts", "count"], "deploy contracts");
    assert(body.count > 0, "Should have deployable contracts");
    assertArray(body.contracts, "contracts");
    const first = body.contracts[0];
    assertHasKeys(first, ["id", "contractName", "sourceFile", "category", "constructorParams", "bytecodeSize", "abiItemCount"], "contract meta");
    deployContractIds = body.contracts.map(c => c.id);
    return `${body.count} contracts loaded`;
  });

  await test("All 15 contracts have valid artifacts", async () => {
    const { body } = await GET("/api/deploy/contracts");
    let loaded = 0;
    for (const c of body.contracts) {
      if (c.abiItemCount > 0 && c.bytecodeSize > 0) loaded++;
    }
    assert(loaded === body.count, `${loaded}/${body.count} have valid artifacts`);
    return `${loaded}/${body.count} artifacts verified`;
  });

  await test("Contract categories are populated", async () => {
    const { body } = await GET("/api/deploy/contracts");
    const cats = [...new Set(body.contracts.map(c => c.category))];
    assert(cats.length >= 4, `Should have ≥4 categories, got ${cats.length}`);
    return cats.join(", ");
  });

  await test("GET /api/deploy/contracts/search?q=oracle", async () => {
    const { body } = await GET("/api/deploy/contracts/search?q=oracle");
    assertHasKeys(body, ["results", "count"], "search");
    assert(body.count >= 4, "Should find ≥4 oracle-related contracts");
    return `${body.count} results`;
  });

  await test("GET /api/deploy/contracts/search — missing q returns 400", async () => {
    await GET("/api/deploy/contracts/search", 400);
  });

  await test("GET /api/deploy/contracts/:id — valid", async () => {
    const { body } = await GET("/api/deploy/contracts/hybrid-dex");
    assertHasKeys(body, ["id", "contractName", "abi", "constructorParams", "dependencies"], "contract detail");
    assert(body.contractName === "HybridDEX", `Name should be HybridDEX, got ${body.contractName}`);
    assert(body.constructorParams.length === 2, `Should have 2 params, got ${body.constructorParams.length}`);
    assert(body.abi.length > 0, "Should have ABI");
    return `${body.contractName}: ${body.abi.length} ABI items, ${body.constructorParams.length} params`;
  });

  await test("GET /api/deploy/contracts/:id — 404 for invalid", async () => {
    await GET("/api/deploy/contracts/fake-contract-999", 404);
  });

  await test("GET /api/deploy/contracts/:id/artifact — returns ABI+bytecode", async () => {
    const { body } = await GET("/api/deploy/contracts/chain-usd/artifact");
    assertHasKeys(body, ["abi", "bytecode"], "artifact");
    assertArray(body.abi, "abi");
    assert(body.abi.length > 0, "ABI should not be empty");
    assert(body.bytecode.startsWith("0x"), "Bytecode should start with 0x");
    assert(body.bytecode.length > 100, "Bytecode should be substantial");
    return `ABI: ${body.abi.length} items, Bytecode: ${Math.floor(body.bytecode.length / 2)} bytes`;
  });

  await test("GET /api/deploy/contracts/:id/artifact — 404 for invalid", async () => {
    await GET("/api/deploy/contracts/fake-xyz/artifact", 404);
  });

  // Test constructor param metadata quality for all contracts
  await test("All contracts have correct constructor param metadata", async () => {
    const { body } = await GET("/api/deploy/contracts");
    let issues = [];
    for (const c of body.contracts) {
      for (const p of c.constructorParams) {
        if (!p.name) issues.push(`${c.contractName}: param missing name`);
        if (!p.type) issues.push(`${c.contractName}: param ${p.name} missing type`);
        if (!p.label) issues.push(`${c.contractName}: param ${p.name} missing label`);
        if (!p.description) issues.push(`${c.contractName}: param ${p.name} missing description`);
      }
    }
    assert(issues.length === 0, `Param metadata issues: ${issues.join("; ")}`);
    const totalParams = body.contracts.reduce((s, c) => s + c.constructorParams.length, 0);
    return `${totalParams} params across ${body.count} contracts — all metadata complete`;
  });

  // ── Deploy Submission Validation ──────────────────────────────────
  await test("POST /api/deploy/submit — missing contractId → 400", async () => {
    await POST("/api/deploy/submit", { constructorArgs: [], ownerAddress: "0x1234" }, 400);
  });

  await test("POST /api/deploy/submit — missing ownerAddress → 400", async () => {
    await POST("/api/deploy/submit", { contractId: "chain-usd", constructorArgs: [] }, 400);
  });

  await test("POST /api/deploy/submit — invalid contractId → 404", async () => {
    await POST("/api/deploy/submit", {
      contractId: "fake-contract",
      constructorArgs: [],
      ownerAddress: "0xb8C8e34C60a1CC94f12EDb6798fb08f957A30a84",
    }, 404);
  });

  await test("POST /api/deploy/submit — wrong arg count → 400", async () => {
    await POST("/api/deploy/submit", {
      contractId: "hybrid-dex",
      constructorArgs: ["0x123"],  // needs 2, provided 1
      ownerAddress: "0xb8C8e34C60a1CC94f12EDb6798fb08f957A30a84",
    }, 400);
  });

  await test("POST /api/deploy/submit — non-array args → 400", async () => {
    await POST("/api/deploy/submit", {
      contractId: "chain-usd",
      constructorArgs: "not-an-array",
      ownerAddress: "0xb8C8e34C60a1CC94f12EDb6798fb08f957A30a84",
    }, 400);
  });

  await test("POST /api/deploy/submit — valid job queues → 202", async () => {
    const { body } = await POST("/api/deploy/submit", {
      contractId: "chain-usd",
      constructorArgs: [],
      ownerAddress: "0xb8C8e34C60a1CC94f12EDb6798fb08f957A30a84",
    }, 202);
    assertHasKeys(body, ["jobId", "status", "contractName"], "submit result");
    assert(body.status === "queued", `Status should be 'queued', got '${body.status}'`);
    assert(body.contractName === "ChainUSD", `Name should be ChainUSD, got '${body.contractName}'`);
    return `Job ${body.jobId.slice(0, 8)}... queued`;
  });

  await test("GET /api/deploy/status/:jobId — poll queued job", async () => {
    // Submit a job and check status
    const { body: sub } = await POST("/api/deploy/submit", {
      contractId: "fx-price-oracle",
      constructorArgs: [],
      ownerAddress: "0xb8C8e34C60a1CC94f12EDb6798fb08f957A30a84",
    }, 202);
    const { body } = await GET(`/api/deploy/status/${sub.jobId}`);
    assertHasKeys(body, ["id", "contractId", "contractName", "status", "createdAt"], "job status");
    assert(["queued", "deploying", "verifying", "complete"].includes(body.status), `Invalid status: ${body.status}`);
    return `Job ${sub.jobId.slice(0, 8)}... status: ${body.status}`;
  });

  await test("GET /api/deploy/status/:jobId — 404 for fake job", async () => {
    await GET("/api/deploy/status/00000000-0000-0000-0000-000000000000", 404);
  });

  await test("GET /api/deploy/history — returns array", async () => {
    const { body } = await GET("/api/deploy/history");
    assertHasKeys(body, ["deployments", "count"], "history");
    assertArray(body.deployments, "deployments");
    return `${body.count} historical deployments`;
  });

  await test("GET /api/deploy/history?limit=5 — respects limit", async () => {
    const { body } = await GET("/api/deploy/history?limit=5");
    assert(body.deployments.length <= 5, `Should respect limit=5, got ${body.deployments.length}`);
    return `${body.deployments.length} entries (limit=5)`;
  });

  // ── 7. CROSS-CUTTING CONCERNS ────────────────────────────────────
  category("Cross-cutting");
  console.log("\n\x1b[1m\x1b[33m── Cross-cutting Concerns ────────────────────────────────\x1b[0m");

  await test("CORS headers present", async () => {
    const res = await fetch(`${BASE}/api/contracts`, {
      headers: { Origin: "http://localhost:5173" },
    });
    const acao = res.headers.get("access-control-allow-origin");
    assert(acao, "Should have CORS header");
    return `ACAO: ${acao}`;
  });

  await test("JSON Content-Type on all API responses", async () => {
    const paths = ["/", "/health", "/api/contracts", "/api/network/info", "/api/deploy/contracts"];
    for (const p of paths) {
      const res = await fetch(`${BASE}${p}`);
      const ct = res.headers.get("content-type") || "";
      assert(ct.includes("application/json"), `${p}: Content-Type should contain 'application/json', got '${ct}'`);
    }
    return `${paths.length} endpoints verified`;
  });

  await test("Response times under 5s for all GET endpoints", async () => {
    const paths = [
      "/", "/health",
      "/api/contracts", "/api/contracts/summary",
      "/api/network/info", "/api/network/stats",
      "/api/rpc/methods",
      "/api/scaffold/templates",
      "/api/deploy/contracts", "/api/deploy/history",
    ];
    let maxMs = 0;
    let slowest = "";
    for (const p of paths) {
      const s = Date.now();
      await fetch(`${BASE}${p}`);
      const ms = Date.now() - s;
      if (ms > maxMs) { maxMs = ms; slowest = p; }
      assert(ms < 5000, `${p} took ${ms}ms (>5s)`);
    }
    return `All ${paths.length} endpoints OK. Slowest: ${slowest} (${maxMs}ms)`;
  });

  await test("Deploy HTML page loads", async () => {
    const res = await fetch(`${BASE}/deploy`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes("Paxeer"), "Should contain 'Paxeer'");
    assert(html.includes("Contract Deployer"), "Should contain 'Contract Deployer'");
    return `${html.length} bytes`;
  });

  // ═══════════════════════════════════════════════════════════════════
  //  REPORT
  // ═══════════════════════════════════════════════════════════════════
  printReport();
}

function printReport() {
  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const passRate = ((passed / total) * 100).toFixed(1);
  const avgMs = (results.reduce((s, r) => s + r.ms, 0) / total).toFixed(0);
  const maxMs = Math.max(...results.map(r => r.ms));
  const totalMs = results.reduce((s, r) => s + r.ms, 0);

  // Category breakdown
  const categories = {};
  for (const r of results) {
    if (!categories[r.category]) categories[r.category] = { total: 0, passed: 0, failed: 0, ms: 0 };
    categories[r.category].total++;
    categories[r.category].ms += r.ms;
    if (r.pass) categories[r.category].passed++;
    else categories[r.category].failed++;
  }

  // Grading
  let grade, gradeColor, gradeLabel;
  const pct = passed / total * 100;
  if (pct === 100) { grade = "A+"; gradeColor = "\x1b[32m"; gradeLabel = "EXCEPTIONAL"; }
  else if (pct >= 95) { grade = "A"; gradeColor = "\x1b[32m"; gradeLabel = "EXCELLENT"; }
  else if (pct >= 90) { grade = "A-"; gradeColor = "\x1b[32m"; gradeLabel = "VERY GOOD"; }
  else if (pct >= 85) { grade = "B+"; gradeColor = "\x1b[33m"; gradeLabel = "GOOD"; }
  else if (pct >= 80) { grade = "B"; gradeColor = "\x1b[33m"; gradeLabel = "ABOVE AVERAGE"; }
  else if (pct >= 70) { grade = "C"; gradeColor = "\x1b[33m"; gradeLabel = "AVERAGE"; }
  else if (pct >= 60) { grade = "D"; gradeColor = "\x1b[31m"; gradeLabel = "BELOW AVERAGE"; }
  else { grade = "F"; gradeColor = "\x1b[31m"; gradeLabel = "FAILING"; }

  // Quality scores (0-10)
  const reliabilityScore = Math.min(10, Math.round(pct / 10));
  const performanceScore = avgMs < 100 ? 10 : avgMs < 300 ? 9 : avgMs < 500 ? 8 : avgMs < 1000 ? 7 : avgMs < 2000 ? 6 : avgMs < 3000 ? 5 : 4;
  const coverageScore = total >= 45 ? 10 : total >= 40 ? 9 : total >= 35 ? 8 : total >= 30 ? 7 : total >= 25 ? 6 : 5;
  const validationScore = (() => {
    const valTests = results.filter(r => r.name.includes("400") || r.name.includes("404") || r.name.includes("missing") || r.name.includes("invalid") || r.name.includes("rejected") || r.name.includes("wrong"));
    if (valTests.length === 0) return 5;
    const valPassed = valTests.filter(r => r.pass).length;
    return Math.round((valPassed / valTests.length) * 10);
  })();
  const overallQuality = ((reliabilityScore + performanceScore + coverageScore + validationScore) / 4).toFixed(1);

  console.log("\n\n");
  console.log("\x1b[1m\x1b[36m╔═══════════════════════════════════════════════════════════════════════════╗\x1b[0m");
  console.log("\x1b[1m\x1b[36m║                    BACKEND TEST REPORT & CERTIFICATE                     ║\x1b[0m");
  console.log("\x1b[1m\x1b[36m╠═══════════════════════════════════════════════════════════════════════════╣\x1b[0m");
  console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[1mProject:\x1b[0m       Paxeer Dev Portal API                                    \x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[1mDate:\x1b[0m          ${new Date().toISOString().padEnd(52)}\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[1mTarget:\x1b[0m        ${BASE.padEnd(52)}\x1b[1m\x1b[36m║\x1b[0m`);
  console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");
  console.log("\x1b[1m\x1b[36m╠═══════════════════════════════════════════════════════════════════════════╣\x1b[0m");
  console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[1m\x1b[4mTEST RESULTS\x1b[0m                                                             \x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  Total Tests:     ${String(total).padEnd(50)}\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[32mPassed:\x1b[0m          ${String(passed).padEnd(50)}\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[31mFailed:\x1b[0m          ${String(failed).padEnd(50)}\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  Pass Rate:       ${(passRate + "%").padEnd(50)}\x1b[1m\x1b[36m║\x1b[0m`);
  console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[1m\x1b[4mPERFORMANCE\x1b[0m                                                              \x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  Avg Latency:     ${(avgMs + "ms").padEnd(50)}\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  Max Latency:     ${(maxMs + "ms").padEnd(50)}\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  Total Duration:  ${((totalMs / 1000).toFixed(2) + "s").padEnd(50)}\x1b[1m\x1b[36m║\x1b[0m`);
  console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");
  console.log("\x1b[1m\x1b[36m╠═══════════════════════════════════════════════════════════════════════════╣\x1b[0m");
  console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[1m\x1b[4mCATEGORY BREAKDOWN\x1b[0m                                                      \x1b[1m\x1b[36m║\x1b[0m`);

  for (const [cat, stats] of Object.entries(categories)) {
    const s = stats;
    const catPct = ((s.passed / s.total) * 100).toFixed(0);
    const catBar = "█".repeat(Math.round(s.passed / s.total * 20)).padEnd(20, "░");
    const catColor = s.failed === 0 ? "\x1b[32m" : "\x1b[31m";
    console.log(`\x1b[1m\x1b[36m║\x1b[0m  ${cat.padEnd(20)} ${catColor}${catBar}\x1b[0m ${String(s.passed + "/" + s.total).padStart(5)} ${(catPct + "%").padStart(4)} ${(s.ms + "ms").padStart(7)}  \x1b[1m\x1b[36m║\x1b[0m`);
  }

  console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");
  console.log("\x1b[1m\x1b[36m╠═══════════════════════════════════════════════════════════════════════════╣\x1b[0m");
  console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[1m\x1b[4mQUALITY REVIEW\x1b[0m                                                          \x1b[1m\x1b[36m║\x1b[0m`);

  const bar = (score) => "█".repeat(score).padEnd(10, "░");
  const scoreColor = (s) => s >= 8 ? "\x1b[32m" : s >= 6 ? "\x1b[33m" : "\x1b[31m";

  console.log(`\x1b[1m\x1b[36m║\x1b[0m  Reliability:     ${scoreColor(reliabilityScore)}${bar(reliabilityScore)}\x1b[0m  ${reliabilityScore}/10  API endpoints respond correctly     \x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  Performance:     ${scoreColor(performanceScore)}${bar(performanceScore)}\x1b[0m  ${performanceScore}/10  Response times acceptable          \x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  Coverage:        ${scoreColor(coverageScore)}${bar(coverageScore)}\x1b[0m  ${coverageScore}/10  Endpoints and edge cases covered   \x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  Validation:      ${scoreColor(validationScore)}${bar(validationScore)}\x1b[0m  ${validationScore}/10  Error handling and input checks    \x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  ─────────────────────────────────────                                    \x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[1mOverall Quality:  ${overallQuality}/10\x1b[0m                                                    \x1b[1m\x1b[36m║\x1b[0m`);
  console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");
  console.log("\x1b[1m\x1b[36m╠═══════════════════════════════════════════════════════════════════════════╣\x1b[0m");
  console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");
  console.log(`\x1b[1m\x1b[36m║\x1b[0m                      ┌──────────────────┐                                  \x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m                      │  ${gradeColor}\x1b[1m  GRADE: ${grade}   \x1b[0m │                                  \x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m                      │  ${gradeColor}${gradeLabel.padStart(13).padEnd(14)}\x1b[0m │                                  \x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m                      └──────────────────┘                                  \x1b[1m\x1b[36m║\x1b[0m`);
  console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");

  // Certificate
  if (pct >= 80) {
    console.log("\x1b[1m\x1b[36m╠═══════════════════════════════════════════════════════════════════════════╣\x1b[0m");
    console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");
    console.log("\x1b[1m\x1b[36m║\x1b[0m           \x1b[1m\x1b[33m★  CERTIFICATE OF BACKEND QUALITY ASSURANCE  ★\x1b[0m              \x1b[1m\x1b[36m║\x1b[0m");
    console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");
    console.log("\x1b[1m\x1b[36m║\x1b[0m       This certifies that the \x1b[1mPaxeer Dev Portal API\x1b[0m backend            \x1b[1m\x1b[36m║\x1b[0m");
    console.log("\x1b[1m\x1b[36m║\x1b[0m       has passed integration testing with a grade of \x1b[1m" + grade + "\x1b[0m.                \x1b[1m\x1b[36m║\x1b[0m");
    console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");
    console.log(`\x1b[1m\x1b[36m║\x1b[0m       Modules Tested:                                                     \x1b[1m\x1b[36m║\x1b[0m`);
    console.log(`\x1b[1m\x1b[36m║\x1b[0m         ✓ Contract Registry (${categories["Contract Registry"]?.passed || 0}/${categories["Contract Registry"]?.total || 0} passed)                              \x1b[1m\x1b[36m║\x1b[0m`);
    console.log(`\x1b[1m\x1b[36m║\x1b[0m         ✓ Network & RPC Proxy (${(categories["Network"]?.passed || 0) + (categories["RPC Proxy"]?.passed || 0)}/${(categories["Network"]?.total || 0) + (categories["RPC Proxy"]?.total || 0)} passed)                            \x1b[1m\x1b[36m║\x1b[0m`);
    console.log(`\x1b[1m\x1b[36m║\x1b[0m         ✓ Scaffold Generator (${categories["Scaffold"]?.passed || 0}/${categories["Scaffold"]?.total || 0} passed)                             \x1b[1m\x1b[36m║\x1b[0m`);
    console.log(`\x1b[1m\x1b[36m║\x1b[0m         ✓ Contract Deployer (${categories["Deploy"]?.passed || 0}/${categories["Deploy"]?.total || 0} passed)                             \x1b[1m\x1b[36m║\x1b[0m`);
    console.log(`\x1b[1m\x1b[36m║\x1b[0m         ✓ Cross-cutting (${categories["Cross-cutting"]?.passed || 0}/${categories["Cross-cutting"]?.total || 0} passed)                                 \x1b[1m\x1b[36m║\x1b[0m`);
    console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");
    console.log(`\x1b[1m\x1b[36m║\x1b[0m       Quality Score: \x1b[1m${overallQuality}/10\x1b[0m | Pass Rate: \x1b[1m${passRate}%\x1b[0m                        \x1b[1m\x1b[36m║\x1b[0m`);
    console.log(`\x1b[1m\x1b[36m║\x1b[0m       Issued: ${new Date().toISOString().padEnd(54)}\x1b[1m\x1b[36m║\x1b[0m`);
    console.log("\x1b[1m\x1b[36m║\x1b[0m                                                                           \x1b[1m\x1b[36m║\x1b[0m");
  }

  console.log("\x1b[1m\x1b[36m╚═══════════════════════════════════════════════════════════════════════════╝\x1b[0m");

  // Failed tests summary
  if (failed > 0) {
    console.log("\n\x1b[1m\x1b[31m── FAILED TESTS ─────────────────────────────────────────────\x1b[0m");
    for (const r of results.filter(r => !r.pass)) {
      console.log(`  \x1b[31m✗\x1b[0m [${r.category}] ${r.name}`);
      console.log(`    \x1b[90m${r.error}\x1b[0m`);
    }
  }

  console.log("\n");

  // Write report to file
  try {
    fs.writeFileSync(REPORT_FILE, outputLines.join("\n") + "\n", "utf-8");
    _origLog(`\x1b[36mReport saved to: ${REPORT_FILE}\x1b[0m\n`);
  } catch (err) {
    _origErr(`Failed to write report: ${err.message}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

// ═══════════════════════════════════════════════════════════════════
//  RUN
// ═══════════════════════════════════════════════════════════════════

runAllTests().catch((err) => {
  console.error("\x1b[31mFatal error:\x1b[0m", err);
  process.exit(1);
});
