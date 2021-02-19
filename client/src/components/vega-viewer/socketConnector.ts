import { sendNewVersion, connect, subscribeToRemoteChanges } from 'revize';

export default class SocketConnector {
  private currentVersion: number = -1;
  private currentSpec: any = {};
  private onSpecChangedCallbacks: ((spec: any) => void)[] = [];

  constructor() {
    this.setupConnection();
  }

  private setupConnection() {
    connect("http://localhost", 5000, "test");
    subscribeToRemoteChanges(this.onSpecChangedRemotely.bind(this));
  }

  private onSpecChangedRemotely(spec: any, version: number) {
    if (version < this.currentVersion) {
      return;
    }
    this.currentVersion = version;
    this.currentSpec = spec;

    this.onSpecChangedCallbacks.forEach(callback => callback(spec));
  }

  public subscribeToRemoteChanges(callback: (spec: any) => void) {
    callback(this.currentSpec);
    this.onSpecChangedCallbacks.push(callback);
  }

  public publishNewSpec(newSpec: any) {
    // broadcastNewVersion(newSpec, this.currentVersion);
    sendNewVersion(newSpec, this.currentVersion);
  }

  public getCurrentSpec() {
    return this.currentSpec;
  }
}

const instance = new SocketConnector();

export function getSocketConnector() {
  return instance;
}