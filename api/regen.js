const fs = require("fs");
const path = require("path");

const HIDDEN_FILES = new Set([".gitkeep", ".keep"]);

module.exports = async function handler(_req, res) {
  try {
    const root = path.join(process.cwd(), "Files");
    const entries = walkFiles(root, root).sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));

    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.status(200).send(`window.__FILE_INDEX__ = ${JSON.stringify(entries, null, 2)};`);
  } catch (error) {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.status(500).send(
      `window.__FILE_INDEX__ = []; console.error(${JSON.stringify(`regen failed: ${String(error && error.message ? error.message : error)}`)});`
    );
  }
};

function walkFiles(absPath, basePath) {
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
    return [];
  }

  const output = [];
  const stack = [absPath];

  while (stack.length > 0) {
    const current = stack.pop();
    const dirEntries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of dirEntries) {
      const fullPath = path.join(current, entry.name);
      const relative = toUnixPath(path.relative(basePath, fullPath));

      if (!relative) {
        continue;
      }

      if (entry.isDirectory()) {
        const stat = fs.statSync(fullPath);
        output.push({
          path: relative,
          type: "directory",
          size: 0,
          modified: stat.mtime.toISOString()
        });
        stack.push(fullPath);
        continue;
      }

      if (HIDDEN_FILES.has(entry.name.toLowerCase())) {
        continue;
      }

      const stat = fs.statSync(fullPath);
      output.push({
        path: relative,
        type: "file",
        size: stat.size,
        modified: stat.mtime.toISOString()
      });
    }
  }

  return output;
}

function toUnixPath(input) {
  return input.replace(/\\/g, "/");
}
