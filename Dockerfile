FROM node:14.15.1-alpine

ARG BUILD_DATE

LABEL org.opencontainers.image.authors="Cory Claflin"
LABEL org.opencontainers.image.created=$BUILD_DATE
LABEL org.opencontainers.image.licenses='MIT'
LABEL org.opencontainers.image.source='https://github.com/cubeworx/cbwxannounce'
LABEL org.opencontainers.image.title="CubeWorx Minecraft Server LAN Announcer"
LABEL org.opencontainers.image.vendor='CubeWorx'

WORKDIR /cbwxannounce

COPY package*.json ./

RUN npm ci --only=production

COPY /source/ /cbwxannounce/source/
COPY index.js .

EXPOSE 19132/udp

CMD [ "node", "index.js" ]
