# Verdikt web frontend: build the SPA, serve it from nginx.
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite inlines env vars at BUILD time, not run time, so the API location has to
# be fixed here. "/" means same-origin: nginx proxies /api to the api service,
# which keeps the session cookie same-site. (An empty value would instead
# select the built-in mock data -- see src/api/index.ts.)
ARG VITE_API_URL=/
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
