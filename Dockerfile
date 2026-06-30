# syntax=docker/dockerfile:1
# 20FIT Shop Inventory — single image serving the REST API *and* the built web UI.
#
# The backend uses Node's built-in node:sqlite (no native modules to compile),
# so a slim Alpine Node 22 image works without extra build tooling.
FROM node:22-alpine

WORKDIR /app

# 1) Install dependencies first for better layer caching. Copy every workspace
#    manifest so npm can resolve the workspace graph, then run `npm ci`.
#    NODE_ENV is not "production" at this point, so devDependencies needed for
#    the build (TypeScript, Vite) are installed.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN npm ci

# 2) Copy the source and build both workspaces:
#    server → server/dist (tsc), web → web/dist (Vite).
COPY . .
RUN npm run build

# 3) Runtime config. Railway injects PORT automatically; this default is only
#    used for a local `docker run`.
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Starts the compiled server, which serves web/dist, exposes /api, and seeds
# demo data automatically when the database is empty.
CMD ["npm", "run", "start"]
