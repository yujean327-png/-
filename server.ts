import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("hiyori.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    name TEXT,
    transcription TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS explanations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT,
    timestamp TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(video_id) REFERENCES videos(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '600mb' }));
  app.use(express.urlencoded({ limit: '600mb', extended: true }));

  // API Routes
  app.get("/api/videos", (req, res) => {
    const videos = db.prepare("SELECT * FROM videos ORDER BY created_at DESC").all();
    res.json(videos);
  });

  app.post("/api/videos", (req, res) => {
    const { id, name, transcription } = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO videos (id, name, transcription) VALUES (?, ?, ?)");
    stmt.run(id, name, JSON.stringify(transcription));
    res.json({ success: true });
  });

  app.get("/api/explanations/:videoId", (req, res) => {
    const { videoId } = req.params;
    const explanations = db.prepare("SELECT * FROM explanations WHERE video_id = ? ORDER BY created_at ASC").all();
    res.json(explanations.map(e => ({ ...e, content: JSON.parse(e.content) })));
  });

  app.post("/api/explanations", (req, res) => {
    const { video_id, timestamp, content } = req.body;
    const stmt = db.prepare("INSERT INTO explanations (video_id, timestamp, content) VALUES (?, ?, ?)");
    stmt.run(video_id, timestamp, JSON.stringify(content));
    res.json({ success: true });
  });

  app.delete("/api/videos/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM explanations WHERE video_id = ?").run(id);
    db.prepare("DELETE FROM videos WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
