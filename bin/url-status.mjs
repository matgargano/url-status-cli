#!/usr/bin/env node
import fs from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { Command } from "commander";

// top-user-agents exports an array of UA strings.
const { default: userAgents } = await import("top-user-agents");

// ─────────────────────────────────────────────────────────────────────────────
// ASCII Art Splash Screen
// ─────────────────────────────────────────────────────────────────────────────

const ASCII_ART = `
██╗   ██╗██████╗ ██╗         ███████╗████████╗ █████╗ ████████╗██╗   ██╗███████╗
██║   ██║██╔══██╗██║         ██╔════╝╚══██╔══╝██╔══██╗╚══██╔══╝██║   ██║██╔════╝
██║   ██║██████╔╝██║         ███████╗   ██║   ███████║   ██║   ██║   ██║███████╗
██║   ██║██╔══██╗██║         ╚════██║   ██║   ██╔══██║   ██║   ██║   ██║╚════██║
╚██████╔╝██║  ██║███████╗    ███████║   ██║   ██║  ██║   ██║   ╚██████╔╝███████║
 ╚═════╝ ╚═╝  ╚═╝╚══════╝    ╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚══════╝
`;

function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[H");
}

function showSplash() {
  clearScreen();
  console.log("\x1b[36m" + ASCII_ART + "\x1b[0m"); // Cyan color
  console.log("\x1b[90m" + "                           a statenweb joint" + "\x1b[0m");
  console.log("\n" + "─".repeat(80) + "\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Output Helpers
// ─────────────────────────────────────────────────────────────────────────────

function logFetching(idx, total, url) {
  const progress = `[${String(idx + 1).padStart(String(total).length)}/${total}]`;
  const truncatedUrl = url.length > 60 ? url.substring(0, 57) + "..." : url;
  process.stdout.write(`\x1b[33m${progress}\x1b[0m Checking: ${truncatedUrl}`);
}

function logResult(status, isError = false, finalStatus = null) {
  if (isError) {
    console.log(` → \x1b[31mERROR\x1b[0m`);
  } else if (status >= 200 && status < 300) {
    console.log(` → \x1b[32m${status} OK\x1b[0m`);
  } else if (status >= 300 && status < 400) {
    let finalStatusText = "";
    if (finalStatus) {
      if (finalStatus >= 200 && finalStatus < 300) {
        finalStatusText = ` → Final: \x1b[32m${finalStatus} OK\x1b[0m`;
      } else if (finalStatus >= 300 && finalStatus < 400) {
        finalStatusText = ` → Final: \x1b[34m${finalStatus} REDIRECT\x1b[0m`;
      } else if (finalStatus >= 400 && finalStatus < 500) {
        finalStatusText = ` → Final: \x1b[33m${finalStatus} CLIENT ERROR\x1b[0m`;
      } else if (finalStatus >= 500) {
        finalStatusText = ` → Final: \x1b[31m${finalStatus} SERVER ERROR\x1b[0m`;
      } else {
        finalStatusText = ` → Final: ${finalStatus}`;
      }
    }
    console.log(` → \x1b[34m${status} REDIRECT\x1b[0m${finalStatusText}`);
  } else if (status >= 400 && status < 500) {
    console.log(` → \x1b[33m${status} CLIENT ERROR\x1b[0m`);
  } else if (status >= 500) {
    console.log(` → \x1b[31m${status} SERVER ERROR\x1b[0m`);
  } else {
    console.log(` → ${status}`);
  }
}

function logThrottle(seconds) {
  process.stdout.write(`\x1b[90m    ⏳ Waiting ${seconds}s before next request...\x1b[0m\r`);
}

function clearThrottle() {
  process.stdout.write("\x1b[2K"); // Clear the line
}

function showSummary(stats, outputFile) {
  console.log("\n" + "─".repeat(80));
  console.log("\x1b[36m" + "                              SUMMARY" + "\x1b[0m");
  console.log("─".repeat(80) + "\n");

  console.log(`  Total URLs checked:  \x1b[1m${stats.total}\x1b[0m`);
  console.log(`  \x1b[32m✓ Successful (2xx):\x1b[0m  ${stats.success}`);
  console.log(`  \x1b[34m↪ Redirects (3xx):\x1b[0m   ${stats.redirects}`);
  console.log(`  \x1b[33m⚠ Client Errors (4xx):\x1b[0m ${stats.clientErrors}`);
  console.log(`  \x1b[31m✗ Server Errors (5xx):\x1b[0m ${stats.serverErrors}`);
  console.log(`  \x1b[31m✗ Network Errors:\x1b[0m     ${stats.networkErrors}`);

  console.log("\n" + "─".repeat(80));

  if (stats.networkErrors + stats.clientErrors + stats.serverErrors > 0) {
    console.log(`\n  \x1b[31m⚠ ${stats.networkErrors + stats.clientErrors + stats.serverErrors} URLs had errors\x1b[0m`);
  } else {
    console.log(`\n  \x1b[32m✓ All URLs checked successfully\x1b[0m`);
  }

  console.log(`\n  \x1b[1mResults saved to:\x1b[0m ${outputFile}\n`);
}

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
        finalStatus: "",
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
          finalStatus: res.status,
        };
      }

      redirects += 1;
      if (redirects > maxRedirects) {
        return {
          originalUrl,
          status: firstStatus,
          redirects,
          finalUrl: currentUrl,
          finalStatus: res.status,
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
      finalStatus: res.status,
    };
  }
}

const program = new Command();

program
  .name("url-status")
  .description("Check HTTP status for URLs in a txt file and output CSV")
  .argument("<input>", "Input .txt file (one URL per line)")
  .argument("[output]", "Output CSV file (default: out.csv)")
  .option("-o, --output <file>", "Output CSV file (overrides positional argument)")
  .option("--throttle <seconds>", "Seconds to wait between URLs", "0")
  .option("--user-agent <ua>", "Override User-Agent (defaults to latest Chrome UA)")
  .option("--timeout <ms>", "Per-request timeout in ms", "15000")
  .option("--max-redirects <n>", "Max redirects to follow when original is 3xx", "15");

program.parse(process.argv);
const opts = program.opts();
const args = program.args;

// Input is first positional argument
opts.input = args[0];
// Output: -o flag takes priority, then positional, then default
opts.output = opts.output || args[1] || "out.csv";

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

// Check if output file exists, add timestamp if so
let outputFile = opts.output;
let outputFileChanged = false;
if (fs.existsSync(outputFile)) {
  const timestamp = Math.floor(Date.now() / 1000);
  const ext = outputFile.lastIndexOf(".") > 0 ? outputFile.slice(outputFile.lastIndexOf(".")) : "";
  const base = ext ? outputFile.slice(0, outputFile.lastIndexOf(".")) : outputFile;
  outputFile = `${base}.${timestamp}${ext}`;
  outputFileChanged = true;
}

// Show splash screen
showSplash();
console.log(`  Input file:  ${opts.input}`);
console.log(`  Output file: ${outputFile}`);
if (outputFileChanged) {
  console.log(`  \x1b[33m(original "${opts.output}" exists, added timestamp)\x1b[0m`);
}
console.log(`  URLs to check: ${urls.length}`);
if (throttleSeconds > 0) {
  console.log(`  Throttle: ${throttleSeconds}s between requests`);
}
console.log("\n" + "─".repeat(80) + "\n");

// Stats tracking
const stats = {
  total: urls.length,
  success: 0,
  redirects: 0,
  clientErrors: 0,
  serverErrors: 0,
  networkErrors: 0,
};

const out = fs.createWriteStream(outputFile, { encoding: "utf8" });
out.write("Original URL,HTTP Status,Number of Redirects (For 3XX),Final URL (for 3XXs),Final HTTP Status\n");

for (let idx = 0; idx < urls.length; idx++) {
  const originalUrl = urls[idx];

  // If scheme missing, assume https.
  const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(originalUrl)
    ? originalUrl
    : `https://${originalUrl}`;

  logFetching(idx, urls.length, normalized);

  let row;
  let isError = false;
  try {
    row = await fetchWithRedirectInfo(normalized, {
      userAgent,
      timeoutMs,
      maxRedirects,
    });
  } catch {
    // Network errors: write status as ERR
    row = { originalUrl: normalized, status: "ERR", redirects: "", finalUrl: "", finalStatus: "" };
    isError = true;
  }

  // Log result and update stats
  if (isError || row.status === "ERR") {
    logResult(row.status, true);
    stats.networkErrors++;
  } else {
    logResult(row.status, false, row.finalStatus || null);
    if (row.status >= 200 && row.status < 300) {
      stats.success++;
    } else if (row.status >= 300 && row.status < 400) {
      stats.redirects++;
    } else if (row.status >= 400 && row.status < 500) {
      stats.clientErrors++;
    } else if (row.status >= 500) {
      stats.serverErrors++;
    }
  }

  out.write(
    [
      csvEscape(row.originalUrl),
      csvEscape(row.status),
      csvEscape(row.redirects),
      csvEscape(row.finalUrl),
      csvEscape(row.finalStatus),
    ].join(",") + "\n"
  );

  if (throttleSeconds > 0 && idx < urls.length - 1) {
    logThrottle(throttleSeconds);
    await sleep(throttleSeconds * 1000);
    clearThrottle();
  }
}

out.end();

// Show summary
showSummary(stats, outputFile);
