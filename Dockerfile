FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --no-audit --no-fund
COPY apps/web apps/web
RUN npm run build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends nginx gettext-base tini ca-certificates \
    && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
# The API currently runs TypeScript with tsx, which is a devDependency.
RUN npm ci --workspace apps/api --include=dev --no-audit --no-fund
COPY apps/api/src apps/api/src
COPY --from=build /app/apps/web/dist /app/public
COPY deploy/nginx.conf.template /app/deploy/nginx.conf.template
COPY deploy/entrypoint.sh /app/deploy/entrypoint.sh
RUN chmod +x /app/deploy/entrypoint.sh
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data TZ=Asia/Shanghai
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/app/deploy/entrypoint.sh"]
