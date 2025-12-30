const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOADS = path.join(__dirname, "downloads");

if (!fs.existsSync(DOWNLOADS)) fs.mkdirSync(DOWNLOADS);

app.use(express.json());

/* 🔒 SECURITY */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  next();
});

/* 🌐 MULTI SOURCE */
const SOURCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.in.projectsegfau.lt",
  "https://vid.puffyan.us/api/v1"
];

let lastGood = 0;

async function fetchFromSources(endpoint) {
  for (let i = 0; i < SOURCES.length; i++) {
    const idx = (lastGood + i) % SOURCES.length;
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);

      const r = await fetch(SOURCES[idx] + endpoint, {
        signal: controller.signal,
        headers: { "User-Agent": "SlayerMusic/1.0" }
      });

      if (r.ok) {
        lastGood = idx;
        return await r.json();
      }
    } catch {}
  }
  throw new Error("All APIs failed");
}

/* 🔥 TRENDING */
app.get("/trending", async (_, res) => {
  try {
    const d = await fetchFromSources("/trending?region=IN");
    res.json(d.filter(v => v.type === "video"));
  } catch { res.json([]); }
});

/* 🔍 SEARCH */
app.get("/search", async (req, res) => {
  try {
    const d = await fetchFromSources(`/search?q=${encodeURIComponent(req.query.q)}`);
    res.json(d.items.filter(v => v.type === "video"));
  } catch { res.json([]); }
});

/* 🎧 STREAM */
app.get("/stream/:id", async (req, res) => {
  try {
    const d = await fetchFromSources(`/streams/${req.params.id}`);
    const a = d.audioStreams.sort((x,y)=>y.bitrate-x.bitrate)[0];
    res.json({ url: a.url, title: d.title, artist: d.uploader });
  } catch { res.status(500).end(); }
});

/* 🎤 LYRICS */
app.get("/lyrics", async (req, res) => {
  try {
    const r = await fetch(`https://api.lyrics.ovh/v1/${req.query.artist}/${req.query.title}`);
    const d = await r.json();
    res.json({ lyrics: d.lyrics || "Lyrics not found." });
  } catch { res.json({ lyrics: "Lyrics not found." }); }
});

/* ⬇ MP3 (ONLY IF yt-dlp EXISTS) */
app.get("/convert/:id", (req, res) => {
  const out = path.join(DOWNLOADS, `${req.params.id}.mp3`);
  if (fs.existsSync(out)) return res.json({ done: true });

  exec(`yt-dlp -x --audio-format mp3 -o "${out}" https://youtube.com/watch?v=${req.params.id}`, () => {
    res.json({ done: true });
  });
});

app.listen(PORT, () => console.log("🔥 Slayer backend ONLINE"));
