FROM node:24-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install --no-install-recommends --yes python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  && python3 scripts/build_label_source_index.py

FROM build AS development

RUN chown -R node:node /app
USER node

FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/src/label-catalog.ts ./src/label-catalog.ts
COPY --from=build --chown=node:node /app/data/label-source-index.sqlite ./data/label-source-index.sqlite

RUN mkdir /app/runtime \
  && chown node:node /app/runtime

USER node
EXPOSE 3000
VOLUME ["/app/runtime"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/session').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
