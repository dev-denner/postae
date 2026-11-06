FROM node:20-slim AS base
WORKDIR /app
# .npmrc libera apenas scripts de instalação confiáveis (prisma/esbuild).
COPY .npmrc ./
COPY package*.json ./
COPY scripts ./scripts
COPY apps/api/package.json ./apps/api/
RUN npm install --prefix apps/api

COPY apps/api ./apps/api
RUN cd apps/api && npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
ENV UPLOAD_DIR=/app/uploads
# OpenSSL é necessário pelo cliente Prisma (query engine) em ambiente Debian.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/uploads
COPY --from=base /app/apps/api/node_modules ./node_modules
COPY --from=base /app/apps/api/dist ./dist
COPY scripts ./scripts
COPY apps/api/package.json ./
COPY apps/api/prisma ./prisma
RUN node ./scripts/run-bin.mjs prisma/build/index.js generate
EXPOSE 3001
CMD ["node", "dist/main.js"]
