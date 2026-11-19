// Entry point of the conversion engine, started by main via utilityProcess.fork().
import type { MainToEngine } from '@shared/engine-protocol';
import { createEngineHost } from './host';
import { createRegistry } from './registry';

const port = process.parentPort;
const host = createEngineHost(createRegistry(), (msg) => port.postMessage(msg));

port.on('message', (event: Electron.MessageEvent) => {
  void host.handle(event.data as MainToEngine);
});

host.ready();
