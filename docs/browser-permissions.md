# Browser permissions for local LLM access

`openbench-local` runs entirely in your browser and talks to LLM
servers on `127.0.0.1` (and any custom hosts you add). Browsers
intentionally restrict that traffic to protect users from CSRF-style
attacks against home routers, printers, and dev servers. Whether the
app works out of the box depends on **four** things, none of which are
about the app itself:

1. **Mixed content** — can the HTTPS page even reach `http://...`?
2. **CORS** — does the LLM server allow this origin to call it?
3. **Private Network Access (PNA)** — does the browser need an extra
   preflight before private-IP fetches succeed?
4. **Browser-level toggles** — flags / shields / Develop-menu options
   that mostly only matter when something above is misconfigured.

This document lists the manual steps for each major browser. See
`/cors-recipes` rendered inline in the app for the engine-side config
(Ollama / LM Studio / vLLM / llama.cpp).

> **Quick win:** the simplest path that avoids most of this is to run
> the page over plain HTTP loopback yourself —
> `pnpm dev` → `http://localhost:5173`. Mixed content evaporates and
> PNA does not apply. The hosted versions
> (`ai.aldo.tech/opensource/openbench-local`,
> `zeljan-alduk.github.io/openbench-local`) are HTTPS, so all four
> rules apply there.

---

## Chrome, Edge, Brave (Chromium ≥ 117)

### What works out of the box

- **HTTPS → `http://127.0.0.1`** — allowed; loopback is exempt from
  mixed-content blocking.
- **HTTPS → `http://localhost`** — allowed; same exemption.
- **HTTPS → `http://192.168.x.x`** — allowed *only* if PNA preflight
  succeeds (see below).

### What you need to do

1. **Configure CORS on the engine** to include the page's origin.
   The in-app help panel ships copy-pasteable snippets per engine.
   Example for Ollama:

   ```bash
   launchctl setenv OLLAMA_ORIGINS "https://ai.aldo.tech,http://localhost:5173"
   # then restart Ollama
   ```

2. **Allow Private Network Access (PNA).** Since Chrome 117, an HTTPS
   page calling a private IP triggers a preflight `OPTIONS` request
   that requires the server to echo back
   `Access-Control-Allow-Private-Network: true`. If the engine doesn't
   send that header, either:

   - **Update / configure the engine** so its CORS layer adds the
     header (Ollama 0.4+ does this automatically when an origin is
     allow-listed; vLLM / llama.cpp need
     `--cors-allow-private-network` or equivalent middleware).
   - **Or temporarily disable PNA enforcement** while you test:
     visit `chrome://flags/#block-insecure-private-network-requests`,
     set it to **Disabled**, restart Chrome.
     This weakens your browser security — only do this if you know
     why you're doing it, and revert when you're done.

3. **Brave only** — open the lion icon → **Site shields** → set
   "Trackers & ads blocking" to *Standard* (not Aggressive) for the
   openbench-local page. Aggressive mode rewrites `fetch()` headers in
   ways that break the CORS preflight.

### Diagnosing

- Open DevTools → Network → click the failed request →
  "Response" / "Headers" tabs. Look for `cors error`, `mixed-content`,
  or `Failed to fetch` next to the request.
- The browser console prints a one-liner with the exact reason
  (`The request client is not a secure context` ⇒ PNA;
  `No 'Access-Control-Allow-Origin' header is present` ⇒ CORS).

---

## Firefox

### What works out of the box

- **HTTPS → `http://127.0.0.1`** — allowed (loopback exempt).
- **HTTPS → `http://localhost`** — allowed.
- **HTTPS → LAN IPs** — also allowed today; Firefox does not yet
  enforce PNA, though that may change. CORS still applies.

### What you need to do

1. **CORS on the engine** — same as Chromium. Add the page origin to
   the allow-list.

2. *(Rarely needed.)* Some corporate proxies / antivirus rewrite
   loopback. Visit `about:config`, search `network.proxy.allow_hijacking_localhost`
   — make sure it is `false` (the default). Setting it `true` lets a
   system proxy capture loopback traffic, which breaks discovery.

3. *(Rarely needed.)* If you run the engine on `::1` (IPv6 loopback)
   but Firefox can't reach it, set
   `network.dns.disableIPv6 = false` in `about:config` (default) and
   restart.

### Diagnosing

- DevTools → Console tab is the most useful surface in Firefox.
- DevTools → Network → click request → "Headers" panel for the full
  preflight + actual-request pair.

---

## Safari (macOS / iOS)

Safari is the strictest. **HTTPS → `http://127.0.0.1` is blocked by
mixed-content policy** on Safari ≥ 16. There is no per-site allow
toggle.

### Three options, in order of preference

1. **Run openbench-local over HTTP locally.** Clone the repo, run
   `pnpm install && pnpm dev`, open `http://localhost:5173`. No mixed
   content because the page is also HTTP, no PNA because Safari
   doesn't enforce it. CORS on the engine is the only requirement
   left.

2. **Use Chrome or Firefox** for the hosted versions on `ai.aldo.tech`
   or `github.io`.

3. **Front the engine with HTTPS.** Set up a local reverse proxy with
   a trusted cert:

   ```bash
   brew install mkcert caddy
   mkcert -install
   mkcert localhost 127.0.0.1
   # then run a Caddy / nginx / traefik config that serves
   #   https://localhost:11443 → http://127.0.0.1:11434
   # using the cert mkcert just generated.
   ```

   Add `https://localhost:11443` as a custom host in the
   openbench-local panel. Safari trusts the cert because mkcert
   added its CA to your Keychain.

### Develop menu (optional, for diagnostics)

- Safari → **Settings → Advanced → Show features for web developers**.
  That enables the Develop menu. Develop → Show Web Inspector → Console
  / Network panes mirror DevTools elsewhere.

### iOS Safari

- iOS sandboxes localhost per-app, so `127.0.0.1` from Safari only
  reaches *Safari's own* loopback — there is no LLM server there.
  Use a desktop browser, or expose your LLM on the LAN and add its
  IP as a custom host. A LAN IP from iOS Safari needs the
  HTTPS-with-trusted-cert workaround above.

---

## Mobile browsers (Android / iOS Chrome / Firefox)

The same rules as the desktop versions apply, plus:

- `127.0.0.1` on a phone is the *phone* — not the computer running the
  LLM. To benchmark a desktop LLM from a phone, find the desktop's LAN
  IP (e.g. `192.168.1.42`) and add it as a custom host in
  openbench-local. Then deal with PNA + CORS + (probably)
  HTTPS-with-trusted-cert.
- For day-to-day use, desktop is the path of least resistance.

---

## A 30-second sanity check

Before debugging in the browser, confirm the engine is reachable at
all:

```bash
curl -i http://127.0.0.1:11434/v1/models           # Ollama
curl -i http://127.0.0.1:1234/v1/models            # LM Studio
curl -i http://127.0.0.1:8000/v1/models            # vLLM
curl -i http://127.0.0.1:8080/v1/models            # llama.cpp
```

If any of those fail, fix the engine first — the browser can't help.

If they succeed but openbench-local still says "no servers found":

```bash
# CORS preflight from the openbench-local origin
curl -i -X OPTIONS http://127.0.0.1:11434/v1/models \
  -H "Origin: https://ai.aldo.tech" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: content-type"
```

The response must include both:

- `Access-Control-Allow-Origin: https://ai.aldo.tech` (or `*`)
- `Access-Control-Allow-Private-Network: true` (Chromium ≥ 117 only)

If either is missing, the engine config is the thing to change — none
of the browser flags above can replace a correct CORS response.

---

## Why so many rules?

These restrictions exist because, without them, any random web page
could silently call your home router's admin interface, your printer,
your local dev servers, your IoT devices. The same rules that make
openbench-local annoying to set up keep your LAN safer in the
background. The right fix is almost always **configure the engine**,
not weaken the browser.
