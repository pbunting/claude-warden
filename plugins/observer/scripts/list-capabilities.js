#!/usr/bin/env node
'use strict';
// SessionStart hook. Lists the skills, installed plugins (with enabled state and
// hook events) and MCP servers for the current session, and writes them as one
// JSON line to ~/.claude-warden/session-start.log for the observer plugin to read:
//   {"skills":[{name,source,version?}], "plugins":[{name,version,enabled,events}], "mcpServers":[{name,source}]}
// Plugins are identified by "name@marketplace" plus version; plugin skills carry
// their plugin's version.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { wardenLogInit, wardenLog } = require('./lib.js');

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// Sorted entries of dir whose names match pattern (hidden ones skipped, like a shell glob).
function list(dir, pattern = /^[^.]/) {
  try {
    return fs.readdirSync(dir).filter((n) => pattern.test(n)).sort().map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

// Resolved, symlink-free form of p (falls back to a plain resolve if it doesn't exist).
function realPath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

const subdirs = (dir) => list(dir).filter(isDir);
const hasSkill = (dir) => isFile(path.join(dir, 'SKILL.md'));
const sorted = (set) => [...set].sort();
const byName = (a, b) =>
  a.name.localeCompare(b.name) ||
  (a.source ?? '').localeCompare(b.source ?? '') ||
  String(a.version ?? '').localeCompare(String(b.version ?? ''), undefined, { numeric: true });
const mcpServers = (o) => (isObject(o) && isObject(o.mcpServers) ? Object.keys(o.mcpServers) : []);

// Paths a plugin.json field lists (a string or an array of strings).
function manifestPaths(manifest, field) {
  const value = manifest?.[field];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string');
  return [];
}
const resolveIn = (dir, rel) => path.join(dir, rel.replace(/^\.\//, ''));

function main() {
  let input = {};
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    // No or bad input: fall back to the current folder.
  }
  wardenLog('observer: SessionStart hook fired');

  const cwd = (isObject(input) && input.cwd) || process.cwd();
  const home = os.homedir();
  const out = { skills: [], plugins: [], mcpServers: [] };
  // Skills keyed by source, name and (for plugin skills) version, so a repeat is
  // listed once but a user and a project skill with the same name both appear.
  const skills = new Map();
  const addSkill = (name, source, version) =>
    skills.set(`${source}\0${name}\0${version}`, version === undefined ? { name, source } : { name, source, version });

  for (const [source, base] of [['user', home], ['project', cwd]]) {
    for (const d of subdirs(path.join(base, '.claude/skills'))) {
      if (hasSkill(d)) addSkill(path.basename(d), source);
    }
  }

  // Enabled state: settings files in precedence order (user, project, local);
  // a later file's value for a plugin overrides an earlier one.
  const enabled = new Map();
  const settingsFiles = [
    path.join(home, '.claude/settings.json'),
    path.join(cwd, '.claude/settings.json'),
    path.join(cwd, '.claude/settings.local.json'),
  ];
  for (const file of settingsFiles) {
    const entries = readJson(file)?.enabledPlugins;
    if (!isObject(entries)) continue;
    for (const [key, on] of Object.entries(entries)) enabled.set(key, on !== false && on != null);
  }

  // Installed plugins keyed by "name@marketplace" and version. The same version
  // installed at several scopes is one entry with several install folders.
  // The version comes from installed_plugins.json, else from plugin.json.
  const plugins = new Map();
  const installed = readJson(path.join(home, '.claude/plugins/installed_plugins.json'))?.plugins;
  if (isObject(installed)) {
    for (const [key, entries] of Object.entries(installed)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!(entry && typeof entry.installPath === 'string' && entry.installPath)) continue;
        const dir = entry.installPath;
        const manifest = readJson(path.join(dir, '.claude-plugin/plugin.json'));
        const v = typeof entry.version === 'string' ? entry.version : manifest?.version;
        const version = typeof v === 'string' && v ? v : null;
        const id = `${key}\0${version}`;
        if (!plugins.has(id)) {
          plugins.set(id, { name: key, version, enabled: enabled.get(key) === true, dirs: new Map() });
        }
        plugins.get(id).dirs.set(dir, manifest);
      }
    }
  }

  // A plugin's skills and hooks are in its default folders (skills/, hooks/hooks.json),
  // any paths its plugin.json lists under "skills" or "hooks", and inline hooks
  // in plugin.json. Only enabled plugins contribute skills and hook events.
  for (const { name: key, version, enabled: on, dirs } of plugins.values()) {
    const pluginName = key.replace(/@[^@]*$/, '');
    const events = new Set();
    if (on) {
      for (const [dir, manifest] of dirs) {
        for (const rel of ['skills', ...manifestPaths(manifest, 'skills')]) {
          const d = resolveIn(dir, rel);
          // A path can be one skill folder or a folder of skill folders.
          const found = hasSkill(d) ? [d] : subdirs(d).filter(hasSkill);
          for (const s of found) addSkill(`${pluginName}:${path.basename(s)}`, `plugin:${key}`, version);
        }

        for (const rel of ['hooks/hooks.json', ...manifestPaths(manifest, 'hooks')]) {
          const hooks = readJson(resolveIn(dir, rel))?.hooks;
          if (isObject(hooks)) Object.keys(hooks).forEach((e) => events.add(e));
        }
        const inline = manifest?.hooks;
        if (isObject(inline)) {
          const hooks = inline.hooks ?? inline;
          if (isObject(hooks)) Object.keys(hooks).forEach((e) => events.add(e));
        }
      }
    }
    out.plugins.push({ name: key, version, enabled: on, events: sorted(events) });
  }
  out.plugins.sort(byName);
  out.skills = [...skills.values()].sort(byName);

  // MCP servers keyed by name; a later scope (project .mcp.json, then local
  // project entry in ~/.claude.json) overrides an earlier one, as in Claude Code.
  const claudeJson = readJson(path.join(home, '.claude.json'));
  // Match the project entry by real path, so a trailing slash or symlink in cwd
  // (or in the stored key) still finds it.
  const projects = isObject(claudeJson?.projects) ? claudeJson.projects : {};
  const cwdReal = realPath(cwd);
  const projectKey = cwd in projects ? cwd : Object.keys(projects).find((k) => realPath(k) === cwdReal);
  const servers = new Map();
  for (const [source, config] of [
    ['user', claudeJson],
    ['project', readJson(path.join(cwd, '.mcp.json'))],
    ['local', projectKey === undefined ? null : projects[projectKey]],
  ]) {
    for (const name of mcpServers(config)) servers.set(name, { name, source });
  }
  out.mcpServers = [...servers.values()].sort(byName);

  wardenLog(out);
}

wardenLogInit('session-start');
try {
  main();
} catch (err) {
  // Fail open: log the problem but never break the session.
  wardenLog(`observer: list-capabilities failed: ${err && err.message}`);
}
process.exitCode = 0;
