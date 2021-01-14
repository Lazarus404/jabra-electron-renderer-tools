declare type BrowserWindow = import('electron').BrowserWindow;
declare type IpcMain = import('electron').IpcMain;
import { JabraType, ConfigParamsCloud } from '@gnaudio/jabra-node-sdk';
/**
 * This factory singleton is responsible for creating the server side Jabra API server that serves
 * events and forwards commands for the corresponding (client side) createApiClient() helper.
 *
 * Creation of the server, is a two-step process:
 * First this factory class must be instantiated BEFORE any window(s) are loaded, secondly after
 * the window(s) has been fully loaded, the factory create method can be called
 *
 * Nb. This factory is a singleton. Create only one instance of this class and in the main thread of Electron
 */
export declare class JabraApiServerFactory {
    private readonly ipcMain;
    private jabraApiMeta;
    private jabraNativeAddonLogConfig;
    private startupError;
    private clientInitResponsesRequested;
    private cachedApiServer;
    /**
     * Construct an JabraApiServer factory using a ready ipcMain instance. This constructor should
     * be called BEFORE any GUI is created.
     *
     * This constructor only throws an error if called from a browser. Other server-side errors in the
     * constructor are catched and result subsequently in a rejected create() promise. This happens
     * to ensure the election main process is not terminated before an error can be shown.
     */
    constructor(ipcMain: IpcMain);
    /**
     * Constructs a Jabra API server singleton instance after any GUI is loaded.
     *
     * If called multiple times, this function must be called with same arguments as result is a singelton.
     *
     * Nb. Importantly, the provided window must be fully loaded (use promise returned by electron's loadFile or
     * wait for electron's 'did-finish-load' event) before creating this object !
     *
     */
    create(appID: string, configCloudParams: ConfigParamsCloud, fullyLoadedWindow: BrowserWindow): Promise<JabraApiServer>;
}
/**
 * Server side Jabra APi server that serves events and forwards commands for the
 * corresponding (client side) createApiClient() helper.
 *
 * Use JabraApiServerFactory to create this in the specified two-step process.
 */
export declare class JabraApiServer {
    /**
     * Internal reference to api instance.
     *
     * Use public getter to access from outside.
     */
    private jabraApi;
    readonly ipcMain: IpcMain;
    readonly window: BrowserWindow;
    /**
     * Return reference to the jabra Api (JabraType instance) being served.
     * This can be used if one need to call the Jabra API from within main instead of the client.
     */
    getJabraApi(): JabraType | null;
    private constructor();
    private onClientInitResponsesRequestedChanged;
    private setupJabraEvents;
    /**
     * Helper that filter out internal data structures when forwarding data:
     */
    private getPublicDeviceData;
    private setupElectonEvents;
    private subscribeDeviceTypeEvents;
    private unsubscribeDeviceTypeEvents;
    private executeJabraApiCall;
    private executeDeviceApiCall;
    /**
     * Call this when/if finished with the server and the embedded JabraApi.
    */
    shutdown(): Promise<void>;
}
export {};
