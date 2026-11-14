function generateWriteupReport(target, dns, urlGraph, findings, stats, crawledPages = []) {
  const pages = (Array.isArray(crawledPages) ? crawledPages : []).map((page) => ({
    url: page.url,
    status: page.status,
    reachable: Boolean(page.reachable),
    formCount: Array.isArray(page.forms) ? page.forms.length : 0,
  }));

  return {
    success: true,
    scanType: "modular-website-penetration-testing",
    summary: `Audit penetrasi web berhasil diselesaikan untuk ${target.url}. Ditemukan ${findings.length} observasi kerentanan.`,
    limitations: "Analisis dilakukan melalui recon DNS, URL graph crawling, rule engine, dan AI correlation.",
    target: target.url,
    dnsRecon: dns,
    urlGraph,
    pages,
    pageCount: pages.filter((page) => page.reachable).length,
    stats,
    vulnerabilities: findings,
    logs: [
      `[RECON] Memulai pemindaian DNS dan IP intelligence untuk ${target.hostname}`,
      `[CRAWLER] Membangun URL graph dari origin ${target.origin}`,
      `[RULE-ENGINE] Ditemukan ${findings.length} observasi temuan kerentanan web.`,
      `[SUCCESS] Laporan Write-up website pentest berhasil disusun.`
    ]
  };
}

module.exports = { generateWriteupReport };
