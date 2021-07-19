'use strict';

const dgram = require('dgram');
const { createSerializer, createDeserializer } = require('raknet/src/transforms/serializer');
const Observer = require('./source/observer');
const Connector = require('./source/connector');

// Configuration
const CBWX_BEDROCK_PORT = parseInt(process.env.CBWX_BEDROCK_PORT || '19132');
const CBWX_JAVA_PORT = parseInt(process.env.CBWX_JAVA_PORT || '25565');

// Mapping from container id to connector instance
const connectors = {};

// Observe active docker containers
const observer = new Observer();

// Handle a server being added
observer.on('serverAdded', server => {
  console.log(`Server added: ${server.name} (${server.id})`);
  if (server.ipAddress) {
    let internalPort = CBWX_BEDROCK_PORT;
    
    // Has the server been configured to run on a non-default port
    if (server.internalPort != null) {
      console.log(`Server ${server.name} configured to use internal port ${server.internalPort}`);
      internalPort = server.internalPort;
    }

    // Find the mapping for the internal server port
    let portMapping = server.portMappings.find(portMapping => portMapping.privatePort === internalPort);

    // Default to using the only port mapping there is
    if (!portMapping && server.portMappings.length === 1) {
      portMapping = server.portMappings[0];
    }

    if (portMapping) {
      console.log(`Server ${server.name} is running on internal port ${portMapping.privatePort} and external port ${portMapping.publicPort}`);
      const connector = new Connector(server.name, server.ipAddress, portMapping.privatePort, portMapping.publicPort);
      connectors[server.id] = connector;
      connector.on('changed', (oldState, newState) => {
        console.log(`${connector.name} changed state from [${oldState}] to [${newState}]`)
      });
      connector.on('error', error => {
        console.error(`${connector.name} ${error.message}`);
      });
    } else {
      console.error(`Server ${server.name} has no mapping for internal port ${internalPort}`);
    }
  } else {
    console.error(`Server ${server.name} has no ip address`);
  }
});

// Handle a server being removed
observer.on('serverRemoved', server => {
  console.log(`Server removed: ${server.name} (${server.id})`);
  const connector = connectors[server.id];
  if (connector) {
    connector.close();
    delete connectors[server.id];
  }
});

// Respond to a ping from a minecraft client
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

// Check configuration
if (CBWX_BEDROCK_PORT) {
  console.log(`CBWX_BEDROCK_PORT=${CBWX_BEDROCK_PORT}`);
} else {
  console.error("ERROR: No listen port specified, CBWX_BEDROCK_PORT cannot be empty");
  process.exit(1);
}
if (CBWX_JAVA_PORT) {
  console.log(`CBWX_JAVA_PORT=${CBWX_JAVA_PORT}`);
} else {
  console.error("ERROR: No listen port specified, CBWX_JAVA_PORT cannot be empty");
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
socket.bind(CBWX_BEDROCK_PORT);

// Listen for termination message
process.on('SIGTERM', function onSigterm () {
  console.info('Graceful shutdown on SIGTERM');
  for (const connector of Object.values(connectors)) {
    connector.close();
  }
  observer.close();
  process.exit();
});
