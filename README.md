[![Build](https://img.shields.io/github/workflow/status/cubeworx/cbwxannounce/build-push-docker)](https://github.com/cubeworx/cbwxannounce/actions)
[![Docker Pulls](https://img.shields.io/docker/pulls/cubeworx/cbwxannounce.svg)](https://hub.docker.com/r/cubeworx/cbwxannounce)
[![Docker Image Version (latest semver)](https://img.shields.io/docker/v/cubeworx/cbwxannounce?sort=semver)](https://hub.docker.com/r/cubeworx/cbwxannounce)
[![Docker Image Size (tag)](https://img.shields.io/docker/image-size/cubeworx/cbwxannounce/latest)](https://hub.docker.com/r/cubeworx/cbwxannounce)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/cubeworx/cbwxannounce/blob/master/LICENSE)
[![Twitter](https://img.shields.io/twitter/follow/cubeworx?label=Follow&style=social)](https://twitter.com/intent/follow?screen_name=cubeworx)


CubeWorx Minecraft Server LAN Announcer
==============

This image is a self-contained Minecraft Server announcer to make it easier to run multiple minecraft servers on the same host and make them them disoverable as LAN games for respective Bedrock Edition & Java Edition clients. It is intended for use in the upcoming CubeWorx ecosystem but is also being provided for use in the Minecraft community.

## Quickstart

```
docker run -d -it -p 19132:19132/udp -v /var/run/docker.sock:/var/run/docker.sock cubeworx/cbwxannounce
```
or
```
docker run -d -it --network=host -v /var/run/docker.sock:/var/run/docker.sock cubeworx/cbwxannounce
```

## Thanks

This application was origionally copied from [manymine](https://github.com/illiteratealliterator/manymine) but is being updated to be compatible with both Bedrock Edition & Java Edition servers.