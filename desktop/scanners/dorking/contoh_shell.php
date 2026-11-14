
<?php
session_start();

$_SESSION['csrf'] ??= bin2hex(random_bytes(32));

$message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($_SESSION['csrf'], $_POST['csrf'] ?? '')) {
        http_response_code(403);
        exit('Invalid CSRF token');
    }

    if (isset($_FILES['testfile'])) {
        $file = $_FILES['testfile'];

        if ($file['error'] !== UPLOAD_ERR_OK) {
            $message = 'Upload failed.';
        } elseif ($file['size'] > 102400) {
            $message = 'Maximum file size is 100 KB.';
        } elseif (
            !in_array(
                strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)),
                ['txt', 'log'],
                true
            )
        ) {
            $message = 'Only TXT and LOG test files are accepted.';
        } else {
            $message = 'Upload validation passed. File was not stored.';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ZraCyber Mini Shell</title>
<style>
* { box-sizing:border-box; }
body {
    margin:0;
    background:#080d18;
    color:#dce5f2;
    font-family:Arial,sans-serif;
}
header {
    padding:20px;
    background:#101827;
    border-bottom:1px solid #263449;
    display:flex;
    justify-content:space-between;
    align-items:center;
}
.logo {color:#42e89a;font-size:20px;font-weight:bold}
.status {color:#42e89a;font-size:12px}
.container {max-width:1100px;margin:25px auto;padding:0 16px}
.cards {
    display:grid;
    grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
    gap:15px;
}
.card {
    background:#111c2d;
    border:1px solid #263449;
    border-radius:10px;
    padding:18px;
}
.card small {color:#8da2bb}
.card h2 {color:#42e89a;margin-bottom:0}
.panel {
    background:#101827;
    border:1px solid #263449;
    border-radius:10px;
    margin-top:20px;
    overflow:hidden;
}
.panel-title {
    padding:15px;
    border-bottom:1px solid #263449;
    font-weight:bold;
}
.terminal {
    padding:20px;
    min-height:240px;
    background:#050a12;
    color:#42e89a;
    font-family:monospace;
    font-size:13px;
    line-height:1.9;
}
.terminal-input {
    display:flex;
    gap:10px;
    margin-top:12px;
}
input {
    background:#080d18;
    color:white;
    border:1px solid #34445c;
    border-radius:6px;
    padding:12px;
    width:100%;
}
button {
    background:#16a36a;
    color:white;
    border:0;
    border-radius:6px;
    padding:11px 18px;
    cursor:pointer;
}
button:hover {background:#128454}
.upload {padding:20px}
.result {color:#42e89a;margin-top:15px}
footer {
    text-align:center;
    color:#65758b;
    padding:30px;
    font-size:12px;
}
</style>
</head>
<body>

<header>
    <div class="logo">ZraCyber / Mini Shell</div>
    <div class="status">● LAB SIMULATION</div>
</header>

<div class="container">

    <div class="cards">
        <div class="card">
            <small>PHP VERSION</small>
            <h2><?= htmlspecialchars(PHP_VERSION) ?></h2>
        </div>
        <div class="card">
            <small>SERVER SOFTWARE</small>
            <h2 style="font-size:17px">
                <?= htmlspecialchars($_SERVER['SERVER_SOFTWARE'] ?? 'Unknown') ?>
            </h2>
        </div>
        <div class="card">
            <small>OPERATING SYSTEM</small>
            <h2 style="font-size:17px">
                <?= htmlspecialchars(PHP_OS_FAMILY) ?>
            </h2>
        </div>
    </div>

    <div class="panel">
        <div class="panel-title">Terminal Simulator</div>
        <div class="terminal">
            <div id="output">
                ZraCyber Security Lab v1.0<br>
                Type "help" to see available commands.<br><br>
            </div>
            <div class="terminal-input">
                <input id="command" placeholder="Enter simulated command..."
                       autocomplete="off">
                <button onclick="runCommand()">Run</button>
            </div>
        </div>
    </div>

    <div class="panel">
        <div class="panel-title">Upload Security Tester</div>
        <div class="upload">
            <form method="POST" enctype="multipart/form-data">
                <input type="hidden" name="csrf"
                       value="<?= htmlspecialchars($_SESSION['csrf']) ?>">
                <input type="file" name="testfile" required>
                <br><br>
                <button type="submit">Validate Upload</button>
            </form>

            <?php if ($message): ?>
                <div class="result">
                    <?= htmlspecialchars($message) ?>
                </div>
            <?php endif; ?>
        </div>
    </div>

</div>

<footer>
    ZraCyber-Core Security Lab · Authorized Testing Only
</footer>

<script>
const output = document.getElementById('output');
const input = document.getElementById('command');

const commands = {
    help: 'Available: help, clear, whoami, php, os, date',
    whoami: 'security-lab',
    php: 'PHP <?= htmlspecialchars(PHP_VERSION) ?>',
    os: '<?= htmlspecialchars(PHP_OS_FAMILY) ?>',
    date: new Date().toString()
};

function runCommand() {
    const cmd = input.value.trim().toLowerCase();

    if (!cmd) return;

    const line = document.createElement('div');
    line.textContent = 'zra@lab:~$ ' + cmd;
    output.appendChild(line);

    if (cmd === 'clear') {
        output.replaceChildren();
    } else {
        const result = document.createElement('div');
        result.textContent = commands[cmd] || 'Command unavailable in simulator.';
        output.appendChild(result);
    }

    input.value = '';
}

input.addEventListener('keydown', event => {
    if (event.key === 'Enter') runCommand();
});
</script>

</body>
</html>
