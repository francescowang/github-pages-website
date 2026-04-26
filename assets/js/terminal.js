'use strict';

(async function () {
  const terminalContainer = document.getElementById('terminal');
  if (!terminalContainer) return;

  let fileSystem = {};
  let currentPath = '/home/francesco';
  let previousPath = '/home/francesco';
  let commandHistory = [];
  let historyIndex = -1;

  try {
    const response = await fetch('./assets/data/terminal-commands.json', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    fileSystem = await response.json();
  } catch {
    appendOutput('Error: failed to load terminal data.', 'error');
    return;
  }

  // string = file, object = directory
  function isDir(node) {
    return typeof node === 'object' && node !== null;
  }

  function getNode(absPath) {
    if (absPath === '/home/francesco') return fileSystem;
    const rel = absPath.replace('/home/francesco/', '');
    const parts = rel.split('/').filter(Boolean);
    let node = fileSystem;
    for (const part of parts) {
      if (!isDir(node) || !(part in node)) return null;
      node = node[part];
    }
    return node;
  }

  function resolvePath(input) {
    if (!input || input === '~') return '/home/francesco';
    if (input === '-') return previousPath;
    if (input.startsWith('~/')) return '/home/francesco/' + input.slice(2);
    if (input.startsWith('/')) return input;

    const base = currentPath.split('/').filter(Boolean);
    for (const part of input.split('/')) {
      if (part === '..') base.pop();
      else if (part !== '.') base.push(part);
    }
    return '/' + base.join('/');
  }

  function appendOutput(text, className = '') {
    const el = document.createElement('div');
    el.className = className ? `terminal-output ${className}` : 'terminal-output';
    el.textContent = text;
    terminalContainer.appendChild(el);
    terminalContainer.scrollTop = terminalContainer.scrollHeight;
  }

  function displayPrompt() {
    const line = document.createElement('div');
    line.className = 'terminal-line';
    const displayPath = currentPath === '/home/francesco'
      ? '~'
      : currentPath.replace('/home/francesco', '~');

    line.innerHTML =
      `<span class="tp-user">francesco@ubuntu</span>` +
      `<span class="tp-colon">:</span>` +
      `<span class="tp-path">${Utils.escapeHtml(displayPath)}</span>` +
      `<span class="tp-dollar">$ </span>`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'terminal-input';
    input.autocomplete = 'off';
    input.setAttribute('spellcheck', 'false');

    line.appendChild(input);
    terminalContainer.appendChild(line);
    input.focus();

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleCommand(input.value);
        line.remove();
        displayPrompt();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        historyIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        input.value = historyIndex >= 0
          ? commandHistory[commandHistory.length - 1 - historyIndex]
          : '';
        setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        historyIndex = Math.max(historyIndex - 1, -1);
        input.value = historyIndex >= 0
          ? commandHistory[commandHistory.length - 1 - historyIndex]
          : '';
        setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
      }
    });
  }

  function lsNode(node, label, longFormat) {
    if (!isDir(node)) {
      appendOutput(`ls: '${label}': Not a directory`, 'error');
      return;
    }
    const keys = Object.keys(node).sort();
    if (!longFormat) {
      appendOutput(keys.map(k => isDir(node[k]) ? k + '/' : k).join('  '));
    } else {
      appendOutput(`total ${keys.length}`);
      keys.forEach(k => {
        const flag = isDir(node[k]) ? 'drwxr-xr-x' : '-rw-r--r--';
        appendOutput(`${flag}  1  francesco  ${k}${isDir(node[k]) ? '/' : ''}`);
      });
    }
  }

  function treeNode(node, prefix) {
    const keys = Object.keys(node).sort();
    keys.forEach((k, i) => {
      const last = i === keys.length - 1;
      appendOutput(prefix + (last ? '└── ' : '├── ') + k + (isDir(node[k]) ? '/' : ''));
      if (isDir(node[k])) treeNode(node[k], prefix + (last ? '    ' : '│   '));
    });
  }

  function handleCommand(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    commandHistory.push(trimmed);
    historyIndex = -1;

    const displayPath = currentPath === '/home/francesco'
      ? '~'
      : currentPath.replace('/home/francesco', '~');
    appendOutput(`francesco@ubuntu:${displayPath}$ ${trimmed}`, 'command');

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);
    const flags = args.filter(a => a.startsWith('-'));
    const operands = args.filter(a => !a.startsWith('-'));

    switch (cmd) {

      case 'pwd':
        appendOutput(currentPath);
        break;

      case 'whoami':
        appendOutput('francesco');
        break;

      case 'hostname':
        appendOutput('ubuntu');
        break;

      case 'date':
        appendOutput(new Date().toString());
        break;

      case 'uname':
        appendOutput(flags.includes('-a')
          ? 'Linux ubuntu 6.8.0-ubuntu SMP x86_64 GNU/Linux'
          : 'Linux');
        break;

      case 'echo':
        appendOutput(operands.join(' '));
        break;

      case 'clear':
        terminalContainer.innerHTML = '';
        break;

      case 'history':
        commandHistory.forEach((entry, i) => appendOutput(`  ${i + 1}  ${entry}`));
        break;

      case 'ls': {
        const longFormat = flags.some(f => f.includes('l'));
        const target = operands[0];
        if (target) {
          const p = resolvePath(target);
          const node = getNode(p);
          if (node === null) {
            appendOutput(`ls: cannot access '${target}': No such file or directory`, 'error');
          } else {
            lsNode(node, target, longFormat);
          }
        } else {
          lsNode(getNode(currentPath), currentPath, longFormat);
        }
        break;
      }

      case 'cd': {
        const target = operands[0];
        if (!target) {
          previousPath = currentPath;
          currentPath = '/home/francesco';
          break;
        }
        const newPath = resolvePath(target);
        const node = getNode(newPath);
        if (node === null) {
          appendOutput(`cd: ${target}: No such file or directory`, 'error');
        } else if (!isDir(node)) {
          appendOutput(`cd: ${target}: Not a directory`, 'error');
        } else {
          previousPath = currentPath;
          currentPath = newPath;
        }
        break;
      }

      case 'cat': {
        const target = operands[0];
        if (!target) {
          appendOutput('cat: missing file operand', 'error');
          break;
        }
        const p = resolvePath(target);
        const node = getNode(p);
        if (node === null) {
          appendOutput(`cat: ${target}: No such file or directory`, 'error');
        } else if (isDir(node)) {
          appendOutput(`cat: ${target}: Is a directory`, 'error');
        } else {
          appendOutput(node);
        }
        break;
      }

      case 'tree': {
        const target = operands[0];
        const p = target ? resolvePath(target) : currentPath;
        const node = getNode(p);
        if (node === null) {
          appendOutput(`tree: '${target}': No such file or directory`, 'error');
        } else if (!isDir(node)) {
          appendOutput(`tree: '${target}': Not a directory`, 'error');
        } else {
          const label = p === '/home/francesco' ? '~' : p.replace('/home/francesco', '~');
          appendOutput(label + '/');
          treeNode(node, '');
        }
        break;
      }

      case 'help':
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
          'Try:  ls  →  cd portfolio  →  cat about',
        ].join('\n'));
        break;

      default:
        appendOutput(`${cmd}: command not found`, 'error');
    }
  }

  appendOutput('Ubuntu 24.04 LTS  |  Francesco Wang\'s Portfolio');
  appendOutput('Type "help" for available commands.\n');
  displayPrompt();
})();
