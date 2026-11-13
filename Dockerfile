FROM docker.io/library/node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build


FROM docker.io/library/node:22-bookworm-slim AS runtime

# The app starts review containers through the host's Podman API socket.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends podman ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=5000 \
    DATA_DIR=/app/data \
    CONTAINER_HOST=unix:///run/podman/podman.sock

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
RUN npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.ts ./next.config.ts

EXPOSE 5000

CMD ["npm", "start"]
