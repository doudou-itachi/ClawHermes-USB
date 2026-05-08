"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.portableSkillsDir = portableSkillsDir;
exports.ensurePortableSkillsDir = ensurePortableSkillsDir;
exports.listPortableSkills = listPortableSkills;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const portable_1 = require("./portable");
const MAX_SKILL_FILE_BYTES = 256_000;
function portableSkillsDir(usbRoot) {
    return (0, node_path_1.join)((0, portable_1.getRoot)(usbRoot), "skills");
}
function ensurePortableSkillsDir(usbRoot) {
    const dir = portableSkillsDir(usbRoot);
    (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    return dir;
}
function listPortableSkills(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const skillsDir = portableSkillsDir(root);
    const exists = (0, node_fs_1.existsSync)(skillsDir);
    if (!exists) {
        return {
            root,
            skillsDir,
            exists: false,
            total: 0,
            deduplicated: false,
            skills: [],
        };
    }
    const byName = new Map();
    let rawCount = 0;
    const files = findSkillFiles(skillsDir);
    for (const filePath of files) {
        const skill = readPortableSkill(skillsDir, filePath);
        if (!skill)
            continue;
        rawCount += 1;
        const previous = byName.get(skill.name);
        if (previous) {
            previous.duplicateCount += 1;
            continue;
        }
        byName.set(skill.name, skill);
    }
    const skills = Array.from(byName.values()).sort((left, right) => left.name.localeCompare(right.name, "en"));
    return {
        root,
        skillsDir,
        exists: true,
        total: skills.length,
        deduplicated: rawCount !== skills.length,
        skills,
    };
}
function findSkillFiles(rootDir) {
    const files = [];
    const stack = [rootDir];
    while (stack.length > 0) {
        const dir = stack.pop();
        if (!dir)
            continue;
        let entries;
        try {
            entries = (0, node_fs_1.readdirSync)(dir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (entry.name.startsWith(".") || entry.name === "node_modules")
                continue;
            const child = (0, node_path_1.join)(dir, entry.name);
            if (entry.isDirectory()) {
                stack.push(child);
            }
            else if (entry.isFile() && entry.name === "SKILL.md") {
                files.push(child);
            }
        }
    }
    return files.sort((left, right) => left.localeCompare(right));
}
function readPortableSkill(skillsDir, filePath) {
    try {
        if ((0, node_fs_1.statSync)(filePath).size > MAX_SKILL_FILE_BYTES)
            return null;
        const content = (0, node_fs_1.readFileSync)(filePath, "utf8");
        const frontmatter = parseFrontmatter(content);
        const fallbackName = (0, node_path_1.relative)(skillsDir, (0, node_path_1.resolve)(filePath)).split(/[\\/]/)[0] || "skill";
        const name = (frontmatter.name || fallbackName).trim();
        const description = (frontmatter.description || "").trim();
        if (!name || !description)
            return null;
        return {
            name,
            description,
            filePath: (0, node_path_1.resolve)(filePath),
            relativePath: (0, node_path_1.relative)(skillsDir, (0, node_path_1.resolve)(filePath)),
            source: "portable",
            duplicateCount: 0,
        };
    }
    catch {
        return null;
    }
}
function parseFrontmatter(content) {
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!normalized.startsWith("---\n"))
        return {};
    const endIndex = normalized.indexOf("\n---", 4);
    if (endIndex === -1)
        return {};
    const block = normalized.slice(4, endIndex);
    const result = {};
    const lines = block.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
        if (!match)
            continue;
        const key = match[1];
        const value = match[2].trim();
        if (value === "|" || value === ">") {
            const valueLines = [];
            while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
                index += 1;
                valueLines.push(lines[index].trim());
            }
            result[key] = valueLines.join(value === ">" ? " " : "\n").trim();
        }
        else {
            result[key] = stripQuotes(value);
        }
    }
    return result;
}
function stripQuotes(value) {
    if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
            return value.slice(1, -1);
        }
    }
    return value;
}
