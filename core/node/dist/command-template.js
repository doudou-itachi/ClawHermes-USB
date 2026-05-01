"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandCommandTemplate = expandCommandTemplate;
function expandCommandTemplate(command, env) {
    return command
        .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name) => env[name] ?? match)
        .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (match, name) => env[name] ?? match);
}
