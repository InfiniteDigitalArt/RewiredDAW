const fs = require("fs");
const path = require("path");

function scanDirectory(dirPath, basePath = "") {
  const items = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const relativePath = path.join(basePath, entry.name);
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      items.push({
        type: "folder",
        name: entry.name,
        path: relativePath,
        children: scanDirectory(fullPath, relativePath)
      });
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === ".wav" || ext === ".mid") {
        items.push({
          type: ext === ".wav" ? "audio" : "midi",
          name: entry.name,
          path: relativePath.replace(/\\/g, "/")
        });
      }
    }
  }
  
  return items;
}

const packsDir = path.join(__dirname, "packs");
const packs = scanDirectory(packsDir);

const output = `// Auto-generated packs structure
window.PACKS = ${JSON.stringify(packs, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, "packs.js"), output, "utf8");
console.log("packs.js generated successfully!");
