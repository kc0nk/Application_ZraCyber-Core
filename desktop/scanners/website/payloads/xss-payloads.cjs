module.exports = [
  { payload: "<script>alert(1)</script>", indicator: "<script>alert(1)</script>" },
  { payload: "\"><img src=x onerror=alert(1)>", indicator: "onerror=alert(1)" },
  { payload: "';alert(String.fromCharCode(88,83,83))//", indicator: "alert(" },
  { payload: "<svg/onload=alert(1)>", indicator: "onload=alert(1)" }
];
