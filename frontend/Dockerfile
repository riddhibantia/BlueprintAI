# BlueprintAI web — Next.js production build.
# Build from repo root:  docker build -f frontend/Dockerfile --build-arg NEXT_PUBLIC_API=http://localhost:8000 -t blueprint-web .
FROM node:24-slim AS build

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

ARG NEXT_PUBLIC_API=http://localhost:8000
ENV NEXT_PUBLIC_API=$NEXT_PUBLIC_API

COPY frontend ./
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production

WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next

EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000"]
