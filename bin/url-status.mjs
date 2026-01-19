#!/usr/bin/env node
import fs from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { Command } from "commander";

// top-user-agents exports an array of UA strings.
const { default: userAgents } = await import("top-user-agents");

function pickLatestChromeUA(userAgents) {
  // Pick the UA with the highest Chrome/<major> version.
  let best = null;
  let bestMajor = -1;

  for (const ua of userAgents) {
    const m = ua.match(/Chrome\/(\d+)\./);
    if (!m) continue;
    const major = Number(m[1]);
    if (Number.isFinite(major) && major > bestMajor) {
      bestMajor = major;
      best = ua;
    }
  }

  // Fallback: a reasonable Chrome-like UA if parsing fails.
  return (
    best ??
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[\",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function fetchWithRedirectInfo(originalUrl, { userAgent, timeoutMs, maxRedirects }) {
  let currentUrl = originalUrl;
  let redirects = 0;
  let firstStatus = null;

  for (;;) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    let res;
    try {
      // HEAD first is lighter, but some sites hate it. If HEAD fails, try GET.
      res = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "manual",
        headers: { "User-Agent": userAgent },
        signal: controller.signal,
      }).catch(async () => {
        return await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          headers: { "User-Agent": userAgent },
          signal: controller.signal,
        });
      });
    } finally {
      clearTimeout(t);
    }

    if (firstStatus === null) firstStatus = res.status;

    // Only track redirect chain if the FIRST response is 3xx.
    // If original is not 3xx, stop immediately and only output first 2 cols.
    const isFirst3xx = firstStatus >= 300 && firstStatus < 400;
    if (!isFirst3xx) {
      return {
        originalUrl,
        status: firstStatus,
        redirects: "",
        finalUrl: "",
      };
    }

    // If we're in redirect mode, follow as long as the response is 3xx with Location.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        // Weird redirect without Location. Stop here.
        return {
          originalUrl,
          status: firstStatus,
          redirects,
          finalUrl: currentUrl,
        };
      }

      redirects += 1;
      if (redirects > maxRedirects) {
        return {
          originalUrl,
          status: firstStatus,
          redirects,
          finalUrl: currentUrl,
        };
      }

      currentUrl = new URL(loc, currentUrl).toString();
      continue;
    }

    // Final non-3xx after starting with 3xx
    return {
      originalUrl,
      status: firstStatus,
      redirects,
      finalUrl: currentUrl,
    };
  }
}

const program = new Command();

program
  .name("url-status")
  .description("Check HTTP status for URLs in a txt file and output CSV")
  .requiredOption("-i, --input <file>", "Input .txt file (one URL per line)")
  .option("-o, --output <file>", "Output CSV file", "out.csv")
  .option("--throttle <seconds>", "Seconds to wait between URLs", "0")
  .option("--user-agent <ua>", "Override User-Agent (defaults to latest Chrome UA)")
  .option("--timeout <ms>", "Per-request timeout in ms", "15000")
  .option("--max-redirects <n>", "Max redirects to follow when original is 3xx", "15");

program.parse(process.argv);
const opts = program.opts();

const throttleSeconds = Number(opts.throttle);
const timeoutMs = Number(opts.timeout);
const maxRedirects = Number(opts.maxRedirects);

if (!Number.isFinite(throttleSeconds) || throttleSeconds < 0) {
  console.error("Invalid --throttle value");
  process.exit(1);
}
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error("Invalid --timeout value");
  process.exit(1);
}
if (!Number.isFinite(maxRedirects) || maxRedirects < 0) {
  console.error("Invalid --max-redirects value");
  process.exit(1);
}

const defaultUA = pickLatestChromeUA(userAgents);
const userAgent = opts.userAgent || defaultUA;

const raw = fs.readFileSync(opts.input, "utf8");
const urls = raw
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l.length > 0)
  .filter((l) => !l.startsWith("#"));

const out = fs.createWriteStream(opts.output, { encoding: "utf8" });
out.write("Original URL,HTTP Status,Number of Redirects (For 3XX),Final URL (for 3XXs)\n");

for (let idx = 0; idx < urls.length; idx++) {
  const originalUrl = urls[idx];

  // If scheme missing, assume https.
  const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(originalUrl)
    ? originalUrl
    : `https://${originalUrl}`;

  let row;
  try {
    row = await fetchWithRedirectInfo(normalized, {
      userAgent,
      timeoutMs,
      maxRedirects,
    });
  } catch {
    // Network errors: write status as ERR
    row = { originalUrl: normalized, status: "ERR", redirects: "", finalUrl: "" };
  }

  out.write(
    [
      csvEscape(row.originalUrl),
      csvEscape(row.status),
      csvEscape(row.redirects),
      csvEscape(row.finalUrl),
    ].join(",") + "\n"
  );

  if (throttleSeconds > 0 && idx < urls.length - 1) {
    await sleep(throttleSeconds * 1000);
  }
}

out.end();
