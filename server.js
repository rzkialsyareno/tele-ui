const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
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

server.listen(PORT, () => {
  console.log(`\n  ✅ Telegram Builder Server running!`);
  console.log(`  📂 Cards saved to: ${CARDS_DIR}`);
  console.log(`  🌐 Open: http://localhost:${PORT}\n`);
});
