FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
RUN corepack prepare pnpm@8.15.9 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/algorithm/package.json packages/algorithm/package.json

RUN pnpm --filter . --filter @teamizer/api... install --frozen-lockfile

COPY apps/api/nest-cli.json apps/api/tsconfig.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/api/src apps/api/src
COPY packages/algorithm/tsconfig.json packages/algorithm/tsconfig.build.json packages/algorithm/
COPY packages/algorithm/src packages/algorithm/src

RUN pnpm --filter @teamizer/api prisma:generate
RUN pnpm --filter @teamizer/algorithm build
RUN pnpm --filter @teamizer/api build
RUN pnpm --filter @teamizer/api deploy --prod /opt/teamizer-api
# `pnpm deploy` creates a new virtual store, so generate into that final tree too.
RUN ./apps/api/node_modules/.bin/prisma generate \
  --schema /opt/teamizer-api/prisma/schema.prisma

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=8080

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=node:node /opt/teamizer-api/package.json ./package.json
COPY --from=build --chown=node:node /opt/teamizer-api/node_modules ./node_modules
COPY --from=build --chown=node:node /opt/teamizer-api/dist ./dist
COPY --from=build --chown=node:node /opt/teamizer-api/prisma ./prisma

USER node

EXPOSE 8080
STOPSIGNAL SIGTERM

CMD ["node", "dist/main.js"]
