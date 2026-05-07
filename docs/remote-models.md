# Benchmarking remote LLMs

`openbench-local` is named for a reason — by default it probes
`127.0.0.1` and treats anything over the network as out of scope. But
it's common to run the heavy LLM on a workstation, a homelab box, or a
GPU-equipped server and benchmark it from a laptop. This page walks
through the three usable topologies, in order of operational
complexity.

> **The core constraint:** the browser is the thing doing the LLM
> traffic, not the page server. So any solution has to make the
> remote LLM reachable from *your laptop's browser* — directly or via
> a tunnel/proxy that resolves to a URL the browser will accept.
> Browser rules (mixed content, CORS, Private Network Access) apply
> the same way they do for `localhost`. Read
> [browser-permissions.md](browser-permissions.md) first if any of
> those terms are unfamiliar.

---

## 1. LAN / VPN — use Custom hosts directly

If the LLM is on a machine you can already reach by IP or hostname
(office LAN, Tailscale net, WireGuard, OpenVPN, etc.), no tunnel is
needed. Open the **Custom hosts** panel below the Discover section
and add the endpoint:

```
http://192.168.1.42:11434
https://my-workstation.tail-net.ts.net:11434
http://10.0.0.5:1234
```

The browser will probe each one in parallel with `127.0.0.1`. The
discovered models show up in the same grid alongside any local ones.

### Caveats

| Issue | Where it bites | How to fix |
| --- | --- | --- |
| **CORS** | LLM server rejects the cross-origin request from the page's origin | Add the page's origin to the engine's allow-list (`OLLAMA_ORIGINS`, LM Studio "Allow CORS", `--allowed-origins`, `--cors`) |
| **Mixed content** | HTTPS page can't reach `http://192.168...` | Either run the page over `http://localhost:5173` (`pnpm dev`), or front the LLM with HTTPS (mkcert + Caddy/nginx) |
| **Private Network Access (PNA)** | Chrome ≥ 117 requires an extra preflight before HTTPS → private-IP fetches succeed | Engine must respond with `Access-Control-Allow-Private-Network: true` on the preflight. Ollama 0.4+ does this automatically when an origin is allow-listed; for vLLM / llama.cpp you need a CORS middleware that adds the header. |

VPN networks (Tailscale, WireGuard) issue private IPs in CGNAT
ranges — Chrome treats them the same as LAN IPs, so PNA still
applies. Tailscale's own DNS names (`*.ts.net`) work fine in Custom
hosts.

---

## 2. SSH tunnel — the cleanest workaround

If you can SSH into the remote box, an `ssh -L` local-forward "drops"
the remote LLM onto your laptop's loopback. From the browser's
perspective, the LLM now lives at `127.0.0.1` — which means **none**
of the LAN-IP problems apply:

- mixed content is fine (HTTPS pages can reach `http://127.0.0.1`)
- PNA does not apply (loopback is exempt)
- only CORS is left, and you configure that on the remote engine the
  same way you would for a local one

```bash
# One forward per engine port. Put each in its own terminal, or
# combine with multiple -L flags on a single connection.
ssh -N -L 11434:localhost:11434 user@remote-host   # Ollama
ssh -N -L 1234:localhost:1234   user@remote-host   # LM Studio
ssh -N -L 8000:localhost:8000   user@remote-host   # vLLM
ssh -N -L 8080:localhost:8080   user@remote-host   # llama.cpp
```

Combined onto a single SSH connection:

```bash
ssh -N \
  -L 11434:localhost:11434 \
  -L 1234:localhost:1234 \
  -L 8000:localhost:8000 \
  user@remote-host
```

Open the page, hit **Rescan**, and the remote engines appear under
their normal default-port slots — exactly as if they were running on
the laptop itself.

### Keep the tunnel up across drops

Plain `ssh` dies on network hiccups. `autossh` reconnects:

```bash
autossh -M 0 -N \
  -o "ServerAliveInterval=30" -o "ServerAliveCountMax=3" \
  -L 11434:localhost:11434 \
  user@remote-host
```

### What to put in `~/.ssh/config`

```sshconfig
Host gpu-box
  HostName 198.51.100.42
  User you
  LocalForward 11434 localhost:11434
  LocalForward 1234  localhost:1234
  LocalForward 8000  localhost:8000
  ServerAliveInterval 30
  ServerAliveCountMax 3
```

Then a single `ssh -N gpu-box` brings up every forward.

### Security note

`ssh -L` binds to `127.0.0.1` on your laptop by default — only your
own user can reach the forwarded port. **Don't** add `-L 0.0.0.0:…`
or `GatewayPorts yes` unless you have a specific reason; that
republishes the remote LLM to your whole local network.

---

## 3. Local reverse proxy — when you have many endpoints

When you're routinely benchmarking against several remotes, opening
N SSH tunnels gets tedious. Run a small reverse proxy on your laptop
that maps local loopback ports to whatever remote URLs you want, and
the page treats every remote as if it were local.

### Caddy (~10 lines, includes auto-HTTPS if you want it)

```caddy
# Caddyfile

# Plain HTTP loopback — easiest. Pair with `pnpm dev` so the page
# is also HTTP and mixed-content is a non-issue.
:11434 {
  reverse_proxy http://gpu-box.tail-net.ts.net:11434
}
:1234  {
  reverse_proxy http://gpu-box.tail-net.ts.net:1234
}

# HTTPS loopback (required if you're using the hosted page on
# https://ai.aldo.tech). mkcert + a trusted local CA does the cert.
https://localhost:11443 {
  tls /path/to/mkcert/localhost.pem /path/to/mkcert/localhost-key.pem
  reverse_proxy http://gpu-box.tail-net.ts.net:11434
}
```

Then `caddy run` and add `https://localhost:11443` (for the HTTPS
example) or just rescan (for the plain HTTP examples — they'll be
discovered automatically on default ports).

### nginx equivalent

```nginx
server {
  listen 11434;
  location / {
    proxy_pass http://gpu-box.tail-net.ts.net:11434;
    # Echo back the headers the browser actually needs.
    add_header Access-Control-Allow-Origin "$http_origin" always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
    add_header Access-Control-Allow-Private-Network "true" always;
    if ($request_method = OPTIONS) { return 204; }
  }
}
```

A reverse proxy is also the cleanest place to:

- **Inject CORS / PNA headers** for engines that don't speak them
  natively (older llama.cpp builds, vLLM without middleware).
- **Terminate TLS** with a trusted cert when you're forced to use
  the HTTPS page (Safari, hosted demo) and the remote engine only
  speaks HTTP.
- **Aggregate multiple boxes** behind a single hostname (e.g.
  `gpu-1.local`, `gpu-2.local` → `localhost:11434`, `localhost:11435`).

---

## TL;DR — pick the simplest one that works

| You have… | Do this |
| --- | --- |
| LAN / VPN access to the box | Custom hosts panel, direct IP/hostname |
| SSH access to the box | `ssh -N -L <port>:localhost:<port> user@host`, treat as `127.0.0.1` |
| Several remote endpoints | Local Caddy / nginx reverse proxy on loopback |
| HTTPS page + plain-HTTP remote | Reverse proxy with mkcert TLS termination, OR run the page locally over HTTP (`pnpm dev`) |

The browser is doing the work either way. Your job is just to make
the remote LLM look like a URL the browser is happy to fetch from.
