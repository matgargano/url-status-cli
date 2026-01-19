# url-status-cli

A small CLI that reads a `.txt` file of URLs (one per line), checks HTTP status, and writes a CSV.

CSV columns:

- Original URL
- HTTP Status
- Number of Redirects (For 3XX)
- Final URL (for 3XXs)

Behavior:

- If the first response is **not** a 3xx, only the first 2 columns are populated.
- If the first response **is** a 3xx, the CLI follows redirects (up to a cap) and writes redirect count and final URL.

## Requirements

- Node.js 18+ (uses built-in `fetch`)

## Input format

Create a text file (example: `urls.txt`):

```txt
https://example.com
http://example.com
example.org
# comments are ignored
```

Notes:

- Blank lines are ignored.
- Lines starting with `#` are ignored.
- If a URL has no scheme, the CLI assumes `https://`.

## Install and run (macOS)

### Option 1: Install from GitHub (recommended for teams)

From anywhere:

```bash
npm i -g https://github.com/<org>/<repo>.git#v1.0.0
url-status -i urls.txt -o out.csv
```

If your repo is private, use SSH:

```bash
npm i -g git+ssh://git@github.com/<org>/<repo>.git#v1.0.0
url-status -i urls.txt -o out.csv
```

### Option 2: Clone and link (good for contributors)

```bash
git clone https://github.com/<org>/<repo>.git
cd <repo>
npm install
npm link

url-status -i urls.txt -o out.csv
```

## Install and run (Windows)

### Option 1: Install from GitHub (recommended for teams)

PowerShell:

```powershell
npm i -g https://github.com/<org>/<repo>.git#v1.0.0
url-status -i .\urls.txt -o .\out.csv
```

Private repo via SSH:

```powershell
npm i -g git+ssh://git@github.com/<org>/<repo>.git#v1.0.0
url-status -i .\urls.txt -o .\out.csv
```

### Option 2: Clone and link (good for contributors)

```powershell
git clone https://github.com/<org>/<repo>.git
cd <repo>
npm install
npm link

url-status -i .\urls.txt -o .\out.csv
```

## Usage

```bash
url-status -i urls.txt -o statuses.csv
```

Throttle 2.5 seconds between URLs:

```bash
url-status -i urls.txt -o statuses.csv --throttle 2.5
```

Custom user agent:

```bash
url-status -i urls.txt -o statuses.csv --user-agent "Mozilla/5.0 ..."
```

Increase timeout (ms):

```bash
url-status -i urls.txt -o statuses.csv --timeout 30000
```

Change max redirects followed when the first response is 3xx:

```bash
url-status -i urls.txt -o statuses.csv --max-redirects 25
```

See all options:

```bash
url-status --help
```

## Output

Example CSV header:

```csv
Original URL,HTTP Status,Number of Redirects (For 3XX),Final URL (for 3XXs)
```

Examples:

- Non-3xx:
  - `Original URL` and `HTTP Status` populated
  - Redirect columns blank

- 3xx start:
  - `HTTP Status` is the first status code returned
  - `Number of Redirects` is how many Location hops were followed
  - `Final URL` is the last URL reached after the redirect chain ends

If a request fails (DNS, TLS, timeout), `HTTP Status` is `ERR`.

## Team distribution workflow (GitHub)

1) Push to GitHub.

2) Tag releases so installs are pinned:

```bash
git tag v1.0.0
git push --tags
```

3) Teammates install from the tag (examples above).

To upgrade, tag a new version and reinstall using that tag.

## License

Internal use.
