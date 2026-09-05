FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/lensguard.conf.template
COPY docker-entrypoint-https.sh /docker-entrypoint.d/19-lensguard-https.sh
COPY docker-healthcheck.sh /usr/local/bin/lensguard-healthcheck
RUN chmod +x /docker-entrypoint.d/19-lensguard-https.sh /usr/local/bin/lensguard-healthcheck
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
