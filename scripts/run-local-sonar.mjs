import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const host = process.env.SONAR_HOST_URL || "http://127.0.0.1:9000";
const projectKey = "pw-grq-local";
const suppliedToken = process.env.SONAR_TOKEN;
const adminPassword = process.env.SONAR_ADMIN_PASSWORD;
const tokenName = `${projectKey}-${process.pid}`;
let token = suppliedToken || null;
let temporaryToken = false;

function authHeader(secret, kind = "token") {
  if (kind === "admin") {
    return `Basic ${Buffer.from(`admin:${secret}`).toString("base64")}`;
  }
  return `Bearer ${secret}`;
}

async function request(route, options = {}, authorization) {
  const response = await fetch(`${host}${route}`, {
    ...options,
    headers: { ...(options.headers || {}), authorization }
  });
  if (!response.ok) {
    throw new Error(`SonarQube ${route} returned HTTP ${response.status}.`);
  }
  const body = await response.text();
  return body ? JSON.parse(body) : {};
}

async function form(route, values, authorization) {
  return request(route, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values)
  }, authorization);
}

if (!token && !adminPassword) {
  throw new Error(
    "Set SONAR_TOKEN, or set SONAR_ADMIN_PASSWORD to use a short-lived local analysis token."
  );
}

try {
  if (!token) {
    const adminAuth = authHeader(adminPassword, "admin");
    const generated = await form(
      "/api/user_tokens/generate",
      { name: tokenName, type: "GLOBAL_ANALYSIS_TOKEN" },
      adminAuth
    );
    token = generated.token;
    temporaryToken = true;
    if (typeof token !== "string" || token.length < 20) {
      throw new Error("SonarQube did not issue an analysis token.");
    }
  }

  const scannerOutput = execFileSync("sonar-scanner", [
    `-Dsonar.host.url=${host}`,
    `-Dsonar.projectVersion=${execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, encoding: "utf8" }).trim()}`
  ], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SONAR_TOKEN: token },
    maxBuffer: 10 * 1024 * 1024,
    timeout: 180_000
  });

  const taskFile = readFileSync(path.join(root, ".scannerwork/report-task.txt"), "utf8");
  const taskRecord = Object.fromEntries(
    taskFile.trim().split("\n").map((line) => line.split(/=(.*)/s).slice(0, 2))
  );
  const tokenAuth = authHeader(token);
  const readAuth = adminPassword ? authHeader(adminPassword, "admin") : tokenAuth;
  let task;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    task = (await request(
      `/api/ce/task?id=${encodeURIComponent(taskRecord.ceTaskId)}`,
      {},
      tokenAuth
    )).task;
    if (["SUCCESS", "FAILED", "CANCELED"].includes(task?.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (task?.status !== "SUCCESS") {
    throw new Error(`SonarQube compute task ended ${task?.status || "without a terminal state"}.`);
  }

  const [issues, hotspots, gate, measures] = await Promise.all([
    request(`/api/issues/search?componentKeys=${projectKey}&resolved=false&ps=500`, {}, readAuth),
    request(`/api/hotspots/search?projectKey=${projectKey}&status=TO_REVIEW&ps=500`, {}, readAuth),
    request(`/api/qualitygates/project_status?projectKey=${projectKey}`, {}, readAuth),
    request(`/api/measures/component?component=${projectKey}&metricKeys=coverage,duplicated_lines_density,bugs,vulnerabilities,security_hotspots,code_smells,ncloc`, {}, readAuth)
  ]);
  const summary = {
    revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    dirty: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0,
    task: { id: task.id, status: task.status, analysisId: task.analysisId },
    issueCount: issues.paging?.total ?? issues.issues?.length ?? 0,
    hotspotCount: hotspots.paging?.total ?? hotspots.hotspots?.length ?? 0,
    qualityGate: gate.projectStatus?.status || "UNKNOWN",
    measures: measures.component?.measures || [],
    scannerCompleted: scannerOutput.includes("EXECUTION SUCCESS"),
    capturedAt: new Date().toISOString()
  };
  mkdirSync(path.join(root, ".bob/local"), { recursive: true });
  writeFileSync(
    path.join(root, ".bob/local/sonarqube.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    { mode: 0o600 }
  );
  console.log(JSON.stringify(summary, null, 2));
  if (summary.issueCount || summary.hotspotCount || !summary.scannerCompleted) process.exitCode = 1;
} finally {
  if (temporaryToken) {
    await form(
      "/api/user_tokens/revoke",
      { name: tokenName },
      authHeader(adminPassword, "admin")
    );
  }
}
