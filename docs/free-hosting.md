# Host the StackOverflow MCP Server for Free

This MCP server uses stdio transport. The most reliable way to run it “remotely” on a free/freemium platform is to execute it over SSH on a small always-free VM, and point your MCP client at `ssh ... npx @gscalzo/stackoverflow-mcp`. This keeps the stdio contract intact while your compute runs elsewhere.

Below are two robust, no-cost options and exact steps.

Why Oracle was previously recommended: Oracle Cloud’s Always Free tier offers always-on VMs with generous limits and no idle shutdowns, which historically made it a stable choice for long-lived background processes. However, Google Cloud’s Free Tier e2-micro is comparable and widely available. The guide now defaults to Google Cloud for familiarity and tooling, while keeping Oracle as an alternative.

## Option A: Google Cloud Free Tier (recommended)

Google Cloud Free Tier includes one non‑preemptible `e2-micro` VM per month in select US regions (us‑west1, us‑central1, us‑east1), plus free outbound data and disk within limits. See: [Compute Engine Free Tier](https://cloud.google.com/free/docs/free-cloud-features#compute) and the full [Free Tier usage limits](https://cloud.google.com/free/docs/free-cloud-features#free-tier-usage-limits).

1) Create the VM (Compute Engine)
- If you don’t have one, create a Google Cloud project and enable billing (required for Free Tier usage): [Create, configure, and manage projects](https://cloud.google.com/resource-manager/docs/creating-managing-projects), [Create a Cloud Billing account](https://cloud.google.com/billing/docs/how-to/manage-billing-account).
- Ensure the correct project is selected:
  - In the Console UI, select your project from the top project picker.
  - Or in Cloud Shell/CLI:
    ```bash
    gcloud projects list
    gcloud config set project YOUR_PROJECT_ID
    ```
- Open the VM creation page: [Create a VM instance](https://console.cloud.google.com/compute/instancesAdd) and choose:
  - Region: `us-central1`, `us-west1`, or `us-east1` (Free Tier regions)
  - Machine type: `e2-micro`
  - Image: Ubuntu LTS (e.g., Ubuntu 22.04 LTS)
  - Firewall: allow SSH
  - Boot disk: standard persistent disk (default; Free Tier includes 30 GB‑months)
- Click Create. After a minute, note the External IP.

Alternative (one‑liner via Cloud Shell):
1. Open [Cloud Shell](https://shell.cloud.google.com/?show=terminal&cloudshell=true)
2. Select your project (replace `YOUR_PROJECT_ID`) and pick a Free Tier zone like `us-central1-a`:
```bash
gcloud projects list
gcloud config set project YOUR_PROJECT_ID
gcloud config set compute/zone us-central1-a
gcloud compute instances create mcp-stackoverflow \
  --machine-type=e2-micro \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --tags=ssh
```

2) SSH to the VM and prepare it
- From Cloud Shell (works out of the box):
```bash
gcloud compute ssh mcp-stackoverflow
```
- Or from your local machine after adding your SSH key in the Console: `ssh USER@EXTERNAL_IP`

On the VM, install Node.js LTS and git:
```bash
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs git
node -v && npm -v
```

Optional: set env vars for write tools (keep secrets on the VM):
```bash
echo 'export STACKOVERFLOW_API_KEY="YOUR_KEY"' | tee -a ~/.bashrc
echo 'export STACKOVERFLOW_ACCESS_TOKEN="YOUR_TOKEN"' | tee -a ~/.bashrc
source ~/.bashrc
```

Optional: pre‑warm the npx package cache:
```bash
# If published on npm (may 404 if unpublished)
npx -y @gscalzo/stackoverflow-mcp --help || true

# Reliable fallback: install from GitHub and run its bin
npx -y --package=github:gscalzo/stackoverflow-mcp stackoverflow-mcp --help || true
```

3) Configure your MCP client to use SSH
Add to your MCP settings (paths vary by client):
```json
{
  "mcpServers": {
    "stackoverflow": {
      "command": "ssh",
      "args": [
        "-T",
        "USER@EXTERNAL_IP",
        "npx", "-y", "--package=github:gscalzo/stackoverflow-mcp", "stackoverflow-mcp"
      ],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```
Notes:
- `-T` disables pseudo‑tty so stdio streams map cleanly.
- Env vars come from the remote shell (`~/.bashrc`). If you prefer to pass them inline (less secure):
  - args: `["-T", "USER@EXTERNAL_IP", "env", "STACKOVERFLOW_API_KEY=...", "STACKOVERFLOW_ACCESS_TOKEN=...", "npx", "-y", "--package=github:gscalzo/stackoverflow-mcp", "stackoverflow-mcp"]`

4) Cost controls and Free Tier details
- The Free Tier is per billing account and doesn’t roll over. Exceeding limits incurs standard charges. See [Budgets and alerts](https://cloud.google.com/billing/docs/how-to/budgets) to avoid surprises.
- The Free Tier has no end date, but limits and terms can change with notice. See [Free Tier overview](https://cloud.google.com/free/docs/free-cloud-features).

## Option B: Oracle Cloud Always Free VM (alternative)

Oracle Cloud (OCI) offers Always Free Ampere A1 or VM.Standard.E2 instances that work well for a tiny Node.js CLI. Steps mirror GCP: create a VM, SSH in, install Node.js, set env vars, and point your MCP client to `ssh -T user@ip npx -y @gscalzo/stackoverflow-mcp`.

High‑level steps:
1) Create an Always Free VM (Ubuntu/Debian), add your SSH public key
2) SSH and install Node.js LTS and git
3) Optionally set `STACKOVERFLOW_API_KEY` and `STACKOVERFLOW_ACCESS_TOKEN`
4) Configure the MCP client SSH command as shown above

Docs: [Oracle Always Free](https://www.oracle.com/cloud/free/), [Compute instances](https://docs.oracle.com/en-us/iaas/Content/Compute/Concepts/computeoverview.htm)

## Why not serverless (Cloudflare Workers / Vercel / Netlify / Deno Deploy)?

This server speaks stdio (Model Context Protocol over stdio). Typical serverless platforms expose HTTP and don’t provide stable stdio pipes to the calling process. Unless you refactor the server to use a socket/WebSocket transport supported by your MCP client, stdio requires a direct process launch. SSH provides exactly that, across networks, without refactoring.

## Write tools and authentication

- Read‑only tools work without auth (subject to rate limits). For higher limits, set `STACKOVERFLOW_API_KEY`.
- Write tools (`post_question`, `post_solution`, `thumbs_up`, `comment_solution`) require both:
  - `STACKOVERFLOW_API_KEY`
  - `STACKOVERFLOW_ACCESS_TOKEN` (OAuth, with required scopes for write access)
- Obtain both via Stack Apps (Stack Exchange) and keep tokens secret on the VM.

### How to obtain a Stack Overflow API key and access token

1) Create an application on Stack Apps to get your API key ("key")
- Go to the Stack Apps portal: [Create an application](https://stackapps.com/apps/oauth/register)
- Fill in minimal fields (name, description, and an OAuth domain you control if you plan to do OAuth).
- After creation, note the displayed App Key — use this as `STACKOVERFLOW_API_KEY`.

2) Get an OAuth access token for write tools
- Overview docs: [Authentication (Stack Exchange API)](https://api.stackexchange.com/docs/authentication)
- Choose a flow:
  - Implicit flow (quick testing): returns a short‑lived token to your browser via `redirect_uri`.
  - Explicit flow (recommended): exchanges a code server‑side for a token. Use when you can host a small callback endpoint locally.
- Scopes: request appropriate scopes for write access as required by your use case (see the docs above).
- Practical options:
  - Use a local redirect URI (e.g., `http://127.0.0.1:PORT/callback`) while running a tiny local HTTP listener to receive the token, then copy it into your MCP settings (passed via env over SSH).
  - For quick experiments, consult the docs’ examples/tools to complete the flow and copy the resulting `access_token`.

3) Pass credentials per‑client, at launch (no secrets stored on the VM)
```bash
ssh -T USER@EXTERNAL_IP \
  env STACKOVERFLOW_API_KEY=YOUR_KEY STACKOVERFLOW_ACCESS_TOKEN=YOUR_TOKEN \
  npx -y @gscalzo/stackoverflow-mcp
```

## Operating tips

- Keep your VM updated (`sudo apt update && sudo apt upgrade -y`).
- Use an unprivileged user for running the MCP.
- Limit SSH to specific IPs where possible; consider enabling OS Login on GCP: [OS Login](https://cloud.google.com/compute/docs/oslogin).
- If you rotate tokens, update `~/.bashrc` and reconnect your MCP client.

## Troubleshooting

- If the MCP client hangs: verify your SSH command works and returns a process that writes to stdio. Test locally: `ssh -T USER@EXTERNAL_IP npx -y @gscalzo/stackoverflow-mcp`.
- If write tools fail: ensure both env vars are set on the remote session (`env | grep STACKOVERFLOW_`). Some clouds use non‑login shells for SSH; add exports to `~/.profile` as well as `~/.bashrc`.
- Rate limit 429s: the server retries with backoff automatically; heavy write usage can still hit API limits.
