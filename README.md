CubeWorx Minecraft Server LAN Announcer
==============

This image is a self-contained Minecraft Server announcer to make it easier to run multiple minecraft servers on the same host and make them them disoverable as LAN games for respective Bedrock Edition & Java Edition clients. It is intended for use in the upcoming CubeWork ecosystem but is also being provided for use in the Minecraft community.

## Quickstart

```
docker run -d -it --network=host -p 19132:19132/udp -p 25565:25565 -v /var/run/docker.sock:/var/run/docker.sock cubeworx/cbwxannounce
```

## Thanks

This application was origionally copied from [manymine](https://github.com/illiteratealliterator/manymine) but has since been updated to be compatible with both Bedrock Edition & Java Edition servers.