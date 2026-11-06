FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
RUN npm install --prefix apps/api

COPY apps/api ./apps/api
RUN cd apps/api && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/apps/api/node_modules ./node_modules
COPY --from=base /app/apps/api/dist ./dist
COPY apps/api/package.json ./
COPY apps/api/prisma ./prisma
EXPOSE 3001
CMD ["node", "dist/main.js"]
