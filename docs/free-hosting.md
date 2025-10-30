# Host the StackOverflow MCP Server for Free

This MCP server uses stdio transport. The most reliable way to run it “remotely” on a free/freemium platform is to execute it over SSH on a small always-free VM, and point your MCP client at `ssh ... npx @gscalzo/stackoverflow-mcp`. This keeps the stdio contract intact while your compute runs elsewhere.

Below are two robust, no-cost options and exact steps.

## Option A: Oracle Cloud Always Free VM (recommended)

Oracle Cloud (OCI) offers Always Free Ampere A1 or VM.Standard.E2 instances that work well for a tiny Node.js CLI.

1) Create the VM
- Create an Always Free VM (Ubuntu/Debian recommended).
- Add your SSH public key during creation.

2) Prepare the VM
```bash
# On your local machine
ssh ubuntu@YOUR_VM_IP

# On the VM — install Node.js LTS and basics
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs git
node -v && npm -v

# Add environment variables for write tools (optional but recommended)
echo 'export STACKOVERFLOW_API_KEY="YOUR_KEY"' | tee -a ~/.bashrc
echo 'export STACKOVERFLOW_ACCESS_TOKEN="YOUR_TOKEN"' | tee -a ~/.bashrc
source ~/.bashrc
```

3) (Optional) Pre-warm the npx package cache
```bash
npx -y @gscalzo/stackoverflow-mcp --help || true
```

4) Harden SSH minimally
- Ensure your security list/firewall allows SSH (port 22) only from your IP if possible.

5) Configure your MCP client to use SSH
Add to your MCP settings (paths vary by client):
```json
{
  "mcpServers": {
    "stackoverflow": {
      "command": "ssh",
      "args": [
        "-T",
        "ubuntu@YOUR_VM_IP",
        "npx", "-y", "@gscalzo/stackoverflow-mcp"
      ],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```
Notes:
- `-T` disables pseudo-tty so stdio streams map cleanly.
- Env vars come from the remote shell (`~/.bashrc`). If you prefer to pass them inline instead (less secure), you can do:
  - args: ["-T", "ubuntu@YOUR_VM_IP", "env", "STACKOVERFLOW_API_KEY=...", "STACKOVERFLOW_ACCESS_TOKEN=...", "npx", "-y", "@gscalzo/stackoverflow-mcp"]

## Option B: Google Cloud Always Free e2-micro

Google Cloud offers an always-free e2-micro in select regions.

Steps are the same as Option A:
- Create a Debian/Ubuntu VM
- SSH, install Node.js LTS
- Set `STACKOVERFLOW_API_KEY` and `STACKOVERFLOW_ACCESS_TOKEN`
- Use the same MCP SSH configuration

## Why not serverless (Cloudflare Workers / Vercel / Netlify / Deno Deploy)?

This server speaks stdio (Model Context Protocol over stdio). Typical serverless platforms expose HTTP and don’t provide stable stdio pipes to the calling process. Unless you refactor the server to use a socket/WebSocket transport supported by your MCP client, stdio requires a direct process launch. SSH provides exactly that, across networks, without refactoring.

## Minimal cost, mostly-free alternatives

- Fly.io: You can run a small VM and SSH via `fly ssh console`, but it uses WireGuard and isn’t a plain `ssh user@host`. It’s workable but more setup than OCI/GCP.
- GitHub Codespaces: Free monthly hours; supports SSH, but environments stop when idle. Good for sporadic usage.
- Oracle/GCP are truly always-on (within free quotas), ideal for long-lived availability.

## Write tools and authentication

- Read-only tools work without auth (subject to rate limits). For higher limits, set `STACKOVERFLOW_API_KEY`.
- Write tools (`post_question`, `post_solution`, `thumbs_up`, `comment_solution`) require both:
  - `STACKOVERFLOW_API_KEY`
  - `STACKOVERFLOW_ACCESS_TOKEN` (OAuth, with required scopes for write access)
- Obtain both via Stack Apps (Stack Exchange) and keep tokens secret on the VM.

## Operating tips

- Keep your VM updated (`sudo apt update && sudo apt upgrade -y`).
- Use an unprivileged user (e.g., `ubuntu`) for running the MCP.
- Consider limiting SSH to specific IPs or enable fail2ban if you expose 22 publicly.
- If you rotate tokens, update `~/.bashrc` and reconnect your MCP client.

## Troubleshooting

- If the MCP client hangs: verify your SSH command works and returns a process that writes to stdio. Test locally: `ssh -T ubuntu@YOUR_VM_IP npx -y @gscalzo/stackoverflow-mcp`.
- If write tools fail: ensure both env vars are set on the remote session (`env | grep STACKOVERFLOW_`). Some clouds use non-login shells for SSH; add exports to `~/.profile` as well as `~/.bashrc`.
- Rate limit 429s: the server retries with backoff automatically; heavy write usage can still hit API limits.
