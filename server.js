const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

/* ===============================
   BASIC SETUP
   =============================== */

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

/* ===============================
   ROOT
   =============================== */

app.get("/", (req, res) => {
  res.send("Slayer Music backend is running 🔥");
});

/* ===============================
   ALL SOURCES (ROTATED)
   =============================== */

/* PIPED */
const PIPED = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.in.projectsegfau.lt",
  "https://pipedapi.syncpundit.io",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.nosebs.ru"
];

/* INVIDIOUS */
const INVIDIOUS = [
  "https://vid.puffyan.us/api/v1",
  "https://yewtu.be/api/v1",
  "https://inv.nadeko.net/api/v1",
  "https://invidious.fdn.fr/api/v1",
  "https://iv.ggtyler.dev/api/v1"
];

/* ===============================
   SAFE FETCH
   =============================== */

async function safeFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ===============================
   TRENDING
   =============================== */

app.get("/trending", async (_, res) => {
  const urls = [
    ...PIPED.map(p => `${p}/trending?region=IN`),
    ...INVIDIOUS.map(i => `${i}/trending?region=IN`)
  ];

  for (const url of urls) {
    const data = await safeFetch(url);
    if (Array.isArray(data) && data.length > 0) {
      return res.json(data.filter(v => v.type === "video" || v.videoId));
    }
  }

  /* HARD FALLBACK */
  res.json([
    {
      id: "dQw4w9WgXcQ",
      title: "Trending temporarily unavailable",
      uploader: "Slayer Music"
    }
  ]);
});

/* ===============================
   SEARCH
   =============================== */

app.get("/search", async (req, res) => {
  const q = encodeURIComponent(req.query.q || "");
  if (!q) return res.json([]);

  const urls = [
    ...PIPED.map(p => `${p}/search?q=${q}`),
    ...INVIDIOUS.map(i => `${i}/search?q=${q}`)
  ];

  for (const url of urls) {
    const data = await safeFetch(url);
    if (data?.items?.length) {
      return res.json(data.items.filter(v => v.type === "video"));
    }
    if (Array.isArray(data) && data.length) {
      return res.json(data.filter(v => v.type === "video" || v.videoId));
    }
  }

  res.json([]);
});

/* ===============================
   STREAM
   =============================== */

app.get("/stream/:id", async (req, res) => {
  const id = req.params.id;

  const urls = [
    ...PIPED.map(p => `${p}/streams/${id}`),
    ...INVIDIOUS.map(i => `${i}/videos/${id}`)
  ];

  for (const url of urls) {
    const data = await safeFetch(url);
    if (data?.audioStreams?.length) {
      const best = data.audioStreams.sort(
        (a, b) => b.bitrate - a.bitrate
      )[0];
      if (best?.url) {
        return res.json({
          url: best.url,
          title: data.title || "Unknown",
          artist: data.uploader || "Unknown"
        });
      }
    }
  }

  res.status(500).json({ error: "Stream unavailable" });
});

/* ===============================
   LYRICS
   =============================== */

app.get("/lyrics", async (req, res) => {
  try {
    const r = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(req.query.artist || "")}/${encodeURIComponent(req.query.title || "")}`
    );
    const d = await r.json();
    res.json({ lyrics: d.lyrics || "Lyrics not found." });
  } catch {
    res.json({ lyrics: "Lyrics not found." });
  }
});

/* ===============================
   DOWNLOADS (LOCAL ONLY)
   =============================== */

const DOWNLOADS = path.join(__dirname, "downloads");
if (!fs.existsSync(DOWNLOADS)) fs.mkdirSync(DOWNLOADS);

app.get("/convert/:id", (req, res) => {
  const id = req.params.id;
  const out = path.join(DOWNLOADS, `${id}.mp3`);

  if (fs.existsSync(out)) return res.json({ done: true });

  exec(
    `yt-dlp -x --audio-format mp3 -o "${out}" https://youtube.com/watch?v=${id}`,
    () => res.json({ done: true })
  );
});

app.get("/downloads", (_, res) => {
  fs.readdir(DOWNLOADS, (_, files) => res.json(files || []));
});

/* ===============================
   START
   =============================== */

app.listen(PORT, () => {
  console.log("🔥 Slayer Music backend running on port", PORT);
});

