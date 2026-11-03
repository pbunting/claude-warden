'use strict';
// Shared logging for observer hook scripts (JavaScript version of lib.sh).
//
// Logging never touches stdout or stderr, so hooks keep both channels for
// talking to Claude Code. A logging failure is ignored so it can't break a hook.
//
// wardenLogInit(name)
//   Sets the log file to ~/.claude-warden/<name>.log. All projects share it,
//   so each line is tagged with the project folder's name.
// wardenLog(...message)
//   Appends one timestamped line to that log file.

const fs = require('fs');
const os = require('os');
const path = require('path');

let logName = 'observer';
let project = 'unknown';
let logFile = null;

function wardenLogInit(name) {
  logName = name;
  project = path.basename(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  try {
    const dir = path.join(os.homedir(), '.claude-warden');
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, `${name}.log`);
  } catch {
    logFile = null;
  }
}

function wardenLog(...message) {
  if (!logFile) return;
  const time = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  try {
    fs.appendFileSync(logFile, `${time} [${project}] [${logName}] ${message.join(' ')}\n`);
  } catch {
    // Ignore: logging must never break a hook.
  }
}

module.exports = { wardenLogInit, wardenLog };
