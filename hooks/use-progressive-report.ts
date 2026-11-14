import { useCallback, useState } from "react";

type Finding = Record<string, any>;
type Report = { vulnerabilities?: Finding[]; [key: string]: any };

const REVEAL_INTERVAL_MS = 180;

/** Reveal confirmed findings sequentially after the scan report is received. */
export function useProgressiveReport() {
  const [report, setReport] = useState<Report | null>(null);

  const revealReport = useCallback(async (fullReport: Report, onFinding?: (finding: Finding) => void) => {
    const findings = Array.isArray(fullReport.vulnerabilities)
      ? fullReport.vulnerabilities.filter((finding) => {
          const status = String(finding?.status ?? "").toLowerCase();
          return finding?.success !== false && status !== "failed" && status !== "error";
        })
      : [];
    if (findings.length === 0) {
      setReport(fullReport);
      return;
    }

    setReport({ ...fullReport, vulnerabilities: [] });
    for (let index = 0; index < findings.length; index += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, REVEAL_INTERVAL_MS));
      onFinding?.(findings[index]);
      setReport({ ...fullReport, vulnerabilities: findings.slice(0, index + 1) });
    }
  }, []);

  const clearReport = useCallback(() => setReport(null), []);
  return { report, setReport, revealReport, clearReport };
}
