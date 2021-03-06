'use strict';

const dgram = require('dgram');
const { createSerializer, createDeserializer } = require('raknet/src/transforms/serializer');
const Observer = require('./source/observer');
const Connector = require('./source/connector');

// Configuration
const CBWX_ANNOUNCE_BROADCAST_DELAY_MS = parseInt(process.env.CBWX_ANNOUNCE_BROADCAST_DELAY_MS || '4000');
const CBWX_ANNOUNCE_BROADCAST_IP = (process.env.CBWX_ANNOUNCE_BROADCAST_IP || '255.255.255.255');
const CBWX_ANNOUNCE_BROADCAST_PORT = parseInt(process.env.CBWX_ANNOUNCE_BROADCAST_PORT || '4445');
const CBWX_ANNOUNCE_LISTEN_PORT = parseInt(process.env.CBWX_ANNOUNCE_LISTEN_PORT || '19132');
const CBWX_MCBE_CONNECT_PORT = parseInt(process.env.CBWX_MCBE_CONNECT_PORT || '19132');
const CBWX_MCJE_CONNECT_PORT = parseInt(process.env.CBWX_MCJE_CONNECT_PORT || '25565');
var broadcaster;
var intervals = [];

// Mapping from container id to connector instance
const connectors = {};

// Observe active docker containers
const observer = new Observer();

// Handle a server being added
observer.on('serverAdded', server => {
  console.log(`Server added - Container:(${server.name}) Type:(${server.type}) ID:(${server.shortid}) Name:(${server.announceName})`);
  if (server.ipAddress) {
    if (server.type == "mcbe") { //Bedrock Edition
      let internalMCBEPort = CBWX_MCBE_CONNECT_PORT;

      // Find the mapping for the internal server port
      let portMapping = server.portMappings.find(portMapping => portMapping.privatePort === internalMCBEPort);

      // Default to using the only port mapping there is
      if (!portMapping && server.portMappings.length === 1) {
        portMapping = server.portMappings[0];
      }

      if (portMapping) {
        console.log(`Server running - Container:(${server.name}) Type:(${server.type}) ID:(${server.shortid}) Name:(${server.announceName}) IP:(${server.ipAddress}) Internal port:(${portMapping.privatePort}/udp) External port:(${portMapping.publicPort}/udp)`);
        const connector = new Connector(server.name, server.type, server.ipAddress, portMapping.privatePort, portMapping.publicPort);
        connectors[server.id] = connector;
        connector.on('changed', (oldState, newState) => {
          console.log(`Server status - Container:(${connector.name}) Type:(${server.type}) ID:(${server.shortid}) Name:(${server.announceName}) IP:(${server.ipAddress}) Internal Port:(${portMapping.privatePort}) Old:(${oldState}) New:(${newState})`);
        });
        connector.on('error', error => {
          console.error(`${connector.name} ${error.message}`);
        });
      } else {
        console.error(`Server ${server.name} has no mapping for internal port ${internalMCBEPort}`);
      }
    } else if (server.type == "mcje") { //Java Edition
      let internalMCJEPort = CBWX_MCJE_CONNECT_PORT;

      // Find the mapping for the internal server port
      let portMapping = server.portMappings.find(portMapping => portMapping.privatePort === internalMCJEPort);

      // Default to using the only port mapping there is
      if (!portMapping && server.portMappings.length === 1) {
        portMapping = server.portMappings[0];
      }
      if (portMapping) {
        console.log(`Server running - Container:(${server.name}) Type:(${server.type}) ID:(${server.shortid}) Name:(${server.announceName}) IP:(${server.ipAddress}) Internal port:(${portMapping.privatePort}) External port:(${portMapping.publicPort})`);
        const connector = new Connector(server.name, server.type, server.ipAddress, portMapping.privatePort, portMapping.publicPort);
        connectors[server.id] = connector;

        // run broadcast function every CBWX_ANNOUNCE_BROADCAST_DELAY_MS
        console.log(`Server broadcasting - Container:(${server.name}) Type:(${server.type}) ID:(${server.shortid}) Message:([MOTD]${server.announceName}[/MOTD][AD]${portMapping.publicPort}[/AD])`)
        intervals[server.shortid] = setInterval(broadcast, CBWX_ANNOUNCE_BROADCAST_DELAY_MS,`${server.announceName}`,`${server.type}`,`${portMapping.publicPort}`);

      } else {
        console.error(`Server ${server.name} has no mapping for internal port ${internalMCJEPort}`);
      }
    } else if (server.type == "proxy") { //CWBX Java Proxy
      let internalProxyPort = CBWX_MCJE_CONNECT_PORT;

      // Find the mapping for the internal server port
      let portMapping = server.portMappings.find(portMapping => portMapping.privatePort === internalProxyPort);

      // Default to using the only port mapping there is
      if (!portMapping && server.portMappings.length === 1) {
        portMapping = server.portMappings[0];
      }
      if (portMapping) {
        console.log(`Server running - Container:(${server.name}) Type:(${server.type}) ID:(${server.shortid}) Name:(${server.announceName}) IP:(${server.ipAddress}) Internal port:(${portMapping.privatePort}) External port:(${portMapping.publicPort})`);
        const connector = new Connector(server.name, server.type, server.ipAddress, portMapping.privatePort, portMapping.publicPort);
        connectors[server.id] = connector;

	      // run broadcast function every CBWX_ANNOUNCE_BROADCAST_DELAY_MS
        console.log(`Server broadcasting - Container:(${server.name}) Type:(${server.type}) ID:(${server.shortid}) Message:([MOTD]${server.announceName}[/MOTD][AD]${portMapping.publicPort}[/AD])`)
        intervals[server.shortid] = setInterval(broadcast, CBWX_ANNOUNCE_BROADCAST_DELAY_MS,`${server.announceName}`,`${server.type}`,`${portMapping.publicPort}`);

      } else {
        console.error(`Server ${server.name} has no mapping for internal port ${internalProxyPort}`);
      }
    }
  } else {
    console.error(`Server ${server.name} has no ip address`);
  }
});

// Handle a server being removed
observer.on('serverRemoved', server => {
  console.log(`Server removed - Container:(${server.name}) Type:(${server.type}) ID:(${server.shortid}) Name:(${server.announceName})`);
  clearInterval(intervals[server.shortid]);
  const connector = connectors[server.id];
  if (connector) {
    connector.close();
    delete connectors[server.id];
  }
});

// Respond to a ping from a Bedrock Minecraft client
function handleClientPing (socket, host, port, data) {
  const parser = createDeserializer(true);
  const serializer = createSerializer(true);

  parser.on('data', (parsed) => {
    if (parsed.data.name === 'unconnected_ping') {
      for (const connector of Object.values(connectors)) {
        if (connector.remoteServerID !== null) {
          const updatedServerName = connector.remoteServerName.replace(connector.privatePort, connector.publicPort);
          serializer.write({
            name: 'unconnected_pong', 
            params: {
              pingID: parsed.data.params.pingID,
              serverID: connector.remoteServerID,
              magic: connector.remoteServerMagic,
              serverName: updatedServerName
            }
          });
        }
      }
    } else {
      console.error('Received unexpected packet on listen port:', parsed.data.name);
    }
  });

  serializer.on('data', (chunk) => {
    socket.send(chunk, 0, chunk.length, port, host);
  });

  parser.write(data);
}

//Broadcast mcje servers
function broadcast(announceName, type, publicPort) {
 	let msg = Buffer.from(`[MOTD]${announceName}[/MOTD][AD]${publicPort}[/AD]`);
	if (msg) {
		if (broadcaster) {
		  broadcaster.send(msg, 0, msg.length, CBWX_ANNOUNCE_BROADCAST_PORT, CBWX_ANNOUNCE_BROADCAST_IP);
		} else {
		  broadcaster = dgram.createSocket('udp4');
		  broadcaster.bind(CBWX_ANNOUNCE_BROADCAST_PORT);
		  broadcaster.on('listening', function () {
			  broadcaster.setBroadcast(true);
			  broadcaster.send(msg, 0, msg.length, CBWX_ANNOUNCE_BROADCAST_PORT, CBWX_ANNOUNCE_BROADCAST_IP);
		  });
      broadcaster.on('error', error => {
        console.error("Cannot bind broadcaster");
      });
		}
	}
}

// Check configuration
if (CBWX_ANNOUNCE_BROADCAST_IP) {
  console.log(`CBWX_ANNOUNCE_BROADCAST_IP=${CBWX_ANNOUNCE_BROADCAST_IP}`);
} else {
  console.error("ERROR: No broadcast ip specified, CBWX_ANNOUNCE_BROADCAST_IP cannot be empty");
  process.exit(1);
}
if (CBWX_ANNOUNCE_BROADCAST_PORT) {
  console.log(`CBWX_ANNOUNCE_BROADCAST_PORT=${CBWX_ANNOUNCE_BROADCAST_PORT}`);
} else {
  console.error("ERROR: No broadcast port specified, CBWX_ANNOUNCE_BROADCAST_PORT cannot be empty");
  process.exit(1);
}
if (CBWX_ANNOUNCE_LISTEN_PORT) {
  console.log(`CBWX_ANNOUNCE_LISTEN_PORT=${CBWX_ANNOUNCE_LISTEN_PORT}`);
} else {
  console.error("ERROR: No listen port specified, CBWX_ANNOUNCE_LISTEN_PORT cannot be empty");
  process.exit(1);
}
if (CBWX_MCBE_CONNECT_PORT) {
  console.log(`CBWX_MCBE_CONNECT_PORT=${CBWX_MCBE_CONNECT_PORT}`);
} else {
  console.error("ERROR: No connect port specified, CBWX_MCBE_CONNECT_PORT cannot be empty");
  process.exit(1);
}
if (CBWX_MCJE_CONNECT_PORT) {
  console.log(`CBWX_MCJE_CONNECT_PORT=${CBWX_MCJE_CONNECT_PORT}`);
} else {
  console.error("ERROR: No connect port specified, CBWX_MCJE_CONNECT_PORT cannot be empty");
  process.exit(1);
}

// Listen for broadcast pings from minecraft clients
const socket = dgram.createSocket({ type: 'udp4' });

socket.on('listening', () => {
  const address = socket.address();
  console.log(`Listening for pings at ${address.address}:${address.port}`);  
});

socket.on('message', (data, { port, address }) => {
  handleClientPing(socket, address, port, data);
});

// Let's go
observer.start();
socket.bind(CBWX_ANNOUNCE_LISTEN_PORT);

// Listen for termination message
process.on('SIGTERM', function onSigterm () {
  console.info('Graceful shutdown on SIGTERM');
  for (const connector of Object.values(connectors)) {
    connector.close();
  }
  observer.close();
  process.exit();
});
