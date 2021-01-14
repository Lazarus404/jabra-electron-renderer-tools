declare type IpcRenderer = import('electron').IpcRenderer;
import { JabraType } from '@gnaudio/jabra-node-sdk';
/**
* Factory method for creating promise returning remote client-side singleton instance of JabraType.
*/
export declare function createApiClient(ipcRenderer: IpcRenderer): Promise<JabraType>;
export {};
