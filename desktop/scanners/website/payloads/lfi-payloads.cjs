module.exports = [
  { payload: "../../../../etc/passwd", indicator: "root:x:0:0:", title: "Local File Inclusion (LFI) / Path Traversal", severity: "Critical", cwe: "CWE-22" },
  { payload: "..\\..\\..\\..\\windows\\win.ini", indicator: "[extensions]", title: "Windows Path Traversal", severity: "High", cwe: "CWE-22" }
];
