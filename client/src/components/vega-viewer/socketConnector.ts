import { broadcastNewVersion, connect, subscribeToRemoteChanges } from 'revize';

export default class SocketConnector {
  private currentVersion: number = -1;
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

    this.onSpecChangedCallbacks.forEach(callback => callback(spec));
  }

  public subscribeToRemoteChanges(callback: (spec: any) => void) {
    this.onSpecChangedCallbacks.push(callback);
  }

  public publishNewSpec(newSpec: any) {
    broadcastNewVersion(newSpec, this.currentVersion);
  }
}
