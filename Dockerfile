# The backend (backend/src/cli.ts serve) with the Chromium it measures and
# prints with. Persistent data -- the SQLite database, PDFs, page images,
# release photos and the licensed fonts -- lives on DATA_DIR, a mounted disk.
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    DATA_DIR=/var/data \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# only the backend's and shared's dependencies (not the website's)
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY web/package.json web/
RUN npm ci --workspace=@ck/backend --workspace=@ck/shared --include-workspace-root \
 && npx playwright install --with-deps chromium \
 && npm cache clean --force

COPY shared shared
COPY backend/src backend/src
COPY publications publications
COPY web/public web/public

EXPOSE 4000
CMD ["node", "--experimental-strip-types", "--experimental-sqlite", "--no-warnings", "backend/src/cli.ts", "serve"]
