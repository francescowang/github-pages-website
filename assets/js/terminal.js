'use strict';

(async function () {
  const terminalContainer = document.getElementById('terminal');
  if (!terminalContainer) return;

  let commands = {};
  let commandHistory = [];
  let historyIndex = -1;

  // Load commands from JSON
  try {
    const response = await fetch('./assets/data/terminal-commands.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to load commands');
    const data = await response.json();
    commands = data.commands;
  } catch (error) {
    console.error('Error loading terminal commands:', error);
    return;
  }

  function appendOutput(text, className = '') {
    const line = document.createElement('div');
    line.className = `terminal-output ${className}`;
    line.textContent = text;
    terminalContainer.appendChild(line);
    terminalContainer.scrollTop = terminalContainer.scrollHeight;
  }

  function displayPrompt() {
    const promptLine = document.createElement('div');
    promptLine.className = 'terminal-line';
    promptLine.innerHTML = '<span class="terminal-prompt">$ </span>';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'terminal-input';
    input.placeholder = 'Enter command...';
    input.autocomplete = 'off';

    promptLine.appendChild(input);
    terminalContainer.appendChild(promptLine);
    input.focus();

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleCommand(input.value);
        promptLine.remove();
        displayPrompt();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        historyIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        input.value = historyIndex >= 0 ? commandHistory[commandHistory.length - 1 - historyIndex] : '';
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        historyIndex = Math.max(historyIndex - 1, -1);
        input.value = historyIndex >= 0 ? commandHistory[commandHistory.length - 1 - historyIndex] : '';
      }
    });
  }

  function handleCommand(input) {
    const trimmed = input.trim();
    if (!trimmed) return;

    commandHistory.push(trimmed);
    historyIndex = -1;

    appendOutput(`$ ${trimmed}`, 'command');

    // Handle cat with filename
    if (trimmed.startsWith('cat ')) {
      const arg = trimmed.slice(4).trim();
      if (commands[arg]) {
        appendOutput(commands[arg].output);
      } else {
        appendOutput(`cat: ${arg}: No such file or directory`, 'error');
      }
    }
    // Handle echo with text
    else if (trimmed.startsWith('echo ')) {
      const text = trimmed.slice(5).trim().replace(/^\$/, '').trim();
      if (commands[trimmed]) {
        appendOutput(commands[trimmed].output);
      } else {
        appendOutput(text);
      }
    }
    // Handle clear
    else if (trimmed === 'clear') {
      terminalContainer.innerHTML = '';
    }
    // Handle commands with flags (ls -la, uname -a, man <topic>)
    else if (commands[trimmed]) {
      appendOutput(commands[trimmed].output);
    }
    // Single commands
    else {
      const cmd = trimmed.split(/\s+/)[0].toLowerCase();
      if (commands[cmd]) {
        appendOutput(commands[cmd].output);
      } else {
        appendOutput(`command not found: ${cmd}. Type 'help' for available commands.`, 'error');
      }
    }
  }

  appendOutput('Welcome to Francesco Wang\'s Interactive Portfolio');
  appendOutput('Type "help" to see available commands.\n');
  displayPrompt();
})();
