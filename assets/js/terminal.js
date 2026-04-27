'use strict';

(async function () {
  const terminalContainer = document.getElementById('terminal');
  if (!terminalContainer) return;

  const HOME = '/home/francesco';
  const COMMANDS = [
    'cat', 'cd', 'clear', 'date', 'echo', 'help',
    'history', 'hostname', 'ls', 'pwd', 'tree', 'uname', 'whoami',
  ];

  let fileSystem = {};
  let currentPath = HOME;
  let previousPath = HOME;
  let commandHistory = [];
  let historyIndex = -1;

  // --- Initialise ---

  async function resolveRefs(obj) {
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val && typeof val === 'object') {
        if ('$ref' in val) {
          try {
            const res = await fetch(val.$ref, { cache: 'no-store' });
            const text = res.ok ? await res.text() : `Error: could not load ${val.$ref}`;
            obj[key] = val.$ref.endsWith('.md') ? { $markdown: text } : text;
          } catch {
            obj[key] = `Error: could not load ${val.$ref}`;
          }
        } else {
          await resolveRefs(val);
        }
      }
    }
  }

  try {
    const res = await fetch('./assets/data/terminal-commands.json', { cache: 'no-store' });
    if (!res.ok) throw new Error();
    fileSystem = await res.json();
    await resolveRefs(fileSystem);
  } catch {
    appendOutput('Error: failed to load terminal data.', 'error');
    return;
  }

  // --- File System Helpers ---

  function normalizePath(p) {
    const parts = p.split('/').filter(Boolean);
    const result = [];
    for (const part of parts) {
      if (part === '..') { if (result.length > 0) result.pop(); }
      else if (part !== '.') result.push(part);
    }
    return '/' + result.join('/');
  }

  function isDir(node) {
    return typeof node === 'object' && node !== null && !('$markdown' in node);
  }

  function getNode(absPath) {
    const parts = absPath.split('/').filter(Boolean);
    let node = fileSystem;
    for (const part of parts) {
      if (!isDir(node) || !(part in node)) return null;
      node = node[part];
    }
    return node;
  }

  function resolvePath(input) {
    if (!input || input === '~') return HOME;
    if (input === '-') return previousPath;
    if (input.startsWith('~/')) return normalizePath(HOME + '/' + input.slice(2));
    if (input.startsWith('/')) return normalizePath(input);
    return normalizePath(currentPath + '/' + input);
  }

  function promptPath() {
    if (currentPath === HOME) return '~';
    if (currentPath.startsWith(HOME + '/')) return '~' + currentPath.slice(HOME.length);
    return currentPath || '/';
  }

  // --- Output Helpers ---

  function appendOutput(text, className) {
    const el = document.createElement('div');
    el.className = className ? `terminal-output ${className}` : 'terminal-output';
    el.textContent = text;
    terminalContainer.appendChild(el);
    terminalContainer.scrollTop = terminalContainer.scrollHeight;
  }

  function appendLsShortFormat(node) {
    const el = document.createElement('div');
    el.className = 'terminal-output';
    const keys = Object.keys(node).sort().filter(k => !k.startsWith('$'));
    keys.forEach((k, i) => {
      const dir = isDir(node[k]);
      const span = document.createElement('span');
      span.textContent = k + (dir ? '/' : '') + (i < keys.length - 1 ? '  ' : '');
      span.className = dir ? 'ls-dir' : 'ls-file';
      el.appendChild(span);
    });
    terminalContainer.appendChild(el);
  }

  function appendLsLongFormat(node) {
    const keys = Object.keys(node).sort().filter(k => !k.startsWith('$'));
    appendOutput(`total ${keys.length}`);
    keys.forEach(k => {
      const dir = isDir(node[k]);
      const locked = dir && node[k].$locked;
      const el = document.createElement('div');
      el.className = 'terminal-output';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = k + (dir ? '/' : '');
      nameSpan.className = dir ? 'ls-dir' : 'ls-file';
      const meta = locked
        ? 'drwxr-x---  root       root       '
        : (dir ? 'drwxr-xr-x  1  francesco  ' : '-rw-r--r--  1  francesco  ');
      el.appendChild(document.createTextNode(meta));
      el.appendChild(nameSpan);
      terminalContainer.appendChild(el);
    });
  }

  function appendLs(node, longFormat) {
    const keys = Object.keys(node).sort().filter(k => !k.startsWith('$'));
    if (!keys.length) return;
    longFormat ? appendLsLongFormat(node) : appendLsShortFormat(node);
    terminalContainer.scrollTop = terminalContainer.scrollHeight;
  }

  function renderTree(node, rootLabel) {
    const lines = [rootLabel === '/' ? '/' : rootLabel + '/'];
    function collect(n, prefix) {
      const keys = Object.keys(n).sort().filter(k => !k.startsWith('$'));
      keys.forEach((k, i) => {
        const last = i === keys.length - 1;
        const dir = isDir(n[k]);
        const locked = dir && n[k].$locked;
        lines.push(prefix + (last ? '└── ' : '├── ') + k + (dir ? '/' : ''));
        if (dir && !locked) collect(n[k], prefix + (last ? '    ' : '│   '));
      });
    }
    collect(node, '');
    appendOutput(lines.join('\n'));
  }

  // --- Input Handling ---

  function handleTab(input) {
    const val = input.value;
    const parts = val.split(/\s+/);
    const isCompletingCmd = parts.length === 1 && !val.endsWith(' ');

    if (isCompletingCmd) {
      const matches = COMMANDS.filter(c => c.startsWith(parts[0]));
      if (matches.length === 1) {
        input.value = matches[0] + ' ';
      } else if (matches.length > 1) {
        appendOutput(matches.join('  '));
      }
      return;
    }

    const prefix = parts[parts.length - 1];
    const node = getNode(currentPath);
    if (!isDir(node)) return;

    const matches = Object.keys(node)
      .filter(k => k.startsWith(prefix) && !k.startsWith('$'))
      .sort();

    if (matches.length === 1) {
      const match = matches[0];
      parts[parts.length - 1] = match + (isDir(node[match]) ? '/' : '');
      input.value = parts.join(' ');
    } else if (matches.length > 1) {
      appendOutput(matches.map(k => k + (isDir(node[k]) ? '/' : '')).join('  '));
    }
  }

  function handleHistoryNavigation(input, key) {
    if (key === 'ArrowUp') {
      historyIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
    } else {
      historyIndex = Math.max(historyIndex - 1, -1);
    }
    input.value = historyIndex >= 0
      ? commandHistory[commandHistory.length - 1 - historyIndex] : '';
    setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
  }

  function displayPasswordPrompt(callback) {
    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.innerHTML = `<span class="tp-label">[sudo] password for francesco:</span> `;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'terminal-input';
    input.autocomplete = 'off';
    input.style.cssText = 'position:absolute;opacity:0;width:0;height:0;';

    line.appendChild(input);
    terminalContainer.appendChild(line);
    input.focus({ preventScroll: true });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        line.remove();
        callback(input.value);
      }
    });
  }

  function displayPrompt() {
    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.innerHTML =
      `<span class="tp-user">francesco@ubuntu</span>` +
      `<span class="tp-colon">:</span>` +
      `<span class="tp-path">${Utils.escapeHtml(promptPath())}</span>` +
      `<span class="tp-dollar">$ </span>`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'terminal-input';
    input.autocomplete = 'off';
    input.setAttribute('spellcheck', 'false');

    line.appendChild(input);
    terminalContainer.appendChild(line);
    input.focus({ preventScroll: true });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const needsPrompt = handleCommand(input.value);
        line.remove();
        if (needsPrompt !== false) displayPrompt();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        handleTab(input);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleHistoryNavigation(input, e.key);
      }
    });
  }

  // --- Command Handlers ---

  function cmdPwd() {
    appendOutput(currentPath);
  }

  function cmdWhoami() {
    appendOutput('francesco');
  }

  function cmdHostname() {
    appendOutput('ubuntu');
  }

  function cmdDate() {
    appendOutput(new Date().toString());
  }

  function cmdUname(flags) {
    appendOutput(flags.includes('-a')
      ? 'Linux ubuntu 6.8.0-ubuntu SMP x86_64 GNU/Linux'
      : 'Linux');
  }

  function cmdEcho(args) {
    appendOutput(args.join(' '));
  }

  function cmdClear() {
    terminalContainer.innerHTML = '';
  }

  function cmdHistory() {
    commandHistory.forEach((entry, i) => appendOutput(`  ${i + 1}  ${entry}`));
  }

  function cmdLs(flags, operands) {
    const longFormat = flags.some(f => f.includes('l'));
    const target = operands[0];
    const p = target ? resolvePath(target) : currentPath;
    const node = getNode(p);
    if (node === null) {
      appendOutput(`ls: cannot access '${target}': No such file or directory`, 'error');
    } else if (node.$locked) {
      appendOutput(`ls: cannot open directory '${p}': Permission denied`, 'error');
    } else if (!isDir(node)) {
      appendOutput(`ls: '${target}': Not a directory`, 'error');
    } else {
      appendLs(node, longFormat);
    }
  }

  function cmdCd(operands) {
    const target = operands[0];
    if (!target) { previousPath = currentPath; currentPath = HOME; return; }
    const newPath = resolvePath(target);
    const node = getNode(newPath);
    if (node === null) {
      appendOutput(`cd: ${target}: No such file or directory`, 'error');
    } else if (node.$locked) {
      appendOutput(`bash: cd: ${newPath}: Permission denied`, 'error');
      appendOutput(`(You need root privileges — try: sudo cd ${newPath})`);
    } else if (!isDir(node)) {
      appendOutput(`cd: ${target}: Not a directory`, 'error');
    } else {
      previousPath = currentPath;
      currentPath = newPath;
    }
  }

  function cmdCat(operands) {
    const target = operands[0];
    if (!target) { appendOutput('cat: missing file operand', 'error'); return; }
    const node = getNode(resolvePath(target));
    if (node === null) {
      appendOutput(`cat: ${target}: No such file or directory`, 'error');
    } else if (isDir(node)) {
      appendOutput(`cat: ${target}: Is a directory`, 'error');
    } else if (node.$markdown) {
      const el = document.createElement('div');
      el.className = 'terminal-output terminal-markdown';
      el.innerHTML = marked.parse(node.$markdown);
      terminalContainer.appendChild(el);
      terminalContainer.scrollTop = terminalContainer.scrollHeight;
    } else {
      appendOutput(node);
    }
  }

  function cmdTree(operands) {
    const target = operands[0];
    const p = target ? resolvePath(target) : currentPath;
    const node = getNode(p);
    if (node === null) {
      appendOutput(`tree: '${target}': No such file or directory`, 'error');
    } else if (node.$locked) {
      appendOutput(`tree: '${p}': Permission denied`, 'error');
    } else if (!isDir(node)) {
      appendOutput(`tree: '${target}': Not a directory`, 'error');
    } else {
      const label = p === HOME ? '~' : (p.startsWith(HOME + '/') ? '~' + p.slice(HOME.length) : p || '/');
      renderTree(node, label);
    }
  }

  function cmdHelp() {
    appendOutput([
      'Commands:',
      '',
      '  ls [dir]       List directory contents',
      '  ls -l [dir]    Long listing format',
      '  cd <dir>       Change directory  (supports .., ~, -)',
      '  cat <file>     Display file contents',
      '  pwd            Print working directory',
      '  tree [dir]     Show directory tree',
      '  echo [text]    Print text',
      '  whoami         Print current user',
      '  hostname       Print hostname',
      '  date           Print current date and time',
      '  uname [-a]     Print system information',
      '  history        Show command history',
      '  clear          Clear the terminal',
      '  help           Show this message',
      '',
      'Tip: press Tab to autocomplete commands and filenames.',
      'Try: ls /  →  cd /home/francesco  →  cat cv',
    ].join('\n'));
  }

  function handleSudo() {
    let attempts = 0;
    const maxAttempts = 3;
    function tryPassword() {
      displayPasswordPrompt(() => {
        attempts++;
        if (attempts < maxAttempts) {
          appendOutput('Sorry, try again.');
          tryPassword();
        } else {
          appendOutput(`sudo: ${maxAttempts} incorrect password attempts`, 'error');
          displayPrompt();
        }
      });
    }
    tryPassword();
    return false;
  }

  function handleCommand(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    commandHistory.push(trimmed);
    historyIndex = -1;

    appendOutput(`francesco@ubuntu:${promptPath()}$ ${trimmed}`, 'command');

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0];

    if (cmd === 'sudo') return handleSudo();

    const args = parts.slice(1);
    const flags = args.filter(a => a.startsWith('-'));
    const operands = args.filter(a => !a.startsWith('-'));

    switch (cmd) {
      case 'pwd': cmdPwd(); break;
      case 'whoami': cmdWhoami(); break;
      case 'hostname': cmdHostname(); break;
      case 'date': cmdDate(); break;
      case 'uname': cmdUname(flags); break;
      case 'echo': cmdEcho(args); break;
      case 'clear': cmdClear(); break;
      case 'history': cmdHistory(); break;
      case 'ls': cmdLs(flags, operands); break;
      case 'cd': cmdCd(operands); break;
      case 'cat': cmdCat(operands); break;
      case 'tree': cmdTree(operands); break;
      case 'help': cmdHelp(); break;
      default: appendOutput(`${cmd}: command not found`, 'error');
    }
  }

  // --- Setup ---

  terminalContainer.addEventListener('click', () => {
    const input = terminalContainer.querySelector('.terminal-input');
    if (input) input.focus({ preventScroll: true });
  });

  appendOutput("Ubuntu 24.04 LTS  |  Francesco Wang's Portfolio");
  appendOutput('Type "help" for available commands.\n');
  displayPrompt();
})();
