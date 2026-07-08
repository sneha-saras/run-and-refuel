# Single-process image: Express serves the built React app + the API on one PORT.
FROM node:22-alpine

WORKDIR /app

# Install server (production) deps first for better layer caching.
COPY package*.json ./
RUN npm install --omit=dev

# Install client deps (needs devDeps like vite to build) and build the frontend.
COPY client/package*.json ./client/
RUN npm --prefix client install
COPY . .
RUN npm --prefix client run build

ENV NODE_ENV=production
# PORT is read from the environment at runtime (defaults to 3000).
EXPOSE 3000

CMD ["node", "server/index.js"]
