'use strict';

const EventEmitter = require('events');
const Docker = require('dockerode');

class Observer extends EventEmitter {
  constructor() {
    super();
    const self = this;
    self.docker = new Docker({socketPath: '/var/run/docker.sock'});
    self.updateTimeout = null;
    self.servers = {};
  }

  start() {
    const self = this;
    self.update();
  }

  async update() {
    const self = this;
    const containerList = await self.docker.listContainers();
    const containerData = await Promise.all(containerList.map(async info => {
      const container = await self.docker.getContainer(info.Id);
      return container.inspect();
    }));

    //find containers running with announce label equal true
    const activeServers = containerData
      .filter(info => info.State.Status === 'running' && info.Config.Labels['cbwx.announce.enable'] === "true")
      .map(info => new Observer.Server(info));
    //console.log(Object.entries(self.servers));

    for (const [id, server] of Object.entries(self.servers)) {
      if (!activeServers.find(s => s.id === id)) {
        self.removeServer(server);
      }
    }

    activeServers.forEach(s => self.addServer(s));
    self.emit('updated');

    clearTimeout(self.updateTimeout);
    self.updateTimeout = setTimeout(self.update.bind(self), 1000);
  }

  addServer(server) {
    const self = this;
    const existing = self.servers[server.id];
    if (existing) {
      if (!existing.equalTo(server)) {
        self.removeServer(existing);
        self.servers[server.id] = server;
        self.emit('serverAdded', server);
      }
    } else {
      self.servers[server.id] = server;
      self.emit('serverAdded', server);
    }
  }

  removeServer(server) {
    const self = this;
    delete self.servers[server.id];
    self.emit('serverRemoved', server);
  }

  close() {
    const self = this;
    clearTimeout(self.updateTimeout);
  }
}

Observer.Server = class {
  constructor (info) {
    const self = this;
    self.id = info.Id;
    self.shortid = self.id.substring(0, 12);
    self.name = info.Name || 'Unknown';
    self.announceName = null;
    self.ipAddress = null;
    self.type = null;
    self.portMappings = [];

    //determine type from label
    const configuredtype = info.Config.Labels['cbwx.announce.type'];
    if (configuredtype) {
      self.type = configuredtype;
    }

    //determine server name to announce
    for (const [key, entries] of Object.entries(info.Config.Env)) {
      if (key && entries) {
        const matches = entries.includes('SERVER_NAME');
        if (matches) {
          self.announceName = entries.split('=')[1];
        }
      }
    }      
        
    //determine exposed port
    for (const [key, entries] of Object.entries(info.NetworkSettings.Ports)) {
      if (key && entries) {
        //console.log(key);
        const matches = key.match(/^(\d+)/);
        if (matches) {
          const internalPort = parseInt(matches[1]);
          if (entries.length > 0 && entries[0].HostPort) {
            self.portMappings.push(new Observer.PortMapping(internalPort, parseInt(entries[0].HostPort)));
          }
        }
      }
    }

    //determine IPAddress
    for (const network of Object.values(info.NetworkSettings.Networks)) {
      if (network.IPAddress) {
        self.ipAddress = network.IPAddress;
        break;
      }
    }
  }

  equalTo(other) {
    const self = this;
    return self.id === other.id
      && self.shortid === other.shortid
      && self.name === other.name
      && self.announceName === other.announceName
      && self.ipAddress === other.ipAddress
      && self.type === other.type
      && self.portMappings.length === other.portMappings.length
      && self.portMappings.every((m, i) => m.equalTo(other.portMappings[i]));
  }
}

Observer.PortMapping = class {
  constructor (privatePort, publicPort) {
    const self = this;
    self.privatePort = privatePort;
    self.publicPort = publicPort;
  }

  equalTo(other) {
    const self = this;
    return self.privatePort === other.privatePort 
      && self.publicPort === other.publicPort;
  }
}

module.exports = Observer;
