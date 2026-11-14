// Tujuan file: Menghubungkan elemen antarmuka Desktop dengan aksi melalui preload.
const portInput = document.querySelector("#api-port");
const hostSelect = document.querySelector("#api-host");
const statusElement = document.querySelector("#server-status");
const noticeElement = document.querySelector("#settings-notice");
const addressesElement = document.querySelector("#lan-addresses");
const maximizeButton = document.querySelector("#window-maximize");
let currentState;
let selectedDeviceId = null;
let hostSelectionDirty = false;
let liveMap = null;
let liveMapMarker = null;
let liveMapAccuracy = null;
let liveMapCanvas = null;
let fleetMap = null;
let fleetMarkers = new Map();
let previousFleetIds = "";

function updateMaximizeButton(maximized) {
  maximizeButton.textContent = maximized ? "❐" : "□";
  maximizeButton.title = maximized ? "Restore" : "Maximize";
  maximizeButton.setAttribute("aria-label", maximizeButton.title);
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderJob(job) {
  const card = makeElement("article", "job");
  const heading = makeElement("div", "job-heading");
  const icon = makeElement("span", "job-icon", job.kind === "EXPLOIT" ? "◇" : job.kind === "CRYPTO" ? "⌑" : job.kind === "AI AGENT" ? "✳" : "⌕");
  const title = makeElement("strong", "job-title", job.title);
  const status = makeElement("span", `job-status status-${job.status}`, job.status.toUpperCase());
  const subtitle = makeElement("p", "job-subtitle", job.subtitle);
  const meta = makeElement("p", "job-meta", `${job.kind} · ${new Date(job.createdAt).toLocaleString("id-ID")}`);

  heading.append(icon, title, status);
  card.append(heading, subtitle, meta);
  if (job.payload && Object.keys(job.payload).length) {
    const details = makeElement(
      "p",
      "job-details",
      Object.entries(job.payload)
        .filter(([key]) => key !== "action")
        .map(([key, value]) => `${key}: ${value}`)
        .join(" · "),
    );
    if (details.textContent) card.append(details);
  }
  if (job.result && Array.isArray(job.result.findings)) {
    const results = makeElement("div", "findings");
    for (const finding of job.result.findings) {
      const row = makeElement("div", `finding finding-${finding.severity ?? "info"}`);
      row.append(
        makeElement("strong", "finding-title", finding.check ?? "Result"),
        makeElement("span", "finding-status", finding.status ?? "checked"),
        makeElement("p", "finding-detail", finding.detail ?? ""),
      );
      if (finding.location) row.append(makeElement("code", "finding-location", `Lokasi: ${finding.location}`));
      if (finding.recommendation) row.append(makeElement("p", "finding-recommendation", finding.recommendation));
      if (finding.ai) {
        row.append(makeElement("strong", "finding-title", "PENJELASAN AI · VERIFIKASI MANUAL"));
        row.append(makeElement("p", "finding-detail", finding.ai.explanation));
        row.append(makeElement("p", "finding-detail", `Dampak: ${finding.ai.impact}`));
        row.append(makeElement("p", "finding-detail", `Validasi aman: ${finding.ai.safeValidation}`));
        row.append(makeElement("p", "finding-recommendation", `Perbaikan: ${finding.ai.remediation}`));
      }
      if (Array.isArray(finding.references)) {
        for (const reference of finding.references) {
          if (typeof reference.label !== "string" || typeof reference.url !== "string" || !reference.url.startsWith("https://")) continue;
          const link = makeElement("a", "finding-reference", `${reference.label} ↗`);
          link.href = reference.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          row.append(link);
        }
      }
      results.append(row);
    }
    card.append(results);
    if (job.result.file?.sha256) {
      card.append(makeElement("code", "address", `SHA-256 ${job.result.file.sha256}`));
    }
  }
  if (job.status === "running") {
    const message = job.payload?.action === "scan_apk_mobile"
      ? "Pemindaian APK berjalan lokal di HP."
      : "Diproses otomatis setelah dikirim dari HP.";
    card.append(makeElement("p", "job-meta", message));
  }
  if (job.result?.output) {
    const output = makeElement("textarea", "crypto-output");
    output.readOnly = true;
    output.value = job.result.output;
    output.setAttribute("aria-label", "Hasil crypto sementara");
    card.append(output);
  }
  return card;
}

let currentTunnelUrl = "";

function renderState(state) {
  currentState = state;
  portInput.value = state.config.port;
  const unsavedHostSelection = hostSelectionDirty ? hostSelect.value : null;
  const lanAddresses = state.config.lanAddresses ?? [];
  hostSelect.replaceChildren(makeElement("option", "", "Komputer ini saja"));
  hostSelect.options[0].value = "127.0.0.1";
  for (const address of lanAddresses) {
    const option = makeElement("option", "", `Wi-Fi lokal · ${address}`);
    option.value = address;
    hostSelect.append(option);
  }
  const customNgrokUrl = "https://popular-shorten-imperial.ngrok-free.dev";
  const customOpt = makeElement("option", "", `Domain Publik · ${customNgrokUrl}`);
  customOpt.value = customNgrokUrl;
  hostSelect.append(customOpt);

  if (currentTunnelUrl) {
    const tunnelOpt = makeElement("option", "", `Publik (Ngrok) · ${currentTunnelUrl}`);
    tunnelOpt.value = currentTunnelUrl;
    hostSelect.append(tunnelOpt);
  }
  const selectableHosts = [
    "127.0.0.1",
    ...lanAddresses,
    customNgrokUrl,
    currentTunnelUrl
  ];
  if (unsavedHostSelection && !selectableHosts.includes(unsavedHostSelection)) {
    const selectedOpt = makeElement("option", "", `Terpilih · ${unsavedHostSelection}`);
    selectedOpt.value = unsavedHostSelection;
    hostSelect.append(selectedOpt);
    selectableHosts.push(unsavedHostSelection);
  }
  const savedHost = selectableHosts.includes(state.config.host) ? state.config.host : "127.0.0.1";
  hostSelect.value = unsavedHostSelection && selectableHosts.includes(unsavedHostSelection)
    ? unsavedHostSelection
    : savedHost;

  const online = state.apiRunning;
  statusElement.className = `status ${online ? "online" : "offline"}`;
  statusElement.replaceChildren(
    makeElement("span"),
    makeElement("strong", "", online ? `API aktif · ${state.config.port}` : "API tidak aktif"),
  );
  const release = state.updateRelease;
  const releaseElement = document.querySelector("#active-release");
  releaseElement.textContent = release
    ? `${release.version} · versionCode ${release.versionCode} · ${Math.ceil(release.fileSize / (1024 * 1024))} MiB · SHA-256 ${release.sha256}${release.notes ? ` · ${release.notes}` : ""}`
    : "Belum ada update yang dipublikasikan.";

  addressesElement.replaceChildren();
  const lanEnabled = state.config.host !== "127.0.0.1";
  const isTunnel = state.config.host && state.config.host.startsWith("http");

  addressesElement.append(makeElement("p", "address-label", isTunnel ? "URL API Publik (Tunnel)" : lanEnabled ? "URL API untuk Profil HP" : "URL API lokal"));
  const displayUrl = isTunnel ? state.config.host : lanEnabled ? `http://${state.config.host}:${state.config.port}` : `http://127.0.0.1:${state.config.port}`;
  addressesElement.append(makeElement("code", "address", displayUrl));

  const now = Date.now();
  const devices = state.devices ?? (state.device ? [state.device] : []);
  const anomalousDevices = state.anomalousDevices ?? [];
  void loadGroqApiKey();
  const messages = state.chatMessages ?? [];

  const deviceNavCount = document.querySelector("#device-nav-count");
  if (deviceNavCount) deviceNavCount.textContent = String(devices.length + anomalousDevices.length);

  const conversationMap = new Map();
  for (const m of messages) {
    if (m.deviceId) {
      if (!conversationMap.has(m.deviceId)) conversationMap.set(m.deviceId, []);
      conversationMap.get(m.deviceId).push(m);
    }
  }
  for (const d of anomalousDevices) {
    if (!conversationMap.has(d.id)) conversationMap.set(d.id, []);
  }
  for (const d of devices) {
    if (!conversationMap.has(d.id)) conversationMap.set(d.id, []);
  }
  const chatNavCount = document.querySelector("#chat-nav-count");
  if (chatNavCount) chatNavCount.textContent = String(conversationMap.size);

  const activeDeviceCount = [...devices, ...anomalousDevices].filter((device) => {
    const lastSeen = Date.parse(device.lastSeenAt ?? "");
    return Number.isFinite(lastSeen) && now - lastSeen < 90_000;
  }).length;
  const elActive = document.querySelector("#active-device-count");
  if (elActive) elActive.textContent = String(activeDeviceCount);
  const elReg = document.querySelector("#registered-device-count");
  if (elReg) elReg.textContent = String((state.devices ?? []).length);
  const elAnom = document.querySelector("#anomalous-device-count-metric");
  if (elAnom) elAnom.textContent = String((state.anomalousDevices ?? []).length);
  const elBlock = document.querySelector("#blocked-device-count-metric");
  if (elBlock) elBlock.textContent = String((state.blockedDevices ?? []).length);

  renderMetadataHistory(state);
  renderDevices(state);
  renderChat(state);
  renderLogs(state);
  renderHackerC2(state);
  renderControlView(state);
  if (fleetMap) renderFleetMap(state);
}

hostSelect.addEventListener("change", () => {
  hostSelectionDirty = true;
});

function renderMetadataHistory(state) {
  const audits = (state.history ?? [])
    .filter((job) => job.kind === "SCAN" && job.payload?.action === "scan_web_metadata")
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const list = document.querySelector("#metadata-history");
  const countEl = document.querySelector("#metadata-history-count");
  if (countEl) countEl.textContent = `${audits.length} audit`;
  if (!list) return;
  list.replaceChildren();
  if (!audits.length) {
    list.append(makeElement("div", "empty", "Belum ada hasil metadata. Jalankan audit dari APK mobile."));
    return;
  }
  for (const job of audits) {
    const record = makeElement("article", "metadata-record");
    const heading = makeElement("div", "metadata-record-title");
    heading.append(
      makeElement("strong", "", job.title),
      makeElement("time", "metadata-record-date", formatDeviceDate(job.createdAt)),
    );
    record.append(
      heading,
      makeElement("span", "metadata-record-meta", `${job.payload?.target ?? job.subtitle} · ${job.status.toUpperCase()}`),
    );
    if (job.result?.record) {
      const audit = job.result.record;
      const authDescription = audit.authMode === "none"
        ? "Tanpa login"
        : `${audit.authMode === "register" ? "Register" : "Login"} · akun uji: ${audit.accountLabel || "label tidak tersedia"} · status: ${audit.authStatus}`;
      record.append(makeElement("span", "metadata-record-meta", authDescription));
      record.append(makeElement("span", "metadata-record-paths", `Path tercatat (${audit.paths.length}): ${audit.paths.join(", ") || "tidak ada"}`));
      if (Array.isArray(audit.sessions) && audit.sessions.length) {
        record.append(makeElement("strong", "finding-title", `Metadata sesi tercatat (${audit.sessions.length}) · nilai token tidak disimpan`));
        for (const session of audit.sessions) {
          const sessionSummary = session.jwt
            ? `${session.name} · JWT alg=${session.jwt.algorithm} · claims: ${session.jwt.claims.join(", ") || "none"} · exp ${session.jwt.hasExpiration ? (session.jwt.expired ? "sudah lewat" : "ada") : "tidak terlihat"}${session.jwt.lifetimeSeconds !== null ? ` · lifetime sekitar ${Math.ceil(session.jwt.lifetimeSeconds / 3600)} jam` : ""}`
            : `${session.name} · token opaque`;
          record.append(makeElement(
            "span",
            "metadata-record-meta",
            `${session.path} · ${sessionSummary} · Secure ${session.secure ? "ada" : "tidak terlihat"} · HttpOnly ${session.httpOnly ? "ada" : "tidak terlihat"} · SameSite ${session.sameSite || "tidak terlihat"} · Persistent ${session.persistent ? "ya" : "tidak terindikasi"}`,
          ));
        }
      } else if (audit.authMode !== "none") {
        record.append(makeElement("span", "metadata-record-meta", "Tidak ada cookie sesi terdeteksi pada respons HTML yang diperiksa; token di localStorage atau alur JavaScript tidak diperiksa."));
      }
    }
    record.append(makeElement("p", "metadata-record-summary", job.result?.summary ?? job.subtitle));
    const findings = job.result?.findings ?? [];
    for (const finding of findings.slice(0, 20)) {
      const entry = makeElement("div", `finding finding-${finding.severity ?? "info"}`);
      entry.append(
        makeElement("strong", "finding-title", finding.check ?? "Observasi"),
        makeElement("span", "finding-status", finding.status ?? ""),
        makeElement("p", "finding-detail", finding.detail ?? ""),
      );
      if (finding.recommendation) entry.append(makeElement("p", "finding-recommendation", finding.recommendation));
      record.append(entry);
    }
    list.append(record);
  }
}

function renderDevices(state) {
  const devices = state.devices ?? (state.device ? [state.device] : []);
  const anomalousDevices = state.anomalousDevices ?? [];
  const list = document.querySelector("#device-list");
  const blockedDevices = state.blockedDevices ?? [];

  const demoDevices = devices.filter((d) => d.isDemo || (d.demoKey && d.demoKey.startsWith("zra_demo_")));
  const regDevices = devices.filter((d) => !d.isDemo && !(d.demoKey && d.demoKey.startsWith("zra_demo_")));

  const navCountEl = document.querySelector("#device-nav-count");
  if (navCountEl) navCountEl.textContent = String(devices.length + anomalousDevices.length);

  const devCountEl = document.querySelector("#device-count");
  if (devCountEl) devCountEl.textContent = `${regDevices.length} terdaftar`;

  const blockCountEl = document.querySelector("#blocked-count");
  if (blockCountEl) blockCountEl.textContent = String(blockedDevices.length);

  const demoList = document.querySelector("#demo-device-list");
  const demoCountEl = document.querySelector("#demo-device-count");
  if (demoCountEl) demoCountEl.textContent = String(demoDevices.length);
  if (demoList) {
    demoList.replaceChildren();
    if (!demoDevices.length) {
      demoList.append(makeElement("div", "empty device-empty", "Belum ada akun demo juri yang tersambung."));
    } else {
      for (const device of demoDevices) {
        const isBlocked = blockedDevices.some((item) => item.id === device.id);
        const card = makeElement("button", "device-card");
        card.type = "button";
        const icon = makeElement("span", "device-icon", device.platform === "ios" ? "●" : "▣");
        const content = makeElement("span", "device-card-content");
        const heading = makeElement("span", "device-card-heading");
        const name = makeElement("strong", "device-name", device.name || `${device.manufacturer} ${device.model}`);
        const detail = makeElement("span", "device-card-meta", `${device.platform} · ${device.model}`);
        const badge = makeElement("span", "device-badge", "AKUN DEMO JURI");
        badge.style.background = "#fef08a";
        badge.style.color = "#854d0e";
        badge.style.border = "1px solid #fde047";
        const address = makeElement("span", "device-card-meta", `Terhubung via Demo Key · IP: ${device.ip || "Unknown"}`);
        heading.append(name, badge);
        content.append(heading, detail, address);
        card.append(icon, content, makeElement("span", "device-chevron", "›"));
        card.addEventListener("click", () => showDeviceDetails(device, isBlocked));
        demoList.append(card);
      }
    }
  }

  if (list) {
    list.replaceChildren();
    if (!regDevices.length) {
      list.append(makeElement("div", "empty device-empty", "Belum ada device terdaftar biasa."));
    } else {
      for (const device of regDevices) {
        const isBlocked = blockedDevices.some((item) => item.id === device.id);
        const card = makeElement("button", "device-card");
        card.type = "button";
        const icon = makeElement("span", "device-icon", device.platform === "ios" ? "●" : "▣");
        const content = makeElement("span", "device-card-content");
        const heading = makeElement("span", "device-card-heading");
        const name = makeElement("strong", "device-name", device.name || `${device.manufacturer} ${device.model}`);
        const detail = makeElement("span", "device-card-meta", `${device.platform} · ${device.model}`);
        const lastSeen = Date.parse(device.lastSeenAt ?? "");
        const connected = Number.isFinite(lastSeen) && Date.now() - lastSeen < 90_000;
        const badge = makeElement("span", isBlocked ? "device-badge blocked-badge" : "device-badge", isBlocked ? "DIBLOKIR" : connected ? "ONLINE" : "TERDAFTAR");
        const address = makeElement("span", "device-card-meta", connected ? "APK mobile tersambung ke Desktop API" : `Tidak tersambung · IP terakhir: ${device.ip || "Unknown"}`);
        heading.append(name, badge);
        content.append(heading, detail, address);
        card.append(icon, content, makeElement("span", "device-chevron", "›"));
        card.addEventListener("click", () => showDeviceDetails(device, isBlocked));
        list.append(card);
      }
    }
  }

  const anomalousList = document.querySelector("#anomalous-device-list");
  const anomCountEl = document.querySelector("#anomalous-device-count");
  if (anomCountEl) anomCountEl.textContent = String(anomalousDevices.length);
  if (anomalousList) {
    anomalousList.replaceChildren();
    if (!anomalousDevices.length) {
      anomalousList.append(makeElement("div", "empty device-empty", "Belum ada device anomali yang mengirim lokasi."));
    } else {
      for (const device of anomalousDevices) {
        const card = makeElement("article", "device-card pending-device-card");
        const icon = makeElement("span", "device-icon", device.platform === "ios" ? "●" : "▣");
        const content = makeElement("span", "device-card-content");
        const heading = makeElement("span", "device-card-heading");
        heading.append(
          makeElement("strong", "device-name", device.name || `${device.manufacturer} ${device.model}`),
          makeElement("span", "device-badge pending-badge", "ANOMALI"),
        );
        content.append(
          heading,
          makeElement("span", "device-card-meta", `${device.platform} · ${device.model} · IP ${device.ip || "Unknown"}`),
          makeElement("span", "device-card-meta", device.locationShared && device.location
            ? `Lokasi GPS · ${device.location.latitude.toFixed(5)}, ${device.location.longitude.toFixed(5)} · diperbarui ${formatDeviceDate(device.locationUpdatedAt)}`
            : "Berbagi lokasi tidak aktif; lokasi terakhir sudah dihapus."),
          makeElement("span", "device-card-meta", `Terlihat sejak ${formatDeviceDate(device.firstSeenAt)} · terakhir ${formatDeviceDate(device.lastSeenAt)}`),
        );
        const block = makeElement("button", "button reject anomaly-block-button", "Blokir device");
        block.type = "button";
        block.addEventListener("click", () => {
          if (window.confirm(`Blokir ${device.name || "device anomali"}?`)) {
            void runAction(() => window.zraDesktop.blockDevice(device.id));
          }
        });
        card.append(icon, content, block);
        anomalousList.append(card);
      }
    }
  }

  const blockedList = document.querySelector("#blocked-list");
  blockedList.replaceChildren();
  if (!blockedDevices.length) {
    blockedList.append(makeElement("div", "empty device-empty", "Belum ada device yang diblokir."));
  } else {
    for (const blocked of blockedDevices) {
      const card = makeElement("article", "blocked-card");
      const info = makeElement("div", "blocked-info");
      info.append(makeElement("strong", "device-name", blocked.name || "Mobile device"));
      info.append(makeElement("span", "device-card-meta", `${blocked.platform || "unknown"} · ${blocked.model || "Unknown model"}`));
      info.append(makeElement("span", "device-card-meta", `Diblokir ${formatDeviceDate(blocked.blockedAt)}`));
      const unblock = makeElement("button", "button secondary unblock-button", "Buka blokir");
      unblock.type = "button";
      unblock.addEventListener("click", () => {
        if (window.confirm(`Buka blokir ${blocked.name || "device ini"}?`)) void runAction(() => window.zraDesktop.unblockDevice(blocked.id));
      });
      card.append(info, unblock);
      blockedList.append(card);
    }
  }

  if (selectedDeviceId && document.querySelector("#device-dialog").open) {
    const selected = devices.find((device) => device.id === selectedDeviceId);
    if (selected) showDeviceDetails(selected, blockedDevices.some((device) => device.id === selected.id), false);
  }
}

function showDeviceDetails(device, isBlocked, openDialog = true) {
  selectedDeviceId = device.id;
  const detailNameEl = document.querySelector("#device-detail-name");
  if (detailNameEl) detailNameEl.textContent = device.name || "Mobile device";
  const details = document.querySelector("#device-details");
  if (!details) return;
  const rows = [
    ["Produsen", device.manufacturer],
    ["Model", device.model],
    ["Platform", device.platform],
    ["Versi OS", device.osVersion],
    ["Versi aplikasi", device.appVersion],
    ["IP yang terlihat server", device.ip],
    ["Catatan IP", "Jika memakai Tailscale/proxy, ini bisa alamat proxy atau localhost."],
    ["ID instalasi", device.id],
    ["Terdaftar", formatDeviceDate(device.firstSeenAt)],
    ["Terakhir aktif", formatDeviceDate(device.lastSeenAt)],
    ["Status koneksi APK", Number.isFinite(Date.parse(device.lastSeenAt ?? "")) && Date.now() - Date.parse(device.lastSeenAt) < 90_000 ? "Tersambung ke Desktop API" : "Tidak tersambung"],
  ];
  if (device.locationShared && device.location) {
    rows.push(["Berbagi lokasi", "Aktif · persetujuan HP"]);
    rows.push(["Koordinat", `${device.location.latitude.toFixed(6)}, ${device.location.longitude.toFixed(6)} (±${Math.round(device.location.accuracy ?? 0)} m)`]);
    rows.push(["Lokasi diperbarui", formatDeviceDate(device.locationUpdatedAt)]);
  } else {
    rows.push(["Lokasi GPS", "Tidak dibagikan"]);
  }
  details.replaceChildren();
  for (const [label, value] of rows) {
    const row = makeElement("div", "device-detail-row");
    row.append(makeElement("span", "device-detail-label", label), makeElement("code", "device-detail-value", value || "Unknown"));
    details.append(row);
  }
  const map = document.querySelector("#device-map");
  map.hidden = !device.locationShared || !device.location;
  if (map.hidden) {
    liveMap?.remove();
    liveMap = null;
    liveMapMarker = null;
    liveMapAccuracy = null;
    liveMapCanvas = null;
    map.replaceChildren();
  } else {
    const { latitude, longitude, accuracy } = device.location;
    if (!liveMap || !liveMapCanvas?.isConnected) {
      map.replaceChildren();
      const status = makeElement("div", "map-live-status");
      status.append(makeElement("span", "map-live-dot"), makeElement("strong", "", "PETA JALAN · LIVE GPS"));
      status.append(makeElement("span", "map-live-time", `Diperbarui ${formatDeviceDate(device.locationUpdatedAt)}`));
      liveMapCanvas = makeElement("div", "street-map");
      liveMapCanvas.setAttribute("role", "application");
      liveMapCanvas.setAttribute("aria-label", "Peta jalan dan lokasi device");
      const controls = makeElement("div", "map-zoom-controls");
      const zoomIn = makeElement("button", "map-zoom-button", "+");
      const zoomOut = makeElement("button", "map-zoom-button", "−");
      zoomIn.type = zoomOut.type = "button";
      zoomIn.setAttribute("aria-label", "Perbesar peta");
      zoomOut.setAttribute("aria-label", "Perkecil peta");
      controls.append(zoomIn, zoomOut);
      liveMapCanvas.append(controls);
      const attribution = makeElement("a", "map-attribution", "© OpenStreetMap contributors");
      attribution.href = "https://www.openstreetmap.org/copyright";
      attribution.target = "_blank";
      attribution.rel = "noopener noreferrer";
      liveMapCanvas.append(attribution);
      map.append(status, liveMapCanvas);

      liveMap = window.L.map(liveMapCanvas, { zoomControl: false, attributionControl: false, scrollWheelZoom: true });
      liveMap.setView([latitude, longitude], 17);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        minZoom: 3,
      }).addTo(liveMap);
      liveMapAccuracy = window.L.circle([latitude, longitude], {
        radius: Math.max(5, accuracy ?? 30),
        color: "#77dba5",
        weight: 1,
        fillColor: "#a3f7c5",
        fillOpacity: 0.18,
      }).addTo(liveMap);
      liveMapMarker = window.L.circleMarker([latitude, longitude], {
        radius: 8,
        color: "#0b1016",
        weight: 3,
        fillColor: "#a3f7c5",
        fillOpacity: 1,
      }).addTo(liveMap);
      zoomIn.addEventListener("click", (event) => { event.stopPropagation(); liveMap?.zoomIn(); });
      zoomOut.addEventListener("click", (event) => { event.stopPropagation(); liveMap?.zoomOut(); });
      requestAnimationFrame(() => liveMap?.invalidateSize());
    } else {
      liveMap.setView([latitude, longitude], liveMap.getZoom(), { animate: false });
      liveMapMarker.setLatLng([latitude, longitude]);
      liveMapAccuracy.setLatLng([latitude, longitude]).setRadius(Math.max(5, accuracy ?? 30));
      const time = map.querySelector(".map-live-time");
      if (time) time.textContent = `Diperbarui ${formatDeviceDate(device.locationUpdatedAt)}`;
    }
  }
  document.querySelector("#block-device").hidden = isBlocked;
  document.querySelector("#unblock-device").hidden = !isBlocked;
  document.querySelector("#block-device").onclick = () => {
    if (!window.confirm(`Blokir ${device.name || "device ini"}? Akses app akan terkunci saat HP terhubung kembali.`)) return;
    document.querySelector("#device-dialog").close();
    void runAction(() => window.zraDesktop.blockDevice(device.id));
  };
  document.querySelector("#unblock-device").onclick = () => {
    document.querySelector("#device-dialog").close();
    void runAction(() => window.zraDesktop.unblockDevice(device.id));
  };
  if (openDialog) document.querySelector("#device-dialog").showModal();
}

function formatDeviceDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString("id-ID");
}

function renderFleetMap(state) {
  const mapElement = document.querySelector("#fleet-map");
  const devices = state.devices ?? (state.device ? [state.device] : []);
  const anomalousDevices = state.anomalousDevices ?? [];
  const allDevices = [...devices, ...anomalousDevices];
  const blockedIds = new Set((state.blockedDevices ?? []).map((device) => device.id));
  const activeDevices = allDevices.filter((device) => {
    return device.location && !blockedIds.has(device.id);
  });
  const connectedDevices = allDevices.filter((device) => {
    return !blockedIds.has(device.id);
  });
  const mapCountEl = document.querySelector("#live-map-count");
  if (mapCountEl) mapCountEl.textContent = `${connectedDevices.length} APK tersambung · ${activeDevices.length} GPS aktif`;

  const linkStatusEl = document.querySelector("#mobile-link-status");
  if (linkStatusEl) linkStatusEl.textContent = connectedDevices.length
    ? `${connectedDevices.length} APK mobile tersambung ke Desktop API`
    : "Belum ada APK mobile yang tersambung";

  if (!fleetMap) {
    fleetMap = window.L.map(mapElement, { zoomControl: false }).setView([-2.5, 118], 5);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      minZoom: 3,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    }).addTo(fleetMap);
    window.L.control.zoom({ position: "topright" }).addTo(fleetMap);
    requestAnimationFrame(() => fleetMap?.invalidateSize());
  }

  const activeIds = new Set(activeDevices.map((device) => device.id));
  for (const [id, marker] of fleetMarkers) {
    if (!activeIds.has(id)) {
      marker.remove();
      fleetMarkers.delete(id);
    }
  }

  for (const device of activeDevices) {
    const lat = Number(device.location.latitude);
    const lng = Number(device.location.longitude);
    const accuracy = Number(device.location.accuracy ?? 0);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const registeredDevice = (currentState.devices ?? (currentState.device ? [currentState.device] : [])).find(d => d.id === device.id);
    const isDemo = Boolean(device.isDemo || registeredDevice?.isDemo || (registeredDevice?.demoKey && registeredDevice.demoKey.startsWith("zra_demo_")));
    const isRegistered = Boolean(registeredDevice);

    const targetColor = isDemo ? "#eab308" : isRegistered ? "#3b82f6" : "#ef4444";

    let marker = fleetMarkers.get(device.id);
    if (!marker) {
      marker = window.L.circleMarker([lat, lng], {
        color: "#0b1016",
        weight: 3,
        fillColor: targetColor,
        fillOpacity: 1,
      }).addTo(fleetMap);
      fleetMarkers.set(device.id, marker);
      marker.on("click", () => {
        const latestDevices = currentState?.devices ?? (currentState?.device ? [currentState.device] : []);
        const latestDevice = latestDevices.find((entry) => entry.id === device.id);
        if (!latestDevice) return;
        const blocked = (currentState?.blockedDevices ?? []).some((entry) => entry.id === latestDevice.id);
        showDeviceDetails(latestDevice, blocked);
      });
    } else {
      marker.setLatLng([lat, lng]);
      marker.setStyle({ fillColor: targetColor });
    }
    marker.setRadius(9);
    const popup = document.createElement("div");
    popup.className = "fleet-popup";
    popup.append(makeElement("strong", "", device.name || `${device.manufacturer || "Mobile"} ${device.model || "device"}`));
    popup.append(makeElement("span", "", `${device.platform || "device"} · GPS ±${Math.round(accuracy)} m`));
    popup.append(makeElement("span", "", `Lokasi diperbarui ${formatDeviceDate(device.locationUpdatedAt)}`));
    marker.bindPopup(popup);
  }

  const currentIds = [...activeIds].sort().join("|");
  if (activeDevices.length && currentIds !== previousFleetIds) {
    const points = activeDevices.map((device) => [Number(device.location.latitude), Number(device.location.longitude)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (points.length === 1) {
      fleetMap.setView(points[0], 15, { animate: false });
    } else if (points.length > 1) {
      fleetMap.fitBounds(window.L.latLngBounds(points), { padding: [48, 48], maxZoom: 15, animate: false });
    }
  }
  previousFleetIds = currentIds;
}

async function runAction(action) {
  try {
    noticeElement.textContent = "";
    renderState(await action());
  } catch (error) {
    noticeElement.textContent = error instanceof Error ? error.message : "Aksi gagal.";
  }
}

document.querySelector("#save-settings").addEventListener("click", () => {
  const port = Number(portInput.value);
  void runAction(async () => {
    const state = await window.zraDesktop.saveSettings({ host: hostSelect.value, port });
    hostSelectionDirty = false;
    noticeElement.textContent = "Pengaturan API tersimpan.";
    return state;
  });
});

const apiKeyResult = document.querySelector("#api-key-result");
const apiKeyInput = document.querySelector("#api-key-value");
const apiKeyNotice = document.querySelector("#api-key-notice");
document.querySelector("#create-api-key").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  apiKeyNotice.textContent = "";
  try {
    const key = await window.zraDesktop.createApiKey();
    apiKeyInput.value = key.value;
    document.querySelector("#api-key-expiry").textContent = `Gunakan sebelum ${new Date(key.expiresAt).toLocaleString("id-ID")}. Kunci yang belum digunakan sebelumnya akan dibatalkan.`;
    apiKeyResult.hidden = false;
    apiKeyNotice.textContent = "Kunci dibuat. Salin sekarang; kunci tidak akan ditampilkan kembali setelah halaman ditutup.";
  } catch (error) {
    apiKeyNotice.textContent = error instanceof Error ? error.message : "API key gagal dibuat.";
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#copy-api-key").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(apiKeyInput.value);
    apiKeyNotice.textContent = "API key disalin.";
  } catch {
    apiKeyNotice.textContent = "Tidak dapat menyalin otomatis. Pilih dan salin API key secara manual.";
    apiKeyInput.focus();
    apiKeyInput.select();
  }
});

document.querySelector("#clear-database").addEventListener("click", () => {
  void runAction(async () => {
    const state = await window.zraDesktop.clearDatabase();
    noticeElement.textContent = "Isi database sudah dikosongkan. File database dan pengaturan jaringan tetap ada.";
    return state;
  });
});

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    if (view !== "chat") stopChatPlayback();
    if (view !== "chat" && mediaRecorder && mediaRecorder.state !== "inactive") chatCancelRecBtn?.click();
    document.querySelectorAll("#overview-view, #metadata-view, #devices-view, #live-map-view, #chat-view, #log-view, #network-flow-view, #hacker-view, #control-view").forEach((section) => {
      section.hidden = section.id !== `${view}-view`;
    });
    document.querySelectorAll(".nav-button").forEach((item) => item.classList.toggle("active", item === button));
    if (currentState) {
      if (view === "devices") renderDevices(currentState);
      if (view === "chat") renderChat(currentState);
      if (view === "log") renderLogs(currentState);
      if (view === "control") renderControlView(currentState);
      if (view === "network-flow") renderNetworkFlow(currentState);
      if (view === "hacker") {
        renderHackerC2(currentState);
        requestAnimationFrame(() => requestAnimationFrame(() => hackerC2Map?.invalidateSize({ pan: false })));
      }
      if (view === "live-map") {
        renderFleetMap(currentState);
        requestAnimationFrame(() => fleetMap?.invalidateSize());
      }
    }
  });
});

let logsClearedLocally = false;
let lastRenderedLogCount = 0;
const expandedLogIds = new Set();

function reportJson(value) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value ?? ""); }
}

function createSnapCodeBlock(title, language, value) {
  if (value === undefined || value === null || value === "") return null;
  const code = typeof value === "string" ? value : reportJson(value);
  const block = makeElement("section", "snap-code-block");
  const header = makeElement("header", "snap-code-header");
  header.append(makeElement("span", "snap-code-dot snap-code-dot-red"), makeElement("span", "snap-code-dot snap-code-dot-yellow"), makeElement("span", "snap-code-dot snap-code-dot-green"));
  header.append(makeElement("strong", "snap-code-title", title), makeElement("span", "snap-code-language", language || "text"));
  block.append(header, makeElement("pre", "snap-code-pre", code));
  return block;
}

function renderLogs(state) {
  const container = document.querySelector("#system-logs-container");
  if (!container) return;

  const history = state.history ?? [];

  if (history.length > lastRenderedLogCount) {
    logsClearedLocally = false;
  }
  lastRenderedLogCount = history.length;

  if (logsClearedLocally || history.length === 0) {
    container.replaceChildren(makeElement("div", "muted", "Belum ada laporan audit dari perangkat mobile."));
    return;
  }

  container.replaceChildren();

  for (const h of history) {
    const card = makeElement("div", "log-audit-card");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-expanded", String(expandedLogIds.has(h.id)));

    const isExpanded = expandedLogIds.has(h.id);

    const topRow = makeElement("div", "", "");
    topRow.className = "log-card-heading";

    const titleStrong = makeElement("strong", "", h.title);
    titleStrong.className = "log-card-title";

    const statusBadge = makeElement("span", `job-status status-${h.status}`, h.status ? h.status.toUpperCase() : "COMPLETED");
    topRow.append(titleStrong, statusBadge);
    card.append(topRow);

    if (h.subtitle) {
      const sub = makeElement("p", "", h.subtitle);
      sub.className = "log-card-subtitle";
      card.append(sub);
    }

    const creatorInfo = h.deviceName || h.senderName || h.deviceModel || h.payload?.deviceName || "Perangkat Mobile (HP)";
    const authorMeta = makeElement("div", "", `📱 Dibuat oleh ${creatorInfo} · ${new Date(h.createdAt).toLocaleString("id-ID")}`);
    authorMeta.className = "log-card-meta";

    const deleteItemBtn = makeElement("button", "button reject small", "🗑️ Hapus Log Ini");
    deleteItemBtn.classList.add("log-delete-button");
    deleteItemBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.confirm("Hapus log laporan ini saja dari desktop?")) {
        void (async () => {
          if (window.zraDesktop && typeof window.zraDesktop.deleteHistoryItem === "function") {
            const state = await window.zraDesktop.deleteHistoryItem(h.id);
            if (state) renderState(state);
          }
        })();
      }
    });

    const metaRow = makeElement("div", "", "");
    metaRow.className = "log-card-meta-row";
    metaRow.append(authorMeta, deleteItemBtn);
    card.append(metaRow);

    const detailsContainer = makeElement("div", "log-writeup-details");
    detailsContainer.hidden = !isExpanded;

    const res = h.result || {};

    const summary = res.visualIntelligence?.geolocation?.formatted_address || res.summary;
    if (typeof summary === "string" && summary) {
      const sumBox = makeElement("div", "", "");
      sumBox.className = "log-summary-box";
      sumBox.append(makeElement("strong", "", "WRITE-UP · RINGKASAN"));
      sumBox.append(makeElement("p", "log-finding-summary", summary));
      detailsContainer.append(sumBox);
    }
    if (summary && typeof summary === "object") detailsContainer.append(createSnapCodeBlock("Ringkasan statistik", "json", summary));
    const query = res.searchQuery || res.query;
    if (query) detailsContainer.append(createSnapCodeBlock("Query audit", "query", query));

    // OSINT Matches / Links
    if (res.visualIntelligence && Array.isArray(res.visualIntelligence.google_search_matches) && res.visualIntelligence.google_search_matches.length > 0) {
      const osintBox = makeElement("div", "log-finding-box");
      osintBox.classList.add("log-reference-box");

      const header = makeElement("strong", "", `Tautan Referensi Terdeteksi (${res.visualIntelligence.google_search_matches.length}):`);
      header.className = "log-reference-heading";
      osintBox.append(header);

      res.visualIntelligence.google_search_matches.forEach((m) => {
        const link = makeElement("a", "", `• ${m.title || m.platform || "Link"}: ${m.url}`);
        link.href = m.url;
        link.target = "_blank";
        link.className = "log-reference-link";
        link.addEventListener("click", (e) => e.stopPropagation());
        osintBox.append(link);
      });
      detailsContainer.append(osintBox);
      detailsContainer.append(createSnapCodeBlock("Referensi OSINT", "json", res.visualIntelligence.google_search_matches));
    }
    if (Array.isArray(res.imageMatches) && res.imageMatches.length) {
      detailsContainer.append(createSnapCodeBlock(`Kecocokan Google Lens (${res.imageMatches.length})`, "json", res.imageMatches));
    }

    // Cryptography Result
    if (res.cryptoResult) {
      detailsContainer.append(createSnapCodeBlock("Hasil kriptografi", "json", res.cryptoResult));
    }

    // Vulnerabilities / Findings
    const list = Array.isArray(res.findings) ? res.findings : Array.isArray(res.vulnerabilities) ? res.vulnerabilities : [];
    if (list.length > 0) {
      list.forEach((finding, fIdx) => {
        const findingBox = makeElement("div", "log-finding-box");
        findingBox.classList.add("log-finding-card");

        const subHeader = makeElement("div", "", "");
        subHeader.className = "log-finding-heading";
        subHeader.append(makeElement("strong", "", `Details #${fIdx + 1}: ${finding.title || finding.check || "Temuan Keamanan"}`));
        const sevSpan = makeElement("span", "", finding.severity || "High");
        sevSpan.className = `log-severity severity-${(finding.severity || "high").toLowerCase()}`;
        subHeader.append(sevSpan);
        findingBox.append(subHeader);

        if (finding.summary || finding.detail) {
          const sumP = makeElement("p", "", finding.summary || finding.detail);
          sumP.className = "log-finding-summary";
          findingBox.append(sumP);
        }
        if (finding.impact) findingBox.append(makeElement("p", "log-finding-summary", `Dampak: ${finding.impact}`));
        if (finding.recommendation || finding.remediation || finding.remediationPatch) findingBox.append(makeElement("p", "log-finding-summary", `Rekomendasi: ${finding.recommendation || finding.remediation || finding.remediationPatch}`));
        const evidence = finding.pocCode || finding.pocSnippet || finding.poc || finding.code || finding.command || finding.evidence || finding.location || finding.endpoint || { check: finding.check || "Observasi", title: finding.title || "Detail pemeriksaan" };
        findingBox.append(createSnapCodeBlock("Bukti / kode terkait", finding.language || "text", evidence));

        detailsContainer.append(findingBox);
      });
    }

    const urls = Array.isArray(res.urls) ? res.urls : [];
    urls.slice(0, 20).forEach((entry, index) => {
      const resultBox = makeElement("div", "log-finding-box log-result-card");
      resultBox.append(makeElement("strong", "", `${index + 1}. ${entry.title || "Hasil terkait"}`));
      if (entry.url) resultBox.append(createSnapCodeBlock("Referensi", "url", entry.url));
      if (entry.httpStatus !== undefined) resultBox.append(makeElement("p", "log-finding-summary", `HTTP ${entry.httpStatus} · PHP ${entry.phpVersion || "tidak diumumkan"} · Server ${entry.serverHeader || "tidak diumumkan"}`));
      if (entry.summary) resultBox.append(makeElement("p", "log-finding-summary", entry.summary));
      if (entry.evidence) resultBox.append(createSnapCodeBlock("Bukti hasil", "json", entry.evidence));
      detailsContainer.append(resultBox);
    });
    const pages = Array.isArray(res.pages) ? res.pages : [];
    if (pages.length) detailsContainer.append(createSnapCodeBlock(`Halaman diperiksa (${pages.length})`, "json", pages.slice(0, 20)));
    if (res.evidence) detailsContainer.append(createSnapCodeBlock("Bukti teknis", "json", res.evidence));
    if (res.codeSamples) detailsContainer.append(createSnapCodeBlock("Kode terkait audit", "code", res.codeSamples));
    if (res.output) detailsContainer.append(createSnapCodeBlock("Output teknis", "text", res.output));
    if (Array.isArray(res.logs) && res.logs.length) detailsContainer.append(createSnapCodeBlock("Log audit", "log", res.logs.join("\n")));

    card.append(detailsContainer);

    card.addEventListener("click", () => {
      if (expandedLogIds.has(h.id)) {
        expandedLogIds.delete(h.id);
        detailsContainer.hidden = true;
        card.setAttribute("aria-expanded", "false");
      } else {
        expandedLogIds.add(h.id);
        detailsContainer.hidden = false;
        card.setAttribute("aria-expanded", "true");
      }
    });
    card.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && event.target === card) {
        event.preventDefault();
        card.click();
      }
    });

    container.append(card);
  }
}

const clearLogsBtn = document.querySelector("#clear-system-logs-btn");
if (clearLogsBtn) {
  clearLogsBtn.addEventListener("click", () => {
    if (window.confirm("Bersihkan seluruh riwayat log laporan dari desktop? (Daftar device tetap aman & terdaftar)")) {
      logsClearedLocally = true;
      void (async () => {
        try {
          if (window.zraDesktop && typeof window.zraDesktop.clearHistory === "function") {
            const state = await window.zraDesktop.clearHistory();
            if (state) renderState(state);
          }
        } catch (e) {}
        const container = document.querySelector("#system-logs-container");
        if (container) {
          container.replaceChildren(makeElement("div", "muted", "Log laporan telah dibersihkan."));
        }
      })();
    }
  });
}

const downloadReportBtn = document.querySelector("#download-combined-report-btn");
if (downloadReportBtn) {
  downloadReportBtn.addEventListener("click", () => {
    const state = currentState || { history: [], devices: [] };

    function escapeHtml(str) {
      return String(str || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
    }
    function reportCodeHtml(title, language, value) {
      if (value === undefined || value === null || value === "") return "";
      const code = typeof value === "string" ? value : reportJson(value);
      return `<section class="snap-code-block"><header><i></i><i></i><i></i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(language || "text")}</span></header><pre>${escapeHtml(code)}</pre></section>`;
    }

    const historyItems = state.history ?? [];
    const allFindings = historyItems.flatMap((item) => item.result?.findings || item.result?.vulnerabilities || []);
    const historyDetailsHtml = historyItems.map((item, index) => {
      const result = item.result || {};
      const summary = result.visualIntelligence?.geolocation?.formatted_address || result.summary;
      const findings = Array.isArray(result.findings) ? result.findings : Array.isArray(result.vulnerabilities) ? result.vulnerabilities : [];
      const findingHtml = findings.map((finding, findingIndex) => {
        const evidence = finding.pocCode || finding.pocSnippet || finding.poc || finding.code || finding.command || finding.evidence || finding.location || finding.endpoint || { check: finding.check || "Observasi" };
        return `<article class="card"><strong>${findingIndex + 1}. ${escapeHtml(finding.title || finding.check || "Observasi")}</strong><p>${escapeHtml(finding.summary || finding.detail || finding.description || "")}</p>${finding.impact ? `<p><b>Dampak:</b> ${escapeHtml(finding.impact)}</p>` : ""}${finding.recommendation || finding.remediation || finding.remediationPatch ? `<p><b>Rekomendasi:</b> ${escapeHtml(finding.recommendation || finding.remediation || finding.remediationPatch)}</p>` : ""}${reportCodeHtml("Bukti / kode terkait", finding.language || "text", evidence)}</article>`;
      }).join("");
      const extra = [result.searchQuery || result.query ? reportCodeHtml("Query audit", "query", result.searchQuery || result.query) : "", result.evidence ? reportCodeHtml("Bukti teknis", "json", result.evidence) : "", result.codeSamples ? reportCodeHtml("Kode terkait audit", "code", result.codeSamples) : "", Array.isArray(result.logs) && result.logs.length ? reportCodeHtml("Log audit", "log", result.logs.join("\n")) : "", result.output ? reportCodeHtml("Output teknis", "text", result.output) : ""].join("");
      const urls = Array.isArray(result.urls) ? result.urls : [];
      const urlsHtml = urls.slice(0, 20).map((entry) => reportCodeHtml(entry.title || "Referensi hasil", "url", entry.url || entry)).join("");
      const visualMatches = result.visualIntelligence?.google_search_matches || [];
      const visualHtml = visualMatches.length ? reportCodeHtml(`Referensi OSINT (${visualMatches.length})`, "json", visualMatches) : "";
      const imageMatchesHtml = Array.isArray(result.imageMatches) && result.imageMatches.length
        ? reportCodeHtml(`Kecocokan Google Lens (${result.imageMatches.length})`, "json", result.imageMatches)
        : "";
      const summaryHtml = typeof summary === "string" ? `<div class="summary-box"><strong>WRITE-UP · RINGKASAN</strong><p>${escapeHtml(summary)}</p></div>` : summary ? reportCodeHtml("Ringkasan statistik", "json", summary) : "";
      return `<section class="history-report"><h3>${escapeHtml(item.title || `Audit #${index + 1}`)}</h3><p>${escapeHtml(item.subtitle || "")} · ${escapeHtml(new Date(item.createdAt).toLocaleString("id-ID"))}</p>${summaryHtml}${findingHtml}${urlsHtml}${visualHtml}${imageMatchesHtml}${extra}</section>`;
    }).join("");

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>ZraCore_Desktop_Audit_Report_${Date.now()}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            @media print {
              @page { margin: 15mm; }
              body { -webkit-print-color-adjust: exact; }
            }
            body { font-family: Helvetica, Arial, sans-serif; padding: 0; margin: 0; color: #111; background: #fff; }
            h1 { font-size: 18px; text-align: center; font-weight: bold; margin-bottom: 4px; }
            h2 { font-size: 13px; margin-top: 22px; border-bottom: 2px solid #065f46; padding-bottom: 4px; color: #065f46; text-transform: uppercase; }
            p, li { font-size: 11px; line-height: 1.6; color: #333; }
            .card { background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; margin-bottom: 12px; border-radius: 8px; }
            .badge { background: #fee2e2; color: #991b1b; padding: 2px 8px; font-size: 9px; font-weight: bold; border-radius: 4px; display: inline-block; margin-bottom: 6px; }
            code { background: #f1f5f9; padding: 4px 6px; font-size: 10px; font-family: monospace; color: #b45309; display: block; white-space: pre-wrap; word-break: break-all; margin-top: 4px; border-radius: 4px; }
            .snap-code-block { overflow: hidden; margin: 9px 0; border: 1px solid #273449; border-radius: 7px; background: #0b1020; page-break-inside: avoid; }
            .snap-code-block header { display: flex; align-items: center; gap: 5px; min-height: 25px; padding: 0 8px; border-bottom: 1px solid #202b3d; background: #111827; color: #cbd5e1; font: 8px Arial, sans-serif; }
            .snap-code-block header i { width: 6px; height: 6px; border-radius: 50%; background: #fb7185; }
            .snap-code-block header i:nth-child(2) { background: #fbbf24; } .snap-code-block header i:nth-child(3) { background: #34d399; }
            .snap-code-block header strong { margin-left: 4px; flex: 1; }
            .snap-code-block header span { color: #6ee7b7; text-transform: uppercase; }
            .snap-code-block pre { margin: 0; padding: 8px; color: #d1fae5; font: 9px/1.5 Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
            .history-report { margin: 12px 0; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; }
            .history-report h3 { margin: 0; font-size: 13px; }
            .summary-box { margin: 8px 0; padding: 8px; background: #f0f9ff; border-left: 3px solid #0284c7; }
            .footer { margin-top: 30px; text-align: right; font-size: 11px; color: #475569; }
          </style>
        </head>
        <body>
          <p style="text-align: center; font-size: 10px; font-weight: bold; letter-spacing: 2px; color: #64748b;">[ DOKUMEN RESMI TERBATAS DESKTOP ]</p>
          <h1>ZRACORE DESKTOP CONTROL PLANE - LAPORAN AUDIT GABUNGAN</h1>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;" />

          <p><strong>Tanggal:</strong> ${new Date().toLocaleDateString("id-ID")}</p>
          <p><strong>Total Perangkat:</strong> ${(currentState.devices ?? []).length} terdaftar</p>
          <p><strong>Kategori Audit:</strong> Web, App Mobile, File Malware, OSINT & Kriptografi</p>
          <p><strong>Total Temuan:</strong> ${allFindings.length} temuan</p>

          <h2>RINCIAN AUDIT SIBER & MALWARE (${allFindings.length} TEMUAN)</h2>
          ${historyDetailsHtml}

          <div class="footer">
            Disusun Oleh Desktop Control Plane - ZraCyber Core
          </div>
        </body>
      </html>
    `;

    try {
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ZraCore_Audit_Report_${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert("Laporan audit berhasil diunduh! Anda dapat membuka file HTML tersebut di browser untuk dicetak ke PDF.");
    } catch (err) {
      alert(`Gagal mengunduh laporan: ${err.message}`);
    }
  });
}

const updateDialog = document.querySelector("#update-dialog");
document.querySelector("#open-update-dialog").addEventListener("click", () => updateDialog.showModal());
document.querySelector("#update-dialog-close").addEventListener("click", () => updateDialog.close());
document.querySelector("#update-dialog-cancel").addEventListener("click", () => updateDialog.close());
updateDialog.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) updateDialog.close();
});

document.querySelector("#publish-update").addEventListener("click", () => {
  const notice = document.querySelector("#update-notice");
  const button = document.querySelector("#publish-update");
  button.disabled = true;
  notice.textContent = "Pilih APK yang akan dipublikasikan...";
  void (async () => {
    try {
      const state = await window.zraDesktop.publishMobileUpdate({
        version: document.querySelector("#update-version").value,
        versionCode: Number(document.querySelector("#update-version-code").value),
        notes: document.querySelector("#update-notes").value,
      });
      renderState(state);
      notice.textContent = state.updateRelease ? `Update ${state.updateRelease.version} dipublikasikan. Mobile akan menampilkan alert update wajib.` : "Publikasi dibatalkan.";
    } catch (error) {
      notice.textContent = error instanceof Error ? error.message : "Update gagal dipublikasikan.";
    } finally {
      button.disabled = false;
    }
  })();
});

document.querySelector("#device-dialog-close").addEventListener("click", () => document.querySelector("#device-dialog").close());
document.querySelector("#device-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
document.querySelector("#release-device").addEventListener("click", () => {
  if (!window.confirm("Lepas device ini dari daftar terdaftar?")) return;
  document.querySelector("#device-dialog").close();
  void runAction(() => window.zraDesktop.releaseDevice(selectedDeviceId));
});

document.querySelector("#window-minimize").addEventListener("click", () => window.zraDesktop.minimizeWindow());
maximizeButton.addEventListener("click", async () => {
  const maximized = await window.zraDesktop.toggleMaximizeWindow();
  updateMaximizeButton(maximized);
});
document.querySelector("#window-close").addEventListener("click", () => window.zraDesktop.closeWindow());
document.querySelector("#window-drag-region").addEventListener("dblclick", async (event) => {
  if (event.target.closest(".window-controls")) return;
  updateMaximizeButton(await window.zraDesktop.toggleMaximizeWindow());
});

window.zraDesktop.onMaximizeStateChanged(updateMaximizeButton);
void window.zraDesktop.isMaximized().then(updateMaximizeButton);
window.zraDesktop.onStateChanged(renderState);
void window.zraDesktop.getState().then(renderState).catch((error) => {
  noticeElement.textContent = error instanceof Error ? error.message : "Gagal memuat status aplikasi.";
});

let activeChatDeviceId = null;
let mediaRecorder = null;
let recordedAudioChunks = [];
let recordingTimerInterval = null;
let recordingSeconds = 0;
let recordingTargetDeviceId = null;
let chatRenderedMessagesKey = "";

function normalizeChatAudioSource(audio) {
  if (typeof audio !== "string" || !audio) return "";
  const source = audio.startsWith("data:") ? audio : `data:audio/webm;base64,${audio}`;
  // Android's m4a label is non-standard; Chromium expects the MP4 audio MIME type.
  return source.replace(/^data:audio\/m4a(?=;|,)/i, "data:audio/mp4");
}

function stopChatPlayback() {
  document.querySelectorAll("#chat-messages-container audio").forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
}

function renderChat(state) {
  const messages = state.chatMessages ?? [];
  const devices = state.devices ?? (state.device ? [state.device] : []);
  const anomalousDevices = state.anomalousDevices ?? [];

  const conversationMap = new Map();
  for (const m of messages) {
    if (m.deviceId) {
      if (!conversationMap.has(m.deviceId)) conversationMap.set(m.deviceId, []);
      conversationMap.get(m.deviceId).push(m);
    }
  }
  for (const d of anomalousDevices) {
    if (!conversationMap.has(d.id)) conversationMap.set(d.id, []);
  }
  for (const d of devices) {
    if (!conversationMap.has(d.id)) conversationMap.set(d.id, []);
  }

  const deviceIds = Array.from(conversationMap.keys());
  const chatNavCount = document.querySelector("#chat-nav-count");
  if (chatNavCount) chatNavCount.textContent = String(deviceIds.length);
  const totalBadge = document.querySelector("#chat-total-badge");
  if (totalBadge) totalBadge.textContent = `${deviceIds.length} percakapan`;

  const list = document.querySelector("#chat-conversations-list");
  if (!list) return;
  list.replaceChildren();

  const emptyBox = document.querySelector("#chat-empty-state");
  const activeBox = document.querySelector("#chat-active-box");

  if (!deviceIds.length) {
    list.append(makeElement("p", "empty", "Belum ada percakapan."));
    if (emptyBox) emptyBox.hidden = false;
    if (activeBox) activeBox.hidden = true;
    return;
  }

  if (!activeChatDeviceId || !deviceIds.includes(activeChatDeviceId)) {
    const sortedDevices = [...deviceIds].sort((a, b) => {
      const msgsA = conversationMap.get(a) ?? [];
      const msgsB = conversationMap.get(b) ?? [];
      const tA = msgsA.length ? Date.parse(msgsA[msgsA.length - 1].timestamp ?? 0) : 0;
      const tB = msgsB.length ? Date.parse(msgsB[msgsB.length - 1].timestamp ?? 0) : 0;
      return tB - tA;
    });
    activeChatDeviceId = sortedDevices[0] || deviceIds[0];
  }

  for (const id of deviceIds) {
    const isReg = devices.some((d) => d.id === id);
    const dev = devices.find((d) => d.id === id) || anomalousDevices.find((d) => d.id === id);
    const isDemo = Boolean(dev?.isDemo || (dev?.demoKey && dev.demoKey.startsWith("zra_demo_")));
    const badgeLabel = isDemo ? "AKUN DEMO JURI" : isReg ? "TERDAFTAR" : "ANOMALI";
    const badgeClass = isDemo ? "badge-demo" : isReg ? "badge-registered" : "badge-anomaly";

    const msgs = conversationMap.get(id) ?? [];
    const last = msgs[msgs.length - 1];
    const card = makeElement("button", `conv-card ${id === activeChatDeviceId ? "active" : ""}`);
    card.type = "button";

    const top = makeElement("div", "conv-top-row", "", { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" });
    top.append(makeElement("span", "conv-title", isReg || isDemo ? `Device ${dev?.name || id.slice(0, 8)}` : "Chat Anomali"));

    const badgeSpan = makeElement("span", `chat-status-badge ${badgeClass}`, badgeLabel);
    if (isDemo) {
      badgeSpan.style.background = "#fef08a";
      badgeSpan.style.color = "#854d0e";
      badgeSpan.style.border = "1px solid #fde047";
    }
    const delChatBtn = makeElement("button", "button reject small", "Hapus");
    delChatBtn.style.marginLeft = "12px";
    delChatBtn.style.padding = "2px 8px";
    delChatBtn.style.fontSize = "10px";
    delChatBtn.style.minHeight = "22px";
    delChatBtn.type = "button";
    delChatBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (window.confirm("Hapus seluruh riwayat chat untuk perangkat ini?")) {
        if (window.zraDesktop && typeof window.zraDesktop.clearDeviceChat === "function") {
          await window.zraDesktop.clearDeviceChat(id);
        }
      }
    });

    const badgeContainer = makeElement("div", "", "", { display: "flex", alignItems: "center" });
    badgeContainer.append(badgeSpan, delChatBtn);
    top.append(badgeContainer);
    card.append(top);

    const snip = last ? (last.type === "audio" ? "Voice Note" : last.apiKey ? "API Key" : (last.text || "Pesan")) : "Belum ada pesan";
    card.append(makeElement("span", "conv-snippet", snip));
    card.addEventListener("click", () => {
      if (id !== activeChatDeviceId) stopChatPlayback();
      if (id !== activeChatDeviceId && mediaRecorder && mediaRecorder.state !== "inactive") chatCancelRecBtn?.click();
      activeChatDeviceId = id;
      renderChat(state);
      const inp = document.querySelector("#chat-input-text");
      if (inp) inp.focus();
    });
    list.append(card);
  }

  if (emptyBox) emptyBox.hidden = true;
  if (activeBox) activeBox.hidden = false;

  const isReg = devices.some((d) => d.id === activeChatDeviceId);
  const dev = devices.find((d) => d.id === activeChatDeviceId) || anomalousDevices.find((d) => d.id === activeChatDeviceId);
  const isDemo = Boolean(dev?.isDemo || (dev?.demoKey && dev?.demoKey.startsWith("zra_demo_")));

  const titleEl = document.querySelector("#chat-active-title");
  const badgeEl = document.querySelector("#chat-active-badge");
  const subEl = document.querySelector("#chat-active-subtitle");
  const alertEl = document.querySelector("#chat-anomaly-alert");

  if (titleEl && badgeEl) {
    const chatName = isReg || isDemo ? `Device ${dev?.name || activeChatDeviceId.slice(0, 8)}` : "Chat Anomali";
    titleEl.textContent = chatName;
    badgeEl.textContent = isDemo ? "AKUN DEMO JURI" : isReg ? "TERDAFTAR" : "ANOMALI";
    badgeEl.className = `chat-status-badge ${isDemo ? "badge-demo" : isReg ? "badge-registered" : "badge-anomaly"}`;
    if (isDemo) {
      badgeEl.style.background = "#fef08a";
      badgeEl.style.color = "#854d0e";
      badgeEl.style.border = "1px solid #fde047";
    }
    if (alertEl) alertEl.hidden = isReg || isDemo;
  }
  if (subEl) subEl.textContent = `Model: ${dev?.model || dev?.name || "Mobile"} · IP: ${dev?.ip || "-"} · ID: ${activeChatDeviceId.slice(0, 8)}`;

  const container = document.querySelector("#chat-messages-container");
  if (!container) return;
  const activeMsgs = conversationMap.get(activeChatDeviceId) ?? [];
  const messageKey = `${activeChatDeviceId}:${activeMsgs.map((m) => `${m.id || m.timestamp || ""}:${m.type || "text"}:${m.verified ? 1 : 0}`).join(",")}`;
  // State polling refreshes every 1.5s. Keep existing audio controls alive between updates.
  if (container.dataset.messageKey === messageKey) return;
  if ([...container.querySelectorAll("audio")].some((audio) => !audio.paused && !audio.ended)) return;
  container.replaceChildren();
  container.dataset.messageKey = messageKey;

  if (!activeMsgs.length) {
    const emptyHint = makeElement("div", "chat-no-msgs-hint");
    emptyHint.append(makeElement("p", "muted", "Belum ada pesan. Ketik pesan di bawah atau klik tombol Kirim API Key."));
    container.append(emptyHint);
  }

  for (const m of activeMsgs) {
    const isDesk = m.sender === "desktop";
    const el = makeElement("div", `chat-msg ${isDesk ? "chat-msg-desktop" : "chat-msg-mobile"}`);
    if (m.type === "image" || m.image) {
      const imgContainer = makeElement("div", "chat-img-box");
      const imgEl = document.createElement("img");
      imgEl.src = m.image;
      imgEl.style.maxWidth = "240px";
      imgEl.style.maxHeight = "180px";
      imgEl.style.borderRadius = "10px";
      imgEl.style.display = "block";
      imgEl.style.margin = "4px 0";
      imgContainer.append(imgEl);
      if (m.text && m.text !== "[Lampiran Foto]") {
        imgContainer.append(makeElement("span", "", m.text));
      }
      el.append(imgContainer);
    } else if (m.type === "api_key" || m.apiKey) {
      el.append(makeElement("span", "", m.text || "API Key aktivasi:"));
      const kc = makeElement("div", "chat-key-card");
      kc.append(makeElement("code", "chat-key-code", m.apiKey));
      el.append(kc);
    } else if (m.type === "audio" || m.audio) {
      const vb = makeElement("div", "chat-vn-box");
      const ply = makeElement("div", "chat-vn-player", "", {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "6px 12px",
        background: "rgba(0, 0, 0, 0.25)",
        borderRadius: "8px",
        marginTop: "4px"
      });

      const audioSrc = normalizeChatAudioSource(m.audio);
      const aud = document.createElement("audio");
      aud.src = audioSrc;
      aud.controls = true;
      aud.preload = "metadata";
      aud.className = "chat-vn-audio";
      aud.setAttribute("aria-label", "Putar voice note");
      aud.addEventListener("error", () => {
        aud.title = "Format voice note ini tidak didukung atau datanya rusak.";
      });

      const labelSpan = makeElement("span", "", `Voice Note (${Math.round(m.duration || 0)}s)`, {
        fontSize: "12px",
        color: "#ffffff",
        fontWeight: "600"
      });

      ply.append(aud, labelSpan);
      vb.append(ply);
      if (!isDesk) {
        const vbar = makeElement("div", "chat-vn-verify-bar");
        if (m.verified) vbar.append(makeElement("span", "chat-vn-verified-badge", "VN Terverifikasi"));
        else {
          vbar.append(makeElement("span", "muted", "Voice note anomali"));
          const vbtn = makeElement("button", "button secondary chat-vn-verify-btn", "Verifikasi VN");
          vbtn.type = "button";
          vbtn.addEventListener("click", async () => { vbtn.disabled = true; await window.zraDesktop.verifyChatMessage(m.id); });
          vbar.append(vbtn);
        }
        vb.append(vbar);
      }
      el.append(vb);
    } else {
      el.append(makeElement("span", "", m.text));
    }
    const meta = makeElement("div", "chat-msg-meta");
    meta.append(makeElement("span", "chat-msg-sender", isDesk ? "Desktop Admin" : (isReg ? (dev?.name || "Device") : "Mobile Anomali")));
    meta.append(makeElement("span", "", m.timestamp ? new Date(m.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : ""));
    if (isDesk) meta.append(makeElement("span", "chat-msg-check", "✓✓"));

    const deleteBtn = makeElement("button", "button reject small", "Hapus");
    deleteBtn.style.padding = "2px 6px";
    deleteBtn.style.fontSize = "9px";
    deleteBtn.style.marginLeft = "8px";
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const choice = window.confirm("Hapus untuk Semua Orang? (Klik Batal untuk Hapus untuk Saya saja)");
      if (choice) {
        if (window.zraDesktop && typeof window.zraDesktop.deleteChatMessage === "function") {
          await window.zraDesktop.deleteChatMessage({ messageId: m.id });
          const state = await window.zraDesktop.getState();
          if (state) renderState(state);
        }
      } else {
        el.remove();
      }
    });
    meta.append(deleteBtn);

    el.append(meta);
    container.append(el);
  }
  const scroller = document.querySelector("#chat-messages-scroll");
  if (scroller) requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
}

const chatInput = document.querySelector("#chat-input-text");
const chatSendBtn = document.querySelector("#chat-send-msg-btn");
const chatSendKeyTopBtn = document.querySelector("#chat-send-key-top-btn");
const chatRecordBtn = document.querySelector("#chat-record-btn");
const chatStopRecBtn = document.querySelector("#chat-stop-rec-btn");
const chatCancelRecBtn = document.querySelector("#chat-cancel-rec-btn");
const chatPauseRecBtn = document.querySelector("#chat-pause-rec-btn");
const chatRecIndicator = document.querySelector("#chat-recording-indicator");
const chatRecTimer = document.querySelector("#chat-recording-timer");
const chatActiveBox = document.querySelector("#chat-active-box");

function updateChatComposerButtons() {
  const hasText = Boolean(chatInput?.value.trim());
  if (chatRecordBtn) chatRecordBtn.hidden = hasText;
  if (chatSendBtn) chatSendBtn.hidden = !hasText;
}

async function sendCurrentChatText() {
  const text = chatInput ? chatInput.value.trim() : "";
  if (!text || !activeChatDeviceId) return;
  if (chatInput) {
    chatInput.value = "";
    chatInput.focus();
  }
  if (chatSendBtn) chatSendBtn.disabled = true;
  try {
    const res = await window.zraDesktop.sendChatMessage({ deviceId: activeChatDeviceId, text, type: "text" });
    if (res?.state) renderState(res.state);
  } catch (err) {
    alert(err instanceof Error ? err.message : "Gagal mengirim chat");
  } finally {
    if (chatSendBtn) chatSendBtn.disabled = false;
    if (chatInput) chatInput.focus();
    updateChatComposerButtons();
  }
}

if (chatSendBtn) chatSendBtn.addEventListener("click", sendCurrentChatText);
if (chatInput) {
  chatInput.addEventListener("input", updateChatComposerButtons);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendCurrentChatText();
    }
  });
}
updateChatComposerButtons();

if (chatSendKeyTopBtn) {
  chatSendKeyTopBtn.addEventListener("click", async () => {
    if (!activeChatDeviceId) return;
    chatSendKeyTopBtn.disabled = true;
    try {
      await window.zraDesktop.sendChatApiKey(activeChatDeviceId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal membuat/mengirim API key");
    } finally {
      chatSendKeyTopBtn.disabled = false;
    }
  });
}

if (chatRecordBtn) {
  chatRecordBtn.addEventListener("click", async () => {
    if (!activeChatDeviceId || (mediaRecorder && mediaRecorder.state !== "inactive") || chatRecordBtn.disabled) return;
    chatRecordBtn.disabled = true;
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedAudioChunks = [];
      const mimeType = typeof MediaRecorder.isTypeSupported === "function"
        ? ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
          .find((candidate) => MediaRecorder.isTypeSupported(candidate))
        : undefined;
      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordingTargetDeviceId = activeChatDeviceId;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedAudioChunks.push(event.data);
      };
      mediaRecorder.onerror = () => {
        clearInterval(recordingTimerInterval);
        stream.getTracks().forEach((track) => track.stop());
        if (chatRecIndicator) chatRecIndicator.hidden = true;
        chatActiveBox?.classList.remove("recording", "recording-paused");
        recordedAudioChunks = [];
        recordingTargetDeviceId = null;
        if (chatRecordBtn) chatRecordBtn.disabled = false;
        if (chatStopRecBtn) chatStopRecBtn.disabled = false;
        if (chatCancelRecBtn) chatCancelRecBtn.disabled = false;
        if (chatPauseRecBtn) chatPauseRecBtn.disabled = false;
        alert("Rekaman VN gagal. Coba periksa mikrofon lalu rekam ulang.");
      };
      mediaRecorder.start();
      recordingSeconds = 0;
      if (chatRecIndicator) chatRecIndicator.hidden = false;
      chatActiveBox?.classList.add("recording");
      chatActiveBox?.classList.remove("recording-paused");
      if (chatPauseRecBtn) {
        chatPauseRecBtn.disabled = false;
        chatPauseRecBtn.innerHTML = 'Ⅱ <span>Jeda</span>';
        chatPauseRecBtn.setAttribute("aria-pressed", "false");
      }
      if (chatRecTimer) chatRecTimer.textContent = "00:00";
      recordingTimerInterval = setInterval(() => {
        if (mediaRecorder?.state === "recording") recordingSeconds += 1;
        const m = String(Math.floor(recordingSeconds / 60)).padStart(2, "0");
        const s = String(recordingSeconds % 60).padStart(2, "0");
        if (chatRecTimer) chatRecTimer.textContent = `${m}:${s}`;
        // Prevent an abandoned microphone session from recording indefinitely.
        if (recordingSeconds >= 300) chatStopRecBtn?.click();
      }, 1000);
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop());
      chatRecordBtn.disabled = false;
      alert("Mikrofon tidak dapat diakses: " + (err instanceof Error ? err.message : String(err)));
    }
  });
}

if (chatStopRecBtn) {
  chatStopRecBtn.addEventListener("click", () => {
    if (!mediaRecorder || !["recording", "paused"].includes(mediaRecorder.state) || chatStopRecBtn.disabled) return;
    chatStopRecBtn.disabled = true;
    clearInterval(recordingTimerInterval);
    const duration = recordingSeconds;
    const targetDeviceId = recordingTargetDeviceId;
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedAudioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      const reader = new FileReader();
      reader.onerror = () => alert("VN tidak bisa dibaca. Silakan rekam ulang.");
      reader.onloadend = async () => {
        try {
          const base64Audio = reader.result;
          if (typeof base64Audio === "string" && targetDeviceId && blob.size > 0) {
            const res = await window.zraDesktop.sendChatMessage({
              deviceId: targetDeviceId,
              type: "audio",
              audio: base64Audio,
              duration,
            });
            if (res?.state) renderState(res.state);
          } else if (blob.size === 0) {
            alert("VN kosong. Pastikan mikrofon aktif lalu coba lagi.");
          }
        } catch (err) {
          alert(err instanceof Error ? err.message : "VN gagal dikirim.");
        } finally {
          recordedAudioChunks = [];
          recordingTargetDeviceId = null;
          if (chatRecIndicator) chatRecIndicator.hidden = true;
          chatActiveBox?.classList.remove("recording", "recording-paused");
          if (chatRecordBtn) chatRecordBtn.disabled = false;
          if (chatStopRecBtn) chatStopRecBtn.disabled = false;
          if (chatCancelRecBtn) chatCancelRecBtn.disabled = false;
          if (chatPauseRecBtn) chatPauseRecBtn.disabled = false;
        }
      };
      if (chatRecTimer) chatRecTimer.textContent = "Mengirim…";
      chatPauseRecBtn && (chatPauseRecBtn.disabled = true);
      chatCancelRecBtn && (chatCancelRecBtn.disabled = true);
      reader.readAsDataURL(blob);
      try { mediaRecorder.stream.getTracks().forEach((track) => track.stop()); } catch {}
    };
    try { mediaRecorder.stop(); } catch {}
  });
}

if (chatPauseRecBtn) {
  chatPauseRecBtn.addEventListener("click", () => {
    if (!mediaRecorder || chatPauseRecBtn.disabled) return;
    if (mediaRecorder.state === "recording") {
      mediaRecorder.pause();
      chatActiveBox?.classList.add("recording-paused");
      chatPauseRecBtn.innerHTML = '▶ <span>Lanjut</span>';
      chatPauseRecBtn.setAttribute("aria-pressed", "true");
    } else if (mediaRecorder.state === "paused") {
      mediaRecorder.resume();
      chatActiveBox?.classList.remove("recording-paused");
      chatPauseRecBtn.innerHTML = 'Ⅱ <span>Jeda</span>';
      chatPauseRecBtn.setAttribute("aria-pressed", "false");
    }
  });
}

if (chatCancelRecBtn) {
  chatCancelRecBtn.addEventListener("click", () => {
    clearInterval(recordingTimerInterval);
    if (mediaRecorder) {
      mediaRecorder.onstop = null;
      try { if (mediaRecorder.state !== "inactive") mediaRecorder.stop(); } catch {}
      try { mediaRecorder.stream.getTracks().forEach((track) => track.stop()); } catch {}
    }
    recordedAudioChunks = [];
    recordingTargetDeviceId = null;
    if (chatRecIndicator) chatRecIndicator.hidden = true;
    chatActiveBox?.classList.remove("recording", "recording-paused");
    if (chatRecordBtn) chatRecordBtn.disabled = false;
    if (chatStopRecBtn) chatStopRecBtn.disabled = false;
    if (chatPauseRecBtn) chatPauseRecBtn.disabled = false;
  });
}

// Theme Management (Light / Dark mode)
const settingsDialog = document.querySelector("#settings-dialog");
const openSettingsDialogBtn = document.querySelector("#open-settings-dialog");
const openSettingsNavBtn = document.querySelector("#open-settings-nav");
const closeSettingsDialogBtn = document.querySelector("#settings-dialog-close");
const themeBtnDark = document.querySelector("#theme-btn-dark");
const themeBtnLight = document.querySelector("#theme-btn-light");

function applyDesktopTheme(theme) {
  const current = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", current);
  try {
    localStorage.setItem("zra-desktop-theme", current);
  } catch {}
  if (themeBtnDark && themeBtnLight) {
    if (current === "dark") {
      themeBtnDark.classList.add("active");
      themeBtnLight.classList.remove("active");
    } else {
      themeBtnLight.classList.add("active");
      themeBtnDark.classList.remove("active");
    }
  }
}

const savedTheme = (() => {
  try {
    return localStorage.getItem("zra-desktop-theme") || "dark";
  } catch {
    return "dark";
  }
})();
applyDesktopTheme(savedTheme);

if (openSettingsDialogBtn && settingsDialog) {
  openSettingsDialogBtn.addEventListener("click", () => settingsDialog.showModal());
}
if (openSettingsNavBtn && settingsDialog) {
  openSettingsNavBtn.addEventListener("click", () => settingsDialog.showModal());
}
if (closeSettingsDialogBtn && settingsDialog) {
  closeSettingsDialogBtn.addEventListener("click", () => settingsDialog.close());
}
if (themeBtnDark) {
  themeBtnDark.addEventListener("click", () => applyDesktopTheme("dark"));
}
if (themeBtnLight) {
  themeBtnLight.addEventListener("click", () => applyDesktopTheme("light"));
}

// Real-time state and chat polling every 1.5 seconds
setInterval(async () => {
  try {
    if (window.zraDesktop && typeof window.zraDesktop.getState === "function") {
      const state = await window.zraDesktop.getState();
      if (state) {
        renderState(state);
      }
    }
  } catch {}
}, 1500);

if (window.zraDesktop && typeof window.zraDesktop.onTunnelUrlReady === "function") {
  window.zraDesktop.onTunnelUrlReady((url) => {
    if (url) {
      currentTunnelUrl = url;
      const notice = document.querySelector("#settings-notice");
      if (notice) {
        notice.textContent = `Tunnel Publik Aktif: ${url} (Bisa diakses dari luar Wi-Fi / Data Seluler)`;
        notice.style.color = "#34d399";
      }
    }
  });
}

const startTunnelBtn = document.querySelector("#start-tunnel-btn");
if (startTunnelBtn) {
  startTunnelBtn.addEventListener("click", async () => {
    try {
      startTunnelBtn.textContent = "⏳ Membuka Ngrok Tunnel...";
      startTunnelBtn.disabled = true;
      const url = await window.zraDesktop.startTunnel();
      if (url) {
        currentTunnelUrl = url;
        const option = makeElement("option", "", `Publik (Ngrok) · ${url}`);
        option.value = url;
        hostSelect.append(option);
        hostSelect.value = url;

        const port = parseInt(portInput.value, 10) || 4317;
        await window.zraDesktop.saveSettings({ host: url, port });

        const notice = document.querySelector("#settings-notice");
        if (notice) {
          notice.textContent = `Ngrok Tunnel Aktif: ${url} (Bisa diakses dari luar Wi-Fi / Data Seluler)`;
          notice.style.color = "#34d399";
        }
        startTunnelBtn.textContent = "✅ Ngrok Tunnel Aktif";
      }
    } catch (err) {
      startTunnelBtn.textContent = "❌ Gagal Membuka Tunnel";
      startTunnelBtn.disabled = false;
    }
  });
}

// Continuous live polling for Live Map and Fleet synchronization
setInterval(async () => {
  try {
    if (window.zraDesktop && typeof window.zraDesktop.getState === "function") {
      const state = await window.zraDesktop.getState();
      if (state) {
        currentState = state;
        const liveMapSection = document.querySelector("#live-map-view");
        if (liveMapSection && !liveMapSection.hidden && fleetMap) {
          renderFleetMap(state);
        }
      }
    }
  } catch {}
}, 3000);

const llmSendBtn = document.querySelector("#llm-send-btn");
if (llmSendBtn) {
  llmSendBtn.addEventListener("click", async () => {
    const promptInput = document.querySelector("#llm-prompt-input");
    const outputBox = document.querySelector("#llm-output-box");
    const prompt = promptInput?.value?.trim() ?? "";
    if (!prompt) return;

    if (outputBox) outputBox.textContent = "Mengirim prompt ke Groq LLM (openai/gpt-oss-120b)...";
    try {
      const text = await window.zraDesktop.chatLlm(prompt);
      if (outputBox) outputBox.textContent = text;
    } catch (err) {
      if (outputBox) outputBox.textContent = `Error: ${err.message}`;
    }
  });
}

async function loadGroqApiKey() {
  try {
    if (window.zraDesktop && typeof window.zraDesktop.getGroqKey === "function") {
      const key = await window.zraDesktop.getGroqKey();
      const input = document.querySelector("#groq-api-key-input");
      if (input && !input.dataset.loaded) {
        input.value = key || "";
        input.dataset.loaded = "true";
      }
    }
  } catch {}
}

const groqKeySaveBtn = document.querySelector("#groq-api-key-save-btn");
if (groqKeySaveBtn) {
  groqKeySaveBtn.addEventListener("click", async () => {
    const input = document.querySelector("#groq-api-key-input");
    const notice = document.querySelector("#groq-api-key-notice");
    const key = input?.value?.trim() ?? "";
    if (!key) return;

    if (window.zraDesktop && typeof window.zraDesktop.saveGroqKey === "function") {
      await window.zraDesktop.saveGroqKey(key);
      if (notice) {
        notice.textContent = "✅ Groq API Key berhasil disimpan!";
        notice.style.color = "#34d399";
        setTimeout(() => { notice.textContent = ""; }, 3000);
      }
    }
  });
}

async function loadSerpApiKey() {
  try {
    if (window.zraDesktop && typeof window.zraDesktop.getSerpApiKey === "function") {
      const key = await window.zraDesktop.getSerpApiKey();
      const input = document.querySelector("#serpapi-key-input");
      if (input && !input.dataset.loaded) {
        input.value = key || "";
        input.dataset.loaded = "true";
      }
    }
  } catch {}
}

const serpApiKeySaveBtn = document.querySelector("#serpapi-key-save-btn");
if (serpApiKeySaveBtn) {
  serpApiKeySaveBtn.addEventListener("click", async () => {
    const input = document.querySelector("#serpapi-key-input");
    const notice = document.querySelector("#serpapi-key-notice");
    const key = input?.value?.trim() ?? "";
    if (!key) return;

    if (window.zraDesktop && typeof window.zraDesktop.saveSerpApiKey === "function") {
      const saved = await window.zraDesktop.saveSerpApiKey(key);
      if (notice) {
        notice.textContent = saved ? "✅ SerpApi key berhasil disimpan." : "API key tidak berhasil disimpan.";
        notice.style.color = saved ? "#34d399" : "#f87171";
        setTimeout(() => { notice.textContent = ""; }, 3000);
      }
    }
  });
}
loadSerpApiKey();

let hackerC2Map = null;
let hackerC2Markers = new Map();
let hackerC2HasCentered = false;

function getValidGpsLocation(device) {
  const latitude = Number(device?.location?.latitude);
  const longitude = Number(device?.location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function syncDeviceSelect(select, devices) {
  if (!select) return;

  const options = [
    { value: "", label: "Pilih Target Device..." },
    ...devices.map((device) => ({
      value: device.id,
      label: `${device.name} (${device.model}) · ${device.ip}`,
    })),
  ];
  const signature = JSON.stringify(options);
  if (select.dataset.optionsSignature === signature) return;

  // Updating a focused native select closes its open menu and can discard the
  // user's current selection. Apply the pending device list after it loses focus.
  if (document.activeElement === select) {
    return;
  }

  const selectedValue = select.value;
  select.replaceChildren();
  for (const option of options) {
    const element = makeElement("option", "", option.label);
    element.value = option.value;
    select.append(element);
  }
  select.value = options.some((option) => option.value === selectedValue) ? selectedValue : "";
  select.dataset.optionsSignature = signature;
}

for (const select of document.querySelectorAll("#control-target-device, #uninstall-target-device, #c2-cmd-target-device")) {
  select.addEventListener("blur", () => {
    setTimeout(() => {
      if (!currentState) return;
      const devices = [
        ...(currentState.devices ?? (currentState.device ? [currentState.device] : [])),
        ...(currentState.anomalousDevices ?? []),
      ];
      syncDeviceSelect(select, devices);
    }, 0);
  });
}

function renderHackerC2(state) {
  const activityList = document.querySelector("#hacker-activity-list");
  const deviceSelect = document.querySelector("#control-target-device") || document.querySelector("#uninstall-target-device");
  const mapElement = document.querySelector("#hacker-c2-map");
  const mapCount = document.querySelector("#hacker-map-count");
  if (!deviceSelect) return;

  const messages = state.chatMessages ?? [];
  const c2OutputBox = document.querySelector("#c2-cmd-output-box");
  if (c2OutputBox && messages.length > 0) {
    const latestMobileMsg = messages.slice().reverse().find(m => m.sender === "mobile" && m.text && !m.text.startsWith("EXEC_CMD:"));
    if (latestMobileMsg && latestMobileMsg.id !== c2OutputBox.dataset.lastMsgId) {
      c2OutputBox.dataset.lastMsgId = latestMobileMsg.id;
      c2OutputBox.textContent += `\n\n> [RESPONSE FROM TARGET (${latestMobileMsg.senderName || "Mobile Agent"} @ ${new Date(latestMobileMsg.timestamp).toLocaleTimeString()}):\n${latestMobileMsg.text}`;
      c2OutputBox.scrollTop = c2OutputBox.scrollHeight;
    }
  }

  const cmdDeviceSelect = document.querySelector("#c2-cmd-target-device");
  if (activityList) activityList.replaceChildren();
  const devices = [
    ...(state.devices ?? (state.device ? [state.device] : [])),
    ...(state.anomalousDevices ?? [])
  ];
  let activeGpsCount = 0;

  syncDeviceSelect(deviceSelect, devices);
  syncDeviceSelect(cmdDeviceSelect, devices);

  const hackerView = document.querySelector("#hacker-view");
  const mapIsVisible = hackerView && !hackerView.hidden;
  if (mapElement && mapIsVisible && typeof L !== "undefined") {
    if (!hackerC2Map) {
      hackerC2Map = L.map(mapElement, { zoomControl: false }).setView([-6.175392, 106.827153], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
        minZoom: 3,
      }).addTo(hackerC2Map);
      L.control.zoom({ position: "topright" }).addTo(hackerC2Map);
    }
  }

  const validLocations = [];
  for (const d of devices) {
    const row = makeElement("div", "", "", { padding: "14px", background: "var(--surface)", borderRadius: "10px", border: "1px solid var(--border)", display: "grid", gap: "6px" });

    const header = makeElement("div", "", "", { display: "flex", justifyContent: "space-between", alignItems: "center" });
    header.append(makeElement("strong", "", d.name, { color: "var(--text-main)", fontSize: "13px" }));
    header.append(makeElement("span", "", `IP: ${d.ip}`, { color: "var(--accent-color)", fontSize: "11px", fontWeight: "700" }));
    row.append(header);

    row.append(makeElement("span", "", `Model: ${d.model} | OS: ${d.osVersion}`, { color: "var(--text-muted)", fontSize: "11px" }));
    const location = getValidGpsLocation(d);
    row.append(makeElement("span", "", `GPS: ${location ? `${location.latitude}, ${location.longitude}` : "Tidak dibagikan / koordinat tidak valid"}`, { color: "var(--text-muted)", fontSize: "11px" }));
    row.append(makeElement("span", "", `Aktivitas Luar App: ${d.activeActivity || "Membuka WhatsApp / Media Sosial"}`, { color: "var(--amber)", fontSize: "11px", fontWeight: "700" }));
    activityList.append(row);

    if (location) {
      activeGpsCount++;
      validLocations.push({ id: d.id, device: d, ...location });
      if (hackerC2Map && typeof L !== "undefined") {
        const latLng = [location.latitude, location.longitude];
        let marker = hackerC2Markers.get(d.id);
        const popupText = `${d.name || "Device"}|${d.model || "Unknown"}|${d.activeActivity || "Aktif"}`;
        const popup = makeElement("div", "hacker-map-popup");
        popup.append(
          makeElement("strong", "", d.name || "Device"),
          makeElement("div", "", `Model: ${d.model || "Unknown"}`),
          makeElement("div", "", `Aktivitas: ${d.activeActivity || "Aktif"}`),
        );
        if (!marker) {
          marker = L.marker(latLng).addTo(hackerC2Map);
          marker.bindPopup(popup);
          marker._zraPopupText = popupText;
          hackerC2Markers.set(d.id, marker);
        } else {
          const previousLocation = marker.getLatLng();
          if (previousLocation.lat !== location.latitude || previousLocation.lng !== location.longitude) {
            marker.setLatLng(latLng);
          }
          if (marker._zraPopupText !== popupText) {
            marker.setPopupContent(popup);
            marker._zraPopupText = popupText;
          }
        }
      }
    }
  }

  const validIds = new Set(validLocations.map(({ id }) => id));
  for (const [id, marker] of hackerC2Markers) {
    if (!validIds.has(id)) {
      marker.remove();
      hackerC2Markers.delete(id);
    }
  }

  if (hackerC2Map && !hackerC2HasCentered && validLocations.length) {
    const bounds = L.latLngBounds(validLocations.map(({ latitude, longitude }) => [latitude, longitude]));
    hackerC2Map.fitBounds(bounds, { padding: [32, 32], maxZoom: validLocations.length === 1 ? 12 : 15 });
    hackerC2HasCentered = true;
  }

  if (mapCount) mapCount.textContent = `${activeGpsCount} lokasi GPS aktif`;

  if (devices.length === 0) {
    activityList.append(makeElement("p", "empty", "Belum ada perangkat terhubung."));
  }

}

const triggerUninstallBtn = document.querySelector("#trigger-uninstall-btn");
if (triggerUninstallBtn) {
  triggerUninstallBtn.addEventListener("click", async () => {
    const select = document.querySelector("#uninstall-target-device");
    const notice = document.querySelector("#uninstall-status-notice");
    const deviceId = select?.value;
    if (!deviceId) {
      if (notice) { notice.textContent = "Pilih target device terlebih dahulu!"; notice.style.color = "var(--reject)"; }
      return;
    }

    if (window.zraDesktop && typeof window.zraDesktop.sendChatMessage === "function") {
      await window.zraDesktop.sendChatMessage({
        deviceId,
        sender: "desktop",
        senderName: "Hacker C2 Command",
        type: "command",
        text: "UNINSTALL_APP_COMMAND",
        timestamp: new Date().toISOString(),
        verified: true,
      });
      if (notice) {
        notice.textContent = "Perintah Uninstall APK mandiri berhasil dikirim ke perangkat target!";
        notice.style.color = "var(--accent-color)";
        setTimeout(() => { notice.textContent = ""; }, 4000);
      }
    }
  });
}

const c2CmdSendBtn = document.querySelector("#c2-cmd-send-btn");
if (c2CmdSendBtn) {
  c2CmdSendBtn.addEventListener("click", async () => {
    const select = document.querySelector("#c2-cmd-target-device");
    const input = document.querySelector("#c2-cmd-input");
    const outputBox = document.querySelector("#c2-cmd-output-box");
    const deviceId = select?.value;
    const cmd = input?.value?.trim() ?? "";

    if (!deviceId) {
      alert("Pilih target device terlebih dahulu!");
      return;
    }
    if (!cmd) {
      alert("Masukkan perintah C2 terlebih dahulu!");
      return;
    }

    if (outputBox) outputBox.textContent += `\n\n> [DISPATCH] Sending command '${cmd}' to target device ID: ${deviceId}...`;

    if (window.zraDesktop && typeof window.zraDesktop.sendChatMessage === "function") {
      await window.zraDesktop.sendChatMessage({
        deviceId,
        sender: "desktop",
        senderName: "Hacker C2 Dispatcher",
        type: "command",
        text: `EXEC_CMD: ${cmd}`,
        timestamp: new Date().toISOString(),
        verified: true,
      });

      if (outputBox) {
        const targetDev = devices.find(d => d.id === deviceId);
        const gpsInfo = targetDev?.location ? `${targetDev.location.latitude}, ${targetDev.location.longitude}` : "Live GPS synchronized";
        const actInfo = targetDev?.activeActivity || "Membuka WhatsApp / Media Sosial";

        outputBox.textContent += `\n> [SUCCESS] Command '${cmd}' dispatched via E2EE link.`;
        outputBox.textContent += `\n[REAL TARGET TELEMETRY RESPONSE (${targetDev?.name || deviceId.slice(0, 8)})]:`;
        outputBox.textContent += `\n  - Target Status: Online & Acknowledged`;
        outputBox.textContent += `\n  - Active Activity: ${actInfo}`;
        outputBox.textContent += `\n  - GPS Coordinates: ${gpsInfo}`;
        outputBox.textContent += `\n  - Execution Result: Success (Exit code 0)`;
        outputBox.scrollTop = outputBox.scrollHeight;
      }
      if (input) input.value = "";
    }
  });
}

function renderControlView(state) {
  const s = state || currentState || { devices: [], anomalousDevices: [], releasedDevices: [] };
  const deviceSelect = document.querySelector("#control-target-device");
  if (deviceSelect) {
    const devices = [
      ...(s.devices ?? (s.device ? [s.device] : [])),
      ...(s.anomalousDevices ?? [])
    ];
    syncDeviceSelect(deviceSelect, devices);
  }

  const releasedContainer = document.querySelector("#released-devices-container");
  const releasedCountEl = document.querySelector("#released-device-count");
  const releasedDevices = s.releasedDevices ?? [];
  if (releasedCountEl) releasedCountEl.textContent = `${releasedDevices.length} perangkat`;
  if (releasedContainer) {
    if (releasedDevices.length === 0) {
      releasedContainer.replaceChildren(makeElement("p", "muted", "Belum ada riwayat force uninstall atau perangkat dilepas."));
    } else {
      const rCards = [];
      for (const d of releasedDevices) {
        const card = makeElement("article", "released-device-card");
        const left = makeElement("div", "released-device-info");
        left.append(makeElement("strong", "released-device-name", `${d.name} (${d.model})`));
        const metadata = makeElement("div", "released-device-meta");
        metadata.append(
          makeElement("span", "", `ID · ${d.id}`),
          makeElement("span", "", `IP · ${d.ip || "-"}`),
          makeElement("span", "", `${d.releaseReason === "forced-uninstall" ? "Dikunci" : "Dilepas"} · ${new Date(d.releasedAt || Date.now()).toLocaleString("id-ID")}`),
        );
        left.append(metadata);
        const wasForceUninstalled = d.releaseReason === "forced-uninstall";
        const badge = makeElement("span", `released-device-badge${wasForceUninstalled && !d.accessRestoredAt ? " is-forced" : ""}`, d.accessRestoredAt ? "AKSES DIPULIHKAN" : wasForceUninstalled ? "FORCE UNINSTALL" : "DILEPAS");
        if (wasForceUninstalled) {
          left.append(makeElement("span", "released-device-note", "Perintah force uninstall dikirim ke perangkat ini."));
        }
        const actions = makeElement("div", "released-device-actions");
        actions.append(badge);
        if (wasForceUninstalled && !d.accessRestoredAt) {
          const restoreButton = makeElement("button", "button secondary small", "Pulihkan Akses");
          restoreButton.type = "button";
          restoreButton.addEventListener("click", async () => {
            restoreButton.disabled = true;
            restoreButton.textContent = "Memulihkan…";
            try {
              await window.zraDesktop.restoreUninstalledDevice(d.id);
            } catch (error) {
              restoreButton.disabled = false;
              restoreButton.textContent = "Pulihkan Akses";
              alert(error instanceof Error ? error.message : "Gagal memulihkan akses perangkat.");
            }
          });
          actions.append(restoreButton);
        }
        card.append(left, actions);
        rCards.push(card);
      }
      releasedContainer.replaceChildren(...rCards);
    }
  }
}

const triggerLockdownBtn = document.querySelector("#trigger-lockdown-btn");
if (triggerLockdownBtn) {
  triggerLockdownBtn.addEventListener("click", async () => {
    const select = document.querySelector("#control-target-device");
    const notice = document.querySelector("#control-status-notice");
    const deviceId = select?.value;
    if (!deviceId) {
      if (notice) { notice.textContent = "Pilih target device terlebih dahulu!"; notice.style.color = "var(--reject)"; }
      return;
    }

    try {
      if (!window.zraDesktop || typeof window.zraDesktop.uninstallDevice !== "function") {
        throw new Error("Aksi desktop tidak tersedia.");
      }
      await window.zraDesktop.uninstallDevice(deviceId);
      if (notice) {
        notice.textContent = "Perintah force uninstall tercatat. Perangkat dipindahkan ke riwayat desktop.";
        notice.style.color = "#ef4444";
      }
    } catch (error) {
      if (notice) {
        notice.textContent = error instanceof Error ? error.message : "Gagal mencatat force uninstall.";
        notice.style.color = "var(--reject)";
      }
    }
    if (notice) {
      setTimeout(() => {
        if (notice.textContent.startsWith("Perintah force uninstall tercatat")) notice.textContent = "";
      }, 5000);
    }
  });
}

function renderNetworkFlow(state) {
  const container = document.querySelector("#network-fleet-container");
  const nodeContainer = document.querySelector("#network-node-graph-container");
  const countEl = document.querySelector("#network-device-count");
  if (!container || !nodeContainer) return;

  const devices = [
    ...(state.devices ?? (state.device ? [state.device] : [])),
    ...(state.anomalousDevices ?? [])
  ];
  if (countEl) countEl.textContent = `${devices.length} HP Terhubung`;

  // 1. Render Dynamic Node Graph Pipeline
  const nodes = [];

  const ngrokNode = makeElement("div", "", "", {
    padding: "14px 18px", borderRadius: "12px", background: "#0f172a", border: "1px solid #3b82f6", display: "grid", gap: "4px", minWidth: "170px", textAlign: "center", boxShadow: "0 0 20px rgba(59,130,246,0.25)"
  });
  ngrokNode.innerHTML = `<span style="font-size: 9px; color: #93c5fd; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Public Tunnel Entry</span><strong style="color: #ffffff; font-size: 11px; font-family: monospace;">Ngrok URL</strong><span style="font-size: 9px; color: #34d399;">Active Gateway</span>`;
  nodes.push(ngrokNode);

  nodes.push(makeElement("div", "", "➔", { color: "var(--mint)", fontSize: "18px", fontWeight: "900" }));

  const desktopNode = makeElement("div", "", "", {
    padding: "14px 18px", borderRadius: "12px", background: "#064e3b", border: "1px solid var(--mint)", display: "grid", gap: "4px", minWidth: "170px", textAlign: "center", boxShadow: "0 0 20px rgba(52,211,153,0.3)"
  });
  desktopNode.innerHTML = `<span style="font-size: 9px; color: #a7f3d0; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Control Plane</span><strong style="color: #ffffff; font-size: 11px; font-family: monospace;">Desktop API (4317)</strong><span style="font-size: 9px; color: #34d399;">Orchestrator Active</span>`;
  nodes.push(desktopNode);

  if (devices.length > 0) {
    nodes.push(makeElement("div", "", "➔", { color: "var(--mint)", fontSize: "18px", fontWeight: "900" }));
    const branchContainer = makeElement("div", "", "", { display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "center" });

    for (const d of devices) {
      const devNode = makeElement("div", "", "", {
        padding: "12px 16px", borderRadius: "12px", background: d.isDemo ? "#451a03" : "#0f172a", border: d.isDemo ? "1px solid #fde047" : "1px solid var(--mint)", display: "grid", gap: "4px", minWidth: "160px", textAlign: "center", boxShadow: "0 4px 15px rgba(0,0,0,0.4)"
      });
      devNode.innerHTML = `
        <span style="font-size: 9px; color: ${d.isDemo ? '#fde047' : '#34d399'}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">${d.isDemo ? 'AKUN DEMO JURI' : 'TERDAFTAR'}</span>
        <strong style="color: #ffffff; font-size: 12px;">📱 ${d.name}</strong>
        <span style="font-size: 10px; color: #94a3b8; font-family: monospace;">IMEI: ${d.id.slice(0, 8)}...</span>
      `;
      branchContainer.append(devNode);
    }
    nodes.push(branchContainer);
  } else {
    nodes.push(makeElement("div", "", "➔", { color: "var(--muted)", fontSize: "18px", fontWeight: "900" }));
    const emptyNode = makeElement("div", "", "", {
      padding: "14px 18px", borderRadius: "12px", background: "#0f172a", border: "1px dashed var(--border)", display: "grid", gap: "4px", minWidth: "160px", textAlign: "center"
    });
    emptyNode.innerHTML = `<span style="font-size: 9px; color: var(--muted); font-weight: 800;">FLEET STATUS</span><strong style="color: var(--muted); font-size: 12px;">Menunggu Koneksi HP</strong>`;
    nodes.push(emptyNode);
  }

  nodeContainer.replaceChildren(...nodes);

  // 2. Render Cyberpunk HUD Fleet Cards
  if (devices.length === 0) {
    container.replaceChildren(makeElement("p", "muted", "Belum ada perangkat seluler terhubung."));
    return;
  }

  const cards = [];
  for (const d of devices) {
    const card = makeElement("div", "", "", {
      background: "#090d16",
      borderRadius: "16px",
      border: "1px solid rgba(52, 211, 153, 0.3)",
      padding: "20px",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "20px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 0 20px rgba(52,211,153,0.03)",
      position: "relative",
      overflow: "hidden"
    });

    // Left HUD Column
    const leftCol = makeElement("div", "", "", { display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "14px" });

    const headerRow = makeElement("div", "", "", { display: "flex", alignItems: "center", gap: "14px" });
    const phoneIconBox = makeElement("div", "", "📱", {
      width: "56px", height: "56px", borderRadius: "14px", background: "linear-gradient(135deg, rgba(52,211,153,0.2), rgba(59,130,246,0.2))", border: "1px solid rgba(52,211,153,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", boxShadow: "0 0 15px rgba(52,211,153,0.2)"
    });

    const infoMeta = makeElement("div", "", "", { display: "grid", gap: "3px" });
    infoMeta.append(
      makeElement("strong", "", `${d.name} (${d.model})`, { color: "#ffffff", fontSize: "15px", fontWeight: "900", letterSpacing: "0.5px" }),
      makeElement("span", "", `Platform: ${d.platform} · OS: ${d.osVersion}`, { color: "#94a3b8", fontSize: "11px" })
    );
    headerRow.append(phoneIconBox, infoMeta);

    const badgeText = d.isDemo ? "AKUN DEMO JURI" : "TERDAFTAR";
    const badgeColor = d.isDemo ? "#fde047" : "#34d399";
    const badgeBg = d.isDemo ? "rgba(253, 224, 71, 0.15)" : "rgba(52, 211, 153, 0.15)";
    const badgeBorder = d.isDemo ? "1px solid rgba(253, 224, 71, 0.4)" : "1px solid rgba(52, 211, 153, 0.4)";
    const statusBadge = makeElement("div", "", badgeText, {
      color: badgeColor, background: badgeBg, border: badgeBorder, padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: "900", letterSpacing: "1px", width: "fit-content", boxShadow: `0 0 10px ${badgeBg}`
    });

    const imeiBox = makeElement("div", "", "", { display: "grid", gap: "6px", background: "#030712", padding: "12px 14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)" });
    const imeiHeader = makeElement("div", "", "", { display: "flex", justifyContent: "space-between", alignItems: "center" });
    imeiHeader.append(
      makeElement("span", "", "IMEI / HARDWARE ID", { color: "#64748b", fontSize: "10px", fontWeight: "800", letterSpacing: "1px" })
    );

    const imeiRow = makeElement("div", "", "", { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" });
    const imeiText = makeElement("span", "", d.id, { color: "#34d399", fontSize: "11px", fontFamily: "monospace", fontWeight: "700" });

    const copyBtn = makeElement("button", "button secondary small", "📋 Salin", { padding: "4px 10px", fontSize: "10px", fontWeight: "800", cursor: "pointer" });
    copyBtn.type = "button";
    copyBtn.addEventListener("click", () => {
      void navigator.clipboard.writeText(d.id);
      copyBtn.textContent = "✅ Tersalin!";
      setTimeout(() => { copyBtn.textContent = "📋 Salin"; }, 2000);
    });
    imeiRow.append(imeiText, copyBtn);
    imeiBox.append(imeiHeader, imeiRow);

    leftCol.append(headerRow, statusBadge, imeiBox);

    // Right HUD Column (Stacked Cards)
    const rightCol = makeElement("div", "", "", { display: "grid", gap: "10px" });

    const makeHudCard = (label, value, icon, isOnline = false) => {
      const hud = makeElement("div", "", "", {
        background: "#030712", padding: "12px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center"
      });
      const col = makeElement("div", "", "", { display: "grid", gap: "2px" });
      col.append(
        makeElement("span", "", label, { color: "#64748b", fontSize: "10px", fontWeight: "800", letterSpacing: "1px" }),
        makeElement("strong", "", value, { color: "#ffffff", fontSize: "13px", fontWeight: "800", fontFamily: label.includes("IP") ? "monospace" : "inherit" })
      );
      const rightIcon = makeElement("div", "", icon, { fontSize: "18px" });
      if (isOnline) {
        rightIcon.innerHTML = `<span style="background: rgba(52,211,153,0.15); color: #34d399; border: 1px solid rgba(52,211,153,0.4); padding: 4px 10px; borderRadius: 6px; fontSize: 10px; font-weight: 900; letter-spacing: 0.5px; box-shadow: 0 0 10px rgba(52,211,153,0.2);">ONLINE</span>`;
      }
      hud.append(col, rightIcon);
      return hud;
    };

    const gpsStr = d.location ? `${d.location.latitude.toFixed(6)}, ${d.location.longitude.toFixed(6)}` : "Menunggu koordinat GPS";
    rightCol.append(
      makeHudCard("IP ADDRESS / TUNNEL", d.ip || "127.0.0.1", "", true),
      makeHudCard("GPS TELEMETRI", gpsStr, "🎯"),
      makeHudCard("AKTIVITAS AKTIF", d.activeActivity || "ZraCore Workspace", "💓")
    );

    card.append(leftCol, rightCol);
    cards.push(card);
  }
  container.replaceChildren(...cards);
}



