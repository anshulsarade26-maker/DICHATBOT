// server/index.js - FAST STREAMING VERSION
import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { cosineSearch } from './vectorStore.js';
import { spawn } from "child_process";
dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

const PORT = process.env.PORT || 4000;
const OLLAMA_BIN = process.env.OLLAMA_BIN || "ollama";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "di-assistant-faq";
const DEFAULT_TIMEOUT_MS = Number(process.env.DEFAULT_TIMEOUT_MS || 500000);

/**
 * callOllama - spawn ollama run <model> "<prompt>" and return the final stdout text
 * Resolves with trimmed stdout on success, rejects with Error on failure.
 */
function callOllama(prompt, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const bin = OLLAMA_BIN;
    const model = OLLAMA_MODEL;
    console.log(`[ollama] invoking binary="${bin}" model="${model}" timeoutMs=${timeoutMs}`);

    // Build args - pass prompt as an argument to mirror terminal invocation.
    // Note: spawn will pass each arg literally (no shell quoting needed).
    const args = ["run", model, prompt];

    let stdout = "";
    let stderr = "";
    let finished = false;

    let proc;
    try {
      proc = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch (err) {
      return reject(err);
    }

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      try { proc.kill("SIGKILL"); } catch (e) {}
      const err = new Error(`ollama run timed out after ${timeoutMs}ms`);
      err.stdout = stdout;
      err.stderr = stderr;
      console.error("[ollama] timeout - stdout/stderr follow:");
      console.error(stdout);
      console.error(stderr);
      reject(err);
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => {
      const s = String(chunk);
      stdout += s;
      // also log progressive output (helpful for debugging)
      process.stdout.write(`[ollama stdout chunk] ${s}`);
    });

    proc.stderr.on("data", (chunk) => {
      const s = String(chunk);
      stderr += s;
      process.stderr.write(`[ollama stderr chunk] ${s}`);
    });

    proc.on("error", (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      err.stdout = stdout;
      err.stderr = stderr;
      console.error("[ollama] process error:", err);
      reject(err);
    });

    proc.on("close", (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      console.log(`[ollama] closed code=${code} signal=${signal}`);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        const err = new Error(`ollama exited with code ${code} signal ${signal}`);
        err.stdout = stdout;
        err.stderr = stderr;
        console.error("[ollama] non-zero exit - stdout/stderr follow:");
        console.error(stdout);
        console.error(stderr);
        reject(err);
      }
    });

    // In the arg-passing mode we already provided the prompt as an arg.
    // Still keep stdin closed (no extra write).
    try {
      proc.stdin.end();
    } catch (e) {
      // ignore
    }
  });
}

// health
app.get("/", (req, res) => {
  res.send(`GURU backend running. Model=${OLLAMA_MODEL}`);
});

// POST /api/query
// expects JSON: { text: "..." }  (your frontend sends { text })
// returns JSON: { text: "..." }
app.post("/api/query", async (req, res) => {
  try {
    const text = (req.body && (req.body.text || req.body.question)) ? String(req.body.text || req.body.question) : "";
    const prompt = text.trim();
    if (!prompt) {
      return res.status(400).json({ error: "text is required in JSON body" });
    }

    console.log("[chat] user:", prompt);

    try {
      const answer = await callOllama(prompt + "\n");
      console.log("[chat] reply (first 200 chars):", (answer || "").slice(0, 200));
      return res.json({ text: answer });
    } catch (err) {
      console.error("[chat] model error:", err && (err.message || err));
      // DO NOT leak full stderr/stdout to clients in production, but log them server-side.
      return res.status(500).json({ text: "Error: could not get reply from model." });
    }
  } catch (err) {
    console.error("[chat] unexpected error:", err);
    return res.status(500).json({ text: "Internal server error." });
  }
});

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
  console.log("OLLAMA_BIN =", OLLAMA_BIN, "OLLAMA_MODEL =", OLLAMA_MODEL);
});