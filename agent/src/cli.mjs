#!/usr/bin/env node
const USAGE = `Usage: papermemory-mcp <command>

Commands:
  install      Install the native host and register PaperMemory with agents
  uninstall    Remove everything install created
  selfheal     Rewrite wrappers and host manifests from the local copy
  libraries    List connected PaperMemory libraries as JSON
  serve        Run the MCP server on stdio
`;

const commands = {
    install: () => import("./install.mjs"),
    uninstall: () => import("./install.mjs"),
    selfheal: () => import("./install.mjs"),
    libraries: () => import("./libraries.mjs"),
    serve: () => import("./serve.mjs"),
};

const [command, ...args] = process.argv.slice(2);

if (!Object.hasOwn(commands, command ?? "")) {
    process.stderr.write(USAGE);
    process.exit(2);
}

try {
    const mod = await commands[command]();
    await mod[command](args);
} catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
}
