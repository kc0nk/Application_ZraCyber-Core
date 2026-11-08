// Tujuan file: Berisi pemeriksaan otomatis untuk API Desktop.
const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApiServer } = require("../src/api.cjs");

// ============================================================================
// TEST SERVER HELPER
// ============================================================================
async function startServer({ receiveAnomalyDevice } = {}) {
  const jobs = [];
  const server = createApiServer({
    getToken: () => "test-token-with-sufficient-length",
    getHistory: () => jobs,
    getJob: (id) => jobs.find((job) => job.id === id),
    addJob: async (job) => {
      const item = { ...job, id: `00000000-0000-4000-8000-${String(jobs.length + 1).padStart(12, "0")}`, createdAt: new Date().toISOString() };
      jobs.unshift(item);
      return item;
    },
    completeApkJob: async (id, result) => {
      const item = jobs.find((job) => job.id === id);
      const { status: _status, ...safeResult } = result;
      Object.assign(item, { title: "APK mobile static inspection complete", subtitle: result.summary, status: "completed", result: safeResult });
      return item;
    },
    receiveAnomalyDevice,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, jobs, url: `http://127.0.0.1:${server.address().port}` };
}

// ============================================================================
// TEST: DEVICE LOCATION CONSENT
// ============================================================================
test("anomaly device location is accepted without a token only with explicit sharing consent", async (context) => {
  const updates = [];
  const { server, url } = await startServer({
    receiveAnomalyDevice: async (identity, ip, consent) => {
      updates.push({ identity, ip, consent });
      return true;
    },
  });
  context.after(() => server.close());
  const headers = {
    "Content-Type": "application/json",
    "X-Zra-Device-Id": "00000000-0000-4000-8000-000000000001",
    "X-Zra-Device-Name": "Test phone",
    "X-Zra-Location-Shared": "true",
    "X-Zra-Latitude": "47.6",
    "X-Zra-Longitude": "-122.3",
  };
  const present = await fetch(`${url}/devices/anomaly`, {
    method: "POST",
    headers,
    body: JSON.stringify({ consent: false }),
  });
  assert.equal(present.status, 200);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].consent, false);
  // Identity from headers is preserved, but location should be null if not shared
  assert.equal(updates[0].identity.id, headers["X-Zra-Device-Id"]);

  const reported = await fetch(`${url}/devices/anomaly`, {
    method: "POST",
    headers,
    body: JSON.stringify({ consent: true }),
  });
  assert.equal(reported.status, 200);
  assert.deepEqual(await reported.json(), { received: true, status: "anomalous" });
  assert.equal(updates.length, 2);
  assert.equal(updates[1].identity.id, headers["X-Zra-Device-Id"]);
  assert.equal(updates[1].identity.location.latitude, 47.6);
  assert.equal(updates[1].consent, true);
  assert.equal(updates[1].ip, "127.0.0.1");

  const cleared = await fetch(`${url}/devices/anomaly`, {
    method: "POST",
    headers: { ...headers, "X-Zra-Location-Shared": "false" },
    body: JSON.stringify({ consent: false }),
  });
  assert.equal(cleared.status, 200);
  assert.equal(updates.length, 3);
  assert.equal(updates[2].consent, false);
  assert.equal(updates[2].identity.location, null);
});

// ============================================================================
// TEST: DEVICE BLOCKING AND RATE LIMIT
// ============================================================================
test("anomaly reports are rate-limited and blocked device IDs are refused", async (context) => {
  const { server, url } = await startServer({ receiveAnomalyDevice: async () => false });
  context.after(() => server.close());
  const headers = {
    "Content-Type": "application/json",
    "X-Zra-Device-Id": "00000000-0000-4000-8000-000000000002",
    "X-Zra-Location-Shared": "true",
    "X-Zra-Latitude": "47.6",
    "X-Zra-Longitude": "-122.3",
  };
  const blocked = await fetch(`${url}/devices/anomaly`, {
    method: "POST",
    headers,
    body: JSON.stringify({ consent: true }),
  });
  assert.equal(blocked.status, 423);

  const { server: rateServer, url: rateUrl } = await startServer({ receiveAnomalyDevice: async () => true });
  context.after(() => rateServer.close());
  let lastResponse;
  for (let attempt = 0; attempt < 31; attempt += 1) {
    lastResponse = await fetch(`${rateUrl}/devices/anomaly`, {
      method: "POST",
      headers,
      body: JSON.stringify({ consent: true }),
    });
  }
  assert.equal(lastResponse.status, 429);
});

// ============================================================================
// TEST: BEARER TOKEN REQUIRED
// ============================================================================
test("requires the bearer token for all API resources", async (context) => {
  const { server, url } = await startServer();
  context.after(() => server.close());

  const response = await fetch(`${url}/health`);
  assert.equal(response.status, 401);
});

// ============================================================================
// TEST: WEB SCAN AUTHORIZATION
// ============================================================================
test("requires explicit authorization for passive web scan jobs", async (context) => {
  const { server, url } = await startServer();
  context.after(() => server.close());
  const headers = { Authorization: "Bearer test-token-with-sufficient-length", "Content-Type": "application/json", "X-Zra-Device-Id": "00000000-0000-4000-8000-000000000001" };
  const base = { kind: "SCAN", title: "Passive web scan queued", subtitle: "https://lab.example.test", payload: { action: "scan_web_metadata", target: "https://lab.example.test", authMode: "none" } };

  const refused = await fetch(`${url}/jobs`, { method: "POST", headers, body: JSON.stringify(base) });
  assert.equal(refused.status, 400);

  const accepted = await fetch(`${url}/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...base, payload: { ...base.payload, authorized: "true" } }),
  });
  assert.equal(accepted.status, 202);
});

// ============================================================================
// TEST: CREDENTIAL REDACTION
// ============================================================================
test("metadata login and registration redact credentials from jobs and history", async (context) => {
  const { server, jobs, url } = await startServer();
  context.after(() => server.close());
  const headers = { Authorization: "Bearer test-token-with-sufficient-length", "Content-Type": "application/json", "X-Zra-Device-Id": "00000000-0000-4000-8000-000000000001" };
  const payload = {
    action: "scan_web_metadata",
    target: "https://owned.example.test/",
    authUrl: "https://owned.example.test/login",
    authMode: "login",
    authorized: "true",
    accountLabel: "QA staging user",
    username: "qa@example.test",
    password: "test-only-secret",
  };

  const rejectedRegistration = await fetch(`${url}/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      kind: "SCAN",
      title: "Metadata audit",
      subtitle: payload.target,
      payload: { ...payload, authMode: "register", confirmRegistration: undefined },
    }),
  });
  assert.equal(rejectedRegistration.status, 400);

  const accepted = await fetch(`${url}/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ kind: "SCAN", title: "Metadata audit", subtitle: payload.target, payload }),
  });
  assert.equal(accepted.status, 202);
  const body = await accepted.json();
  assert.equal(body.item.progress, 0);
  assert.equal(body.item.payload.accountLabel, "QA staging user");
  assert.equal("username" in body.item.payload, false);
  assert.equal("password" in body.item.payload, false);
  assert.equal(jobs[0].payload.username, undefined);
  assert.equal(jobs[0].payload.password, undefined);

  const history = await fetch(`${url}/history`, { headers });
  const serializedHistory = JSON.stringify(await history.json());
  assert.equal(serializedHistory.includes("qa@example.test"), false);
  assert.equal(serializedHistory.includes("test-only-secret"), false);
});

// ============================================================================
// TEST: RETIRED WEB ASSESSMENT REJECTION
// ============================================================================
test("retired safe web assessment jobs are rejected", async (context) => {
  const { server, jobs, url } = await startServer();
  context.after(() => server.close());
  const headers = { Authorization: "Bearer test-token-with-sufficient-length", "Content-Type": "application/json", "X-Zra-Device-Id": "00000000-0000-4000-8000-000000000001" };
  const baseJob = {
    kind: "SCAN",
    title: "Safe web assessment",
    subtitle: "https://owned.example.test/",
    payload: {
      action: "safe_web_assessment",
      target: "https://owned.example.test/",
      authorized: "true",
      paths: JSON.stringify(["/", "/account"]),
    },
  };

  for (const payload of [
    { ...baseJob.payload, authorized: "false" },
    { ...baseJob.payload, paths: JSON.stringify(["https://other.example.test/"]) },
    { ...baseJob.payload, paths: JSON.stringify(["/delete-account"]) },
  ]) {
    const rejected = await fetch(`${url}/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...baseJob, payload }),
    });
    assert.equal(rejected.status, 400, `${JSON.stringify(payload)}: ${rejected.status} ${await rejected.text()}`);
  }

  const accepted = await fetch(`${url}/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify(baseJob),
  });
  assert.equal(accepted.status, 400);
});

// ============================================================================
// TEST: UNSUPPORTED JOB REJECTION
// ============================================================================
test("rejects unsupported job kinds, unsafe payloads, and attempted executed statuses", async (context) => {
  const { server, url } = await startServer();
  context.after(() => server.close());
  const headers = { Authorization: "Bearer test-token-with-sufficient-length", "Content-Type": "application/json", "X-Zra-Device-Id": "00000000-0000-4000-8000-000000000001" };

  for (const job of [
    { kind: "UNKNOWN", title: "test", subtitle: "" },
    { kind: "AI AGENT", title: "Metadata capture queued", subtitle: "https://lab.example.test", payload: { action: "capture_metadata", url: "https://lab.example.test" } },
    { kind: "EXPLOIT", title: "test", subtitle: "https://lab.example.test", status: "completed" },
    { kind: "EXPLOIT", title: "test", subtitle: "https://lab.example.test", payload: { action: "run_arbitrary_payload", target: "https://lab.example.test", scenario: "Input validation" } },
    { kind: "CRYPTO", title: "test", subtitle: "lab", payload: { action: "encrypt", method: "AES-256", plaintext: "secret" } },
    { kind: "SCAN", title: "test", subtitle: "sample.apk", payload: { action: "scan_file", target: "sample.apk", session: "none" } },
    { kind: "SCAN", title: "test", subtitle: "sample.apk", payload: { action: "scan_apk_mobile", name: "sample.apk", size: "64", data: Buffer.alloc(64).toString("base64") } },
    { kind: "CRYPTO", title: "test", subtitle: "lab", payload: { action: "encrypt", method: "AES-256-GCM", plaintext: "hello", password: "password123", status: "completed" } },
  ]) {
    const response = await fetch(`${url}/jobs`, { method: "POST", headers, body: JSON.stringify(job) });
    assert.equal(response.status, 400);
  }
});

// ============================================================================
// TEST: APK JOB LIFECYCLE
// ============================================================================
test("APK job sends metadata only and accepts the completed mobile scan result", async (context) => {
  const { server, jobs, url } = await startServer();
  context.after(() => server.close());
  const headers = { Authorization: "Bearer test-token-with-sufficient-length", "Content-Type": "application/json", "X-Zra-Device-Id": "00000000-0000-4000-8000-000000000001" };
  const response = await fetch(`${url}/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      kind: "SCAN",
      title: "APK inspection request",
      subtitle: "sample.apk",
      payload: { action: "scan_apk_mobile", name: "sample.apk", size: "64" },
    }),
  });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.item.status, "running");
  assert.deepEqual(body.item.payload, { action: "scan_apk_mobile", name: "sample.apk", size: "64" });

  const premature = await fetch(`${url}/jobs/${body.item.id}/result`, {
    method: "POST",
    headers,
    body: JSON.stringify({ status: "completed", result: {} }),
  });
  assert.equal(premature.status, 400);

  jobs[0].status = "running";
  const result = {
    summary: "Pemeriksaan struktur lokal: 2 entri, 0 indikator yang perlu ditinjau.",
    findings: [{ check: "Android manifest", severity: "info", status: "present", detail: "Manifest ditemukan.", recommendation: "" }],
    file: { name: "sample.apk", size: 64, sha256: "a".repeat(64) },
  };
  const completed = await fetch(`${url}/jobs/${body.item.id}/result`, {
    method: "POST",
    headers,
    body: JSON.stringify({ status: "completed", result }),
  });
  assert.equal(completed.status, 200);
  const completedItem = await completed.json();
  assert.equal(completedItem.item.status, "completed");
  assert.deepEqual(completedItem.item.result, result);
});

// ============================================================================
// TEST: APK IPA EXE STATIC SCAN
// ============================================================================
test("app scan processes APK IPA and EXE uploads without returning sample bytes", async (context) => {
  const token = "static-app-test-token";
  const server = createApiServer({
    getToken: () => [token],
    authorizeDevice: async () => ({ allowed: true }),
    isDeviceBlocked: () => false,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const sample = Buffer.alloc(512);
  sample.write("MZ", 0, "ascii");
  sample.writeUInt32LE(64, 0x3c);
  sample.write("PE\0\0", 64, "binary");
  sample.writeUInt16LE(0x8664, 68);
  sample.writeUInt16LE(1, 70);
  sample.writeUInt16LE(0xf0, 84);
  sample.writeUInt16LE(0x20b, 88);
  sample.writeUInt16LE(0x140, 158);
  const makeZip = (entryNames) => {
    const localRecords = [];
    const centralRecords = [];
    let localOffset = 0;
    for (const entryName of entryNames) {
      const nameBytes = Buffer.from(entryName);
      const local = Buffer.alloc(30 + nameBytes.length);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(nameBytes.length, 26);
      nameBytes.copy(local, 30);
      localRecords.push(local);

      const central = Buffer.alloc(46 + nameBytes.length);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(nameBytes.length, 28);
      central.writeUInt32LE(localOffset, 42);
      nameBytes.copy(central, 46);
      centralRecords.push(central);
      localOffset += local.length;
    }
    const centralDirectory = Buffer.concat(centralRecords);
    const endRecord = Buffer.alloc(22);
    endRecord.writeUInt32LE(0x06054b50, 0);
    endRecord.writeUInt16LE(entryNames.length, 8);
    endRecord.writeUInt16LE(entryNames.length, 10);
    endRecord.writeUInt32LE(centralDirectory.length, 12);
    endRecord.writeUInt32LE(localOffset, 16);
    return Buffer.concat([...localRecords, centralDirectory, endRecord]);
  };
  const scanSample = (name, buffer) => fetch(`http://127.0.0.1:${server.address().port}/tools/app/scan`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, size: buffer.length, data: buffer.toString("base64") }),
  });
  const formData = new FormData();
  formData.append("appName", "sample");
  formData.append("file", new Blob([sample], { type: "application/octet-stream" }), "sample.exe");
  const response = await fetch(`http://127.0.0.1:${server.address().port}/tools/app/scan`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.scanType, "deep-aggressive-exe-audit");
  assert.equal(report.file.size, sample.length);
  assert.match(report.file.sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(report).includes(sample.toString("base64")), false);
  assert.match(report.limitations, /sampel tidak dipicu untuk berjalan/i);

  const apkResponse = await scanSample("sample.apk", makeZip(["AndroidManifest.xml", "classes.dex"]));
  assert.equal(apkResponse.status, 200);
  const apkReport = await apkResponse.json();
  assert.equal(apkReport.scanType, "deep-aggressive-apk-audit");
  assert.equal(apkReport.file.name, "sample.apk");

  const ipaResponse = await scanSample("sample.ipa", makeZip(["Payload/Test.app/Info.plist"]));
  assert.equal(ipaResponse.status, 200);
  const ipaReport = await ipaResponse.json();
  assert.equal(ipaReport.scanType, "deep-aggressive-ipa-audit");
  assert.equal(ipaReport.file.name, "sample.ipa");
});

// ============================================================================
// TEST: PASSIVE OSINT DOMAIN DNS RECORDS
// ============================================================================
test("OSINT domain route returns bounded DNS metadata without target probing", async (context) => {
  const token = "osint-domain-test-token";
  const server = createApiServer({
    getToken: () => [token],
    authorizeDevice: async () => ({ allowed: true }),
    isDeviceBlocked: () => false,
    domainResolvers: {
      resolve4: async () => ["203.0.113.8"],
      resolve6: async () => [],
      resolveMx: async () => [{ exchange: "mail.example.com", priority: 10 }],
      resolveNs: async () => ["ns1.example.com"],
      resolveTxt: async () => [["v=spf1 -all"]],
      resolveCaa: async () => [{ critical: 0, issue: "ca.example" }],
    },
    domainRdapLookup: async () => ({
      registeredAt: "2020-01-02T00:00:00Z",
      expiresAt: "2030-01-02T00:00:00Z",
      updatedAt: "2025-01-02T00:00:00Z",
      status: ["active"],
      nameservers: ["ns1.example.com"],
    }),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const response = await fetch(`http://127.0.0.1:${server.address().port}/tools/osint`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ category: "domain", target: "https://example.com/" }),
  });
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.domain, "example.com");
  assert.equal(report.scanType, "passive-domain-dns");
  assert.deepEqual(report.records.A, ["203.0.113.8"]);
  assert.equal(report.records.TXT[0], "v=spf1 -all");
  assert.equal(report.registration.registeredAt, "2020-01-02T00:00:00Z");
  assert.equal(report.registration.expiresAt, "2030-01-02T00:00:00Z");
  assert.equal("registrant" in report.registration, false);
  assert.match(report.limitations, /Tidak melakukan.*pemindaian port/s);

  const linksResponse = await fetch(`http://127.0.0.1:${server.address().port}/tools/osint`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "identity",
      target: [
        "https://www.instagram.com/sample_user/?utm_source=share",
        "https://www.linkedin.com/in/sample-person-123?utm_source=share",
        "https://id.scribd.com/document/123456789/sample-document?utm_source=share",
      ].join("\n"),
    }),
  });
  assert.equal(linksResponse.status, 200);
  const linksReport = await linksResponse.json();
  assert.equal(linksReport.scanType, "provided-profile-links-only");
  assert.deepEqual(linksReport.profiles.map((profile) => profile.platform), ["Instagram", "LinkedIn", "Scribd"]);
  assert.ok(linksReport.profiles.every((profile) => !profile.url.includes("utm_")));
  assert.match(linksReport.limitations, /tidak mengunjungi halaman/);

  const unapprovedLinkResponse = await fetch(`http://127.0.0.1:${server.address().port}/tools/osint`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ category: "identity", target: "https://example.net/person" }),
  });
  assert.equal(unapprovedLinkResponse.status, 400);
});

// ============================================================================
// TEST: RETIRED WIFI SURVEY REJECTION
// ============================================================================
test("retired Wi-Fi survey jobs are rejected", async (context) => {
  const { server, url } = await startServer();
  context.after(() => server.close());
  const headers = {
    Authorization: "Bearer test-token-with-sufficient-length",
    "Content-Type": "application/json",
    "X-Zra-Device-Id": "00000000-0000-4000-8000-000000000001",
  };
  const payload = {
    action: "wireless_signal_survey",
    total: "3",
    band24: "1",
    band5: "1",
    band6: "1",
    bandOther: "0",
    signalStrong: "1",
    signalModerate: "1",
    signalWeak: "1",
    signalVeryWeak: "0",
  };
  const accepted = await fetch(`${url}/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ kind: "SCAN", title: "Wireless signal survey", subtitle: "Anonymous", payload }),
  });
  assert.equal(accepted.status, 400);

  for (const invalidPayload of [
    { ...payload, bssid: "00:11:22:33:44:55" },
    { ...payload, ssid: "Nearby network" },
    { ...payload, band24: "2" },
    { ...payload, total: "1001", band24: "999", band5: "1", band6: "1" },
  ]) {
    const refused = await fetch(`${url}/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "SCAN", title: "Wireless signal survey", subtitle: "Anonymous", payload: invalidPayload }),
    });
    assert.equal(refused.status, 400);
  }
});
// ============================================================================
// TEST: DEVICE REGISTRATION AFTER LOGIN
// ============================================================================
test("anomaly device transitions to registered device upon login", async (context) => {
  let anomalous = [];
  let registered = [];
  const token = "test-token-with-sufficient-length";
  const server = createApiServer({
    getToken: () => token,
    getHistory: () => [],
    receiveAnomalyDevice: async (identity, ip, consent) => {
      anomalous = [{ ...identity, ip, consent }];
      return true;
    },
    authorizeDevice: async (identity, ip, presentedToken) => {
      if (presentedToken !== token) return { allowed: false, status: 401 };
      registered.push({ ...identity, ip });
      anomalous = anomalous.filter((d) => d.id !== identity.id);
      return { allowed: true };
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  context.after(() => server.close());

  const deviceId = "00000000-0000-4000-8000-000000000099";
  const commonHeaders = {
    "X-Zra-Device-Id": deviceId,
    "X-Zra-Device-Name": "Mobile Anomaly Test",
    "X-Zra-Location-Shared": "true",
    "X-Zra-Latitude": "-6.2088",
    "X-Zra-Longitude": "106.8456",
  };

  const anomalyRes = await fetch(`${url}/devices/anomaly`, {
    method: "POST",
    headers: { ...commonHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ consent: true }),
  });
  assert.equal(anomalyRes.status, 200);
  assert.equal(anomalous.length, 1);
  assert.equal(anomalous[0].id, deviceId);
  assert.equal(anomalous[0].location.latitude, -6.2088);
  assert.equal(registered.length, 0);

  const loginRes = await fetch(`${url}/health`, {
    method: "GET",
    headers: {
      ...commonHeaders,
      Authorization: `Bearer ${token}`,
    },
  });
  assert.equal(loginRes.status, 200);
  assert.equal(anomalous.length, 0);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].id, deviceId);
});
// ============================================================================
// TEST: ANOMALY CHAT AND LOGIN TRANSITION
// ============================================================================
test("chat and voice note from anomaly reports status anomaly and transitions to registered after login", async (context) => {
  let anomalous = [];
  let registered = [];
  let chatMessages = [];
  const token = "secure-verification-token-32bytes-long";
  const blockedIds = new Set();

  const server = createApiServer({
    getToken: () => token,
    getHistory: () => [],
    getChatMessages: (deviceId) => chatMessages.filter((m) => m.deviceId === deviceId),
    addChatMessage: async (message) => {
      chatMessages.push(message);
      return message;
    },
    isDeviceBlocked: (id) => blockedIds.has(id),
    getDeviceStatus: (id) => (registered.some((d) => d.id === id) ? "registered" : "anomaly"),
    authorizeDevice: async (identity, ip, presentedToken) => {
      if (presentedToken !== token) return { allowed: false, status: 401 };
      registered.push({ ...identity, ip });
      anomalous = anomalous.filter((d) => d.id !== identity.id);
      return { allowed: true };
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  context.after(() => server.close());

  const deviceId = "11111111-2222-3333-4444-555555555555";
  const commonHeaders = {
    "X-Zra-Device-Id": deviceId,
    "X-Zra-Device-Name": "Samsung Galaxy Test",
    "X-Zra-Location-Shared": "true",
    "X-Zra-Latitude": "-6.2000",
    "X-Zra-Longitude": "106.8166",
  };

  // 1. Unauthenticated anomaly sends text message
  const textMsgRes = await fetch(`${url}/chat/messages`, {
    method: "POST",
    headers: { ...commonHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "text", text: "Halo desktop, saya butuh API key untuk verifikasi." }),
  });
  assert.equal(textMsgRes.status, 201);
  const textData = await textMsgRes.json();
  assert.equal(textData.status, "anomaly");
  assert.equal(textData.isAnomaly, true);
  assert.equal(textData.item.text, "Halo desktop, saya butuh API key untuk verifikasi.");

  // 2. Anomaly sends voice note (VN)
  const vnMsgRes = await fetch(`${url}/chat/messages`, {
    method: "POST",
    headers: { ...commonHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "audio",
      audio: "data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAA=",
      duration: 4.2,
    }),
  });
  assert.equal(vnMsgRes.status, 201);
  const vnData = await vnMsgRes.json();
  assert.equal(vnData.status, "anomaly");
  assert.equal(vnData.item.type, "audio");
  assert.equal(vnData.item.duration, 4.2);

  // 3. GET /chat/messages as anomaly -> returns status: "anomaly", title: "Chat Anomali"
  const getAnomalyRes = await fetch(`${url}/chat/messages`, {
    method: "GET",
    headers: commonHeaders,
  });
  assert.equal(getAnomalyRes.status, 200);
  const getAnomalyData = await getAnomalyRes.json();
  assert.equal(getAnomalyData.status, "anomaly");
  assert.equal(getAnomalyData.isAnomaly, true);
  assert.equal(getAnomalyData.title, "Chat Anomali");
  assert.equal(getAnomalyData.messages.length, 2);

  // 4. Device logs in using token (received via chat from desktop)
  const loginRes = await fetch(`${url}/health`, {
    method: "GET",
    headers: {
      ...commonHeaders,
      Authorization: `Bearer ${token}`,
    },
  });
  assert.equal(loginRes.status, 200);
  assert.equal(registered.length, 1);

  // 5. GET /chat/messages after login -> status is no longer anomaly, but "registered", title: "Device Samsung Galaxy Test"
  const getRegRes = await fetch(`${url}/chat/messages`, {
    method: "GET",
    headers: {
      ...commonHeaders,
      Authorization: `Bearer ${token}`,
    },
  });
  assert.equal(getRegRes.status, 200);
  const getRegData = await getRegRes.json();
  assert.equal(getRegData.status, "registered");
  assert.equal(getRegData.isAnomaly, false);
  assert.equal(getRegData.title, "Device Samsung Galaxy Test");

  // 6. Blocked device is rejected
  blockedIds.add(deviceId);
  const blockedRes = await fetch(`${url}/chat/messages`, {
    method: "GET",
    headers: commonHeaders,
  });
  assert.equal(blockedRes.status, 423);
});

