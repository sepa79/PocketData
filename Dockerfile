FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/vendor ./vendor
RUN npm ci
COPY frontend ./
COPY examples /examples
RUN npm test && npm run build

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml ./
COPY vendor/maven ./vendor/maven
RUN cd vendor/maven && sha256sum -c SHA256SUMS && cd /build && mvn -B -ntp dependency:go-offline
COPY VERSION ./
COPY src ./src
COPY compose.yaml compose.ph.yaml .env.example ./
COPY --from=frontend /frontend/dist ./frontend/dist
RUN mvn -B -ntp -Dfrontend.skip=true verify

FROM eclipse-temurin:21-jre-jammy
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 pocketdata && useradd --uid 10001 --gid 10001 --no-create-home pocketdata && mkdir /data && chown 10001:10001 /data
WORKDIR /app
COPY --from=build /build/target/pocketdata.jar /app/pocketdata.jar
ENV POCKETDATA_DATA_DIR=/data PORT=8785
USER 10001:10001
EXPOSE 8785
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-jar", "/app/pocketdata.jar"]
