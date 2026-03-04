const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PORT = process.env.PORT || 3000;
const CARDS_DIR = path.join(__dirname, "cards");

// Ensure cards directory exists
if (!fs.existsSync(CARDS_DIR)) {
  fs.mkdirSync(CARDS_DIR);
}

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // API: Save cards
  if (req.method === "POST" && req.url === "/api/save") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { cards } = JSON.parse(body);

        // Clear old card files
        const existing = fs
          .readdirSync(CARDS_DIR)
          .filter((f) => f.endsWith(".js"));
        existing.forEach((f) => fs.unlinkSync(path.join(CARDS_DIR, f)));

        // Write new card files
        const savedFiles = [];
        cards.forEach((card) => {
          const fileName = card.fileName;
          const filePath = path.join(CARDS_DIR, fileName);
          fs.writeFileSync(filePath, card.code, "utf8");
          savedFiles.push(fileName);
        });

        // Save card state data for persistence
        const statePath = path.join(CARDS_DIR, "_state.json");
        const stateData = cards.map((c) => c.state);
        fs.writeFileSync(statePath, JSON.stringify(stateData, null, 2), "utf8");

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, files: savedFiles }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // API: Load saved cards state
  if (req.method === "GET" && req.url === "/api/cards") {
    const statePath = path.join(CARDS_DIR, "_state.json");
    if (fs.existsSync(statePath)) {
      const data = fs.readFileSync(statePath, "utf8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(data);
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("[]");
    }
    return;
  }

  // API: List saved card files
  if (req.method === "GET" && req.url === "/api/files") {
    const files = fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".js"));
    const fileList = files.map((f) => ({
      name: f,
      size: fs.statSync(path.join(CARDS_DIR, f)).size,
      url: "/api/files/" + f,
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ files: fileList }, null, 2));
    return;
  }

  // API: View a specific card file
  if (req.method === "GET" && req.url.startsWith("/api/files/")) {
    const fileName = req.url.replace("/api/files/", "");
    const filePath = path.join(CARDS_DIR, fileName);
    if (fs.existsSync(filePath) && fileName.endsWith(".js")) {
      const code = fs.readFileSync(filePath, "utf8");
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(code);
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "File not found" }));
    }
    return;
  }

  // API: Download all card files as ZIP
  if (req.method === "GET" && req.url === "/api/download-all") {
    const allFiles = fs
      .readdirSync(CARDS_DIR)
      .filter((f) => f.endsWith(".js") || f === "_state.json");
    if (allFiles.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No saved cards found" }));
      return;
    }
    const entries = allFiles.map((f) => ({
      name: "cards/" + f,
      data: fs.readFileSync(path.join(CARDS_DIR, f)),
    }));
    const zipBuffer = buildZip(entries);
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="telegram_cards.zip"',
      "Content-Length": zipBuffer.length,
    });
    res.end(zipBuffer);
    return;
  }

  // Static file serving
  let filePath = req.url === "/" ? "/index.html" : req.url;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

// Simple ZIP builder (store method, no external deps)
function buildZip(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data);

    // CRC32
    const crc = crc32(data);

    // Local file header (30 bytes + name + data)
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // compression (store)
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc, 14); // crc32
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuffer.length, 26); // name length
    local.writeUInt16LE(0, 28); // extra length

    localHeaders.push(Buffer.concat([local, nameBuffer, data]));

    // Central directory header (46 bytes + name)
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // compression
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0, 14); // mod date
    central.writeUInt32LE(crc, 16); // crc32
    central.writeUInt32LE(data.length, 20); // compressed
    central.writeUInt32LE(data.length, 24); // uncompressed
    central.writeUInt16LE(nameBuffer.length, 28); // name length
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk start
    central.writeUInt16LE(0, 36); // internal attr
    central.writeUInt32LE(0, 38); // external attr
    central.writeUInt32LE(offset, 42); // local header offset

    centralHeaders.push(Buffer.concat([central, nameBuffer]));
    offset += 30 + nameBuffer.length + data.length;
  });

  const localData = Buffer.concat(localHeaders);
  const centralData = Buffer.concat(centralHeaders);

  // End of central directory (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralData.length, 12);
  eocd.writeUInt32LE(localData.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localData, centralData, eocd]);
}

// CRC32 implementation
function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

server.listen(PORT, () => {
  console.log(`\n  ✅ Telegram Builder Server running!`);
  console.log(`  📂 Cards saved to: ${CARDS_DIR}`);
  console.log(`  🌐 Open: http://localhost:${PORT}\n`);
});
