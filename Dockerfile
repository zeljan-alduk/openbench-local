# syntax=docker/dockerfile:1.7

# ──────────────────────────────────────────────────────────────────
# Build stage — produces the static dist/ tree.
# ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable

# Copy lockfile first for better layer caching: deps only re-install
# when package.json or the lockfile actually change.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ──────────────────────────────────────────────────────────────────
# Serve stage — static files behind nginx. The browser does ALL LLM
# traffic itself (directly to the host's 127.0.0.1), so the container
# only needs to serve the bundle. No host-networking flag required.
# ──────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS serve

COPY --from=build /app/dist /usr/share/nginx/html

# A tiny config that adds the right cache headers (long for hashed
# assets, short for index.html) so reloads pick up new builds quickly.
RUN <<'EOF' cat > /etc/nginx/conf.d/default.conf
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;

  # Hashed assets — content-addressed, safe to cache for a year.
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
  }

  # SPA entry point — never cache so a new build is picked up on
  # the next page load.
  location / {
    add_header Cache-Control "no-store";
    try_files $uri $uri/ /index.html;
  }
}
EOF

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
