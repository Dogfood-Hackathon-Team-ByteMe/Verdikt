# Verdikt API.
#
# bcrypt ships prebuilt binaries for common platforms but falls back to
# node-gyp, so the build stage keeps the toolchain and the runtime stage does
# not. Alpine also needs libc6-compat for those prebuilt binaries to load.
FROM node:22-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

COPY package*.json ./
# npm ci needs the lockfile to match package.json; omit dev deps, the test
# suite is not run inside the image.
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime

WORKDIR /app
RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./
COPY app.js server.js ./
COPY controllers ./controllers
COPY middlewares ./middlewares
COPY models ./models
COPY repositories ./repositories
COPY routes ./routes
COPY services ./services
COPY utils ./utils
COPY scripts ./scripts

# Run unprivileged. The node image already provides this user.
USER node

EXPOSE 8080

# /health is a plain GET that does not touch the database, so it reports
# "process is up" rather than "everything is fine" -- which is what a
# container healthcheck should distinguish.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
