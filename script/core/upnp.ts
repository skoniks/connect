import { createSocket, Socket } from 'dgram';
import { XMLParser } from 'fast-xml-parser';
import { networkInterfaces } from 'os';
import { createLogger, extendLogger, request } from '../utils';

const DEVICE = 'urn:schemas-upnp-org:device:InternetGatewayDevice:1';
const MULTICAST_HOST = '239.255.255.250';
const MULTICAST_PORT = 1900;
const SERVICES = [
  'urn:schemas-upnp-org:service:WANIPConnection:1',
  'urn:schemas-upnp-org:service:WANIPConnection:2',
  'urn:schemas-upnp-org:service:WANPPPConnection:1',
];

type Gateway = {
  location: string;
  address: string;
};
type Service = {
  serviceType: string;
  serviceId: string;
  controlURL?: string;
  eventSubURL?: string;
  SCPDURL?: string;
};
type Device = {
  deviceList?: { device?: Device };
  serviceList?: { service?: Service };
};
type Mapping = {
  NewRemoteHost: string;
  NewExternalPort: number;
  NewProtocol: 'TCP' | 'UDP';
  NewInternalPort: number;
  NewInternalClient: string;
  NewEnabled: number;
  NewPortMappingDescription: string;
  NewLeaseDuration: number;
};

const logger = createLogger('UPnP', true);

export class UPNP {
  public gateway: Gateway;
  private service?: {
    serviceType: string;
    controlURL: string;
  };

  constructor(gateway: Gateway) {
    this.gateway = gateway;
  }

  static findGateway(timeout = 1800) {
    return new Promise((resolve: (gateway: Gateway) => void, reject) => {
      logger('searching gateway');
      const timedout = false;
      // Connet interfaces
      const sockets: Socket[] = [];
      const connections: Promise<unknown>[] = [];
      const interfaces = Object.entries(networkInterfaces());
      for (const [name, addrs] of interfaces) {
        if (!addrs || !addrs.length) continue;
        for (const addr of addrs) {
          if (addr.internal) continue;
          const type = addr.family === 'IPv4' ? 'udp4' : 'udp6';
          const slog = extendLogger(logger, true, `${name}:${type}`);
          const socket = createSocket(type);
          const connection = new Promise((resolve) => {
            socket.on('listening', () => {
              const address = socket.address();
              slog('listening %s:%d', addr.address, address.port);
              resolve(true);
            });
            socket.on('error', (err) => {
              slog('error\n%O', err);
              socket.close();
            });
            socket.on('close', () => {
              slog('closed');
              const index = sockets.indexOf(socket);
              sockets.splice(index, 1);
              resolve(false);
            });
          });
          connections.push(connection);
          socket.on('message', (msg) => {
            if (timedout) return;
            slog('message - %d bytes', msg.length);
            const response = msg.toString();
            if (!/^(HTTP|NOTIFY)/m.test(response)) return;
            const headers = response
              .split(/\r\n/g)
              .reduce((headers, line: string) => {
                const match = line.match(/^([^:]*)\s*:\s*(.*)$/);
                if (match) headers[match[1].toLowerCase()] = match[2];
                return headers;
              }, <{ [key: string]: string }>{});
            if (!headers.st || !headers.location) {
              reject('Invalid response');
              return;
            }
            socket.address();
            slog('location %s', headers.location);
            sockets.forEach((socket) => socket.close());
            resolve({
              location: headers.location,
              address: addr.address,
            });
          });
          socket.bind(0, addr.address);
          sockets.push(socket);
        }
      }
      // Broadcast message
      Promise.all(connections).then(() => {
        if (timedout) return;
        logger('%d sockets listening', sockets.length);
        const query = Buffer.from(
          [
            'M-SEARCH * HTTP/1.1',
            `HOST: ${MULTICAST_HOST}:${MULTICAST_PORT}`,
            'MAN: "ssdp:discover"',
            'MX: 1',
            `ST: ${DEVICE}`,
            '\r\n',
          ].join('\r\n'),
        );
        sockets.forEach((socket) => {
          socket.send(query, 0, query.length, MULTICAST_PORT, MULTICAST_HOST);
        });
      });
      // Search timeout
      setTimeout(() => {
        sockets.forEach((socket) => socket.close());
        reject('Search timeout');
      }, timeout);
    });
  }

  private async getDevice() {
    const { data } = await request(this.gateway.location);
    const parser = new XMLParser({ ignoreDeclaration: true });
    const device = parser.parse(data).root.device;
    logger('device %s', device.deviceType);
    return <Device>device;
  }

  private parseDevice(device: Device) {
    const services: Service[] = [];
    const toArray = (item: Device | Service) => {
      return Array.isArray(item) ? item : [item];
    };
    const traverseServices = (service: Service) => {
      if (!service) return;
      services.push(service);
    };
    const traverseDevices = (device: Device) => {
      if (!device) return;
      if (device.deviceList && device.deviceList.device) {
        toArray(device.deviceList.device).forEach(traverseDevices);
      }
      if (device.serviceList && device.serviceList.service) {
        toArray(device.serviceList.service).forEach(traverseServices);
      }
    };
    traverseDevices(device);
    return services;
  }

  private async getService() {
    const device = await this.getDevice();
    const service = this.parseDevice(device).find((item) => {
      if (!SERVICES.includes(item.serviceType)) return false;
      if (!item.controlURL) return false;
      return true;
    });
    if (!service) throw new Error('Service not found');
    const { serviceType, controlURL } = service;
    const base = new URL(this.gateway.location);
    let uri: URL;
    try {
      uri = new URL(controlURL || '');
    } catch (error) {
      uri = new URL(controlURL || '', base.href);
    }
    uri.host = uri.host || base.host;
    uri.protocol = uri.protocol || base.protocol;
    logger('service %s', serviceType);
    return { serviceType, controlURL: uri.toString() };
  }

  private async run(action: string, args: { [key: string]: unknown }) {
    if (!this.service) this.service = await this.getService();
    logger('action %s', action);
    const body = [
      '<?xml version="1.0"?>',
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ',
      's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
      '<s:Body>',
      `<u:${action} xmlns:u=${JSON.stringify(this.service.serviceType)}>`,
      ...Object.entries(args).map(([key, value]) => {
        return `<${key}>${typeof value === 'undefined' ? '' : value}</${key}>`;
      }),
      `</u:${action}>`,
      '</s:Body>',
      '</s:Envelope>',
    ].join('');
    const { data: soap } = await request(
      this.service.controlURL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'Content-Length': Buffer.byteLength(body),
          SOAPAction: JSON.stringify(this.service.serviceType + '#' + action),
        },
      },
      body,
    );
    const parser = new XMLParser({ removeNSPrefix: true });
    const data = parser.parse(soap)['Envelope']['Body'];
    if (data['Fault']) {
      logger('fault %s', action);
      const key = data['Fault']['faultstring'];
      const error = data['Fault']['detail'][key];
      throw new Error(error.errorDescription);
    }
    logger('result %s', action);
    // logger('result json %s', JSON.stringify(data, null, 4));
    return data[`${action}Response`];
  }

  public async externalIp() {
    const data = await this.run('GetExternalIPAddress', {});
    return data['NewExternalIPAddress'];
  }

  public async portMapping(
    port: number,
    protocol: 'TCP' | 'UDP' = 'TCP',
    ttl = 1200,
  ) {
    const description = 'Connect UPMP';
    await this.run('AddPortMapping', {
      NewRemoteHost: '',
      NewExternalPort: port,
      NewProtocol: protocol,
      NewInternalPort: port,
      NewInternalClient: this.gateway.address,
      NewEnabled: 1,
      NewPortMappingDescription: description,
      NewLeaseDuration: ttl,
    });
  }

  public async portUnmapping(port: number, protocol: 'TCP' | 'UDP' = 'TCP') {
    return await this.run('DeletePortMapping', {
      NewRemoteHost: '',
      NewExternalPort: port,
      NewProtocol: protocol,
    });
  }

  public async getMappings() {
    let index = 0;
    let end = false;
    const mappings: Mapping[] = [];
    do {
      try {
        const mapping = await this.run('GetGenericPortMappingEntry', {
          NewPortMappingIndex: index++,
        });
        mappings.push(mapping);
      } catch (error) {
        end = index !== 1;
      }
    } while (!end);
    return mappings;
  }

  static async create() {
    const gateway = await UPNP.findGateway();
    return new UPNP(gateway);
  }

  public async destroy() {
    // TODO: portUnmappings
  }
}
