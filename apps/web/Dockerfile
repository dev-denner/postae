FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json ./apps/web/
RUN npm install --prefix apps/web
COPY apps/web ./apps/web
WORKDIR /app/apps/web
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:20-alpine
RUN npm install -g serve
WORKDIR /app
COPY --from=build /app/apps/web/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
