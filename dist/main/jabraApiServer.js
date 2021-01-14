"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("../common/util");
const jabra_node_sdk_1 = require("@gnaudio/jabra-node-sdk");
const ipc_1 = require("../common/ipc");
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
class JabraApiServerFactory {
    /**
     * Construct an JabraApiServer factory using a ready ipcMain instance. This constructor should
     * be called BEFORE any GUI is created.
     *
     * This constructor only throws an error if called from a browser. Other server-side errors in the
     * constructor are catched and result subsequently in a rejected create() promise. This happens
     * to ensure the election main process is not terminated before an error can be shown.
     */
    constructor(ipcMain) {
        if (!util_1.isNodeJs()) {
            let error = new Error("This JabraApiServerFactory class needs to run under NodeJs and not in a browser");
            console.error(error); // Nb. In this case we can't log the error _JabraNativeAddonLog !
            throw error;
        }
        this.clientInitResponsesRequested = [];
        this.startupError = undefined;
        this.ipcMain = ipcMain;
        this.jabraApiMeta = [];
        this.jabraNativeAddonLogConfig = undefined;
        this.cachedApiServer = null;
        try {
            this.ipcMain = ipcMain;
            this.jabraApiMeta = jabra_node_sdk_1._getJabraApiMetaSync();
            this.jabraNativeAddonLogConfig = jabra_node_sdk_1._JabraGetNativeAddonLogConfig();
            if (!this.jabraNativeAddonLogConfig)
                throw new Error("Could not lookup Jabra log configuration");
        }
        catch (e) {
            this.startupError = e;
            jabra_node_sdk_1._JabraNativeAddonLog(2 /* error */, "JabraApiServerFactory.constructor", JSON.stringify(e, null, 3));
        }
        if (ipcMain) {
            try {
                // Register client initializations so we can later serve configuration/meta data to them when 
                // server is fully up an running. We can't serve this data now, as the client api factory would 
                // then complete too soon, resulting in subsequent API calls that we are not ready to handle.
                this.ipcMain.on(ipc_1.createApiClientInitEventName, (mainEvent) => {
                    const frameId = mainEvent.frameId;
                    jabra_node_sdk_1._JabraNativeAddonLog(4 /* info */, "JabraApiServerFactory.constructor", "Jabra client initiailized - meta data requested by createApiClient at frame " + frameId);
                    // Add to queue of responses required once server is ready:
                    // Nb. Importantly "push" array operation must be used for this as we instrument this call later!
                    this.clientInitResponsesRequested.push({
                        frameId: mainEvent.frameId,
                        response: util_1.serializeError(this.startupError) || {
                            logConfig: this.jabraNativeAddonLogConfig,
                            apiMeta: this.jabraApiMeta
                        }
                    });
                });
                // Log any string (!) messages received:
                // We do this here in the factory so we can catch also early logging requests from client:
                this.ipcMain.on(ipc_1.jabraLogEventName, (mainEvent, severity, caller, msg) => {
                    jabra_node_sdk_1._JabraNativeAddonLog(severity, caller, msg);
                });
            }
            catch (e) {
                this.startupError = e;
                jabra_node_sdk_1._JabraNativeAddonLog(2 /* error */, "JabraApiServerFactory.constructor", e);
            }
        }
        else {
            this.startupError = new Error("ipcMain argument missing to JabraApiServerFactory constructor");
        }
        if (!this.startupError) {
            jabra_node_sdk_1._JabraNativeAddonLog(4 /* info */, "JabraApiServerFactory.constructor", "JabraApiServerFactory sucessfully initialized");
        }
    }
    /**
     * Constructs a Jabra API server singleton instance after any GUI is loaded.
     *
     * If called multiple times, this function must be called with same arguments as result is a singelton.
     *
     * Nb. Importantly, the provided window must be fully loaded (use promise returned by electron's loadFile or
     * wait for electron's 'did-finish-load' event) before creating this object !
     *
     */
    create(appID, configCloudParams, fullyLoadedWindow) {
        if (this.cachedApiServer != null) {
            if (this.cachedApiServer.appID !== appID
                || this.cachedApiServer.configCloudParams !== configCloudParams
                || this.cachedApiServer.fullyLoadedWindow !== fullyLoadedWindow) {
                return Promise.reject(new Error("JabraApiServerFactory.create must be called with identical parameters if called multiple times as return value is a singleton"));
            }
            return this.cachedApiServer.server;
        }
        else if (!this.startupError) {
            let server = JabraApiServer.create(appID, configCloudParams, this.ipcMain, this.jabraApiMeta, this.clientInitResponsesRequested, fullyLoadedWindow);
            this.cachedApiServer = {
                server,
                appID,
                configCloudParams,
                fullyLoadedWindow
            };
            return server;
        }
        else {
            return Promise.reject(this.startupError);
        }
    }
}
exports.JabraApiServerFactory = JabraApiServerFactory;
/**
 * Server side Jabra APi server that serves events and forwards commands for the
 * corresponding (client side) createApiClient() helper.
 *
 * Use JabraApiServerFactory to create this in the specified two-step process.
 */
class JabraApiServer {
    constructor(jabraApi, ipcMain, jabraApiMeta, clientInitResponsesRequested, window) {
        this.jabraApi = jabraApi;
        this.ipcMain = ipcMain;
        this.window = window;
        this.setupJabraEvents(jabraApi);
        this.setupElectonEvents(jabraApi);
        // Send requests for current and future clients waiting for delayed responses in clientInitResponsesRequested:
        // Nb. requires "push" to be used to add items in factory!!
        this.onClientInitResponsesRequestedChanged(clientInitResponsesRequested);
        clientInitResponsesRequested.push = (...args) => {
            const retv = Array.prototype.push.apply(clientInitResponsesRequested, [...args]);
            this.onClientInitResponsesRequestedChanged(clientInitResponsesRequested);
            return retv;
        };
    }
    /**
     * Constructs a Jabra API server object.
     *
     * Nb. Importantly, the provided window must be fully loaded (use promise returned by electron's loadFile or
     * wait for electron's 'did-finish-load' event) before creating this object !
     *
     * @internal This function is intended for internal use only - clients should NOT use this - only our own factory!
     */
    static create(appID, configCloudParams, ipcMain, jabraApiMeta, clientInitResponsesRequested, window) {
        return jabra_node_sdk_1.createJabraApplication(appID, configCloudParams).then((jabraApi) => {
            const server = new JabraApiServer(jabraApi, ipcMain, jabraApiMeta, clientInitResponsesRequested, window);
            jabra_node_sdk_1._JabraNativeAddonLog(4 /* info */, "JabraApiServer.create", "JabraApiServer server ready");
            return server;
        });
    }
    /**
     * Return reference to the jabra Api (JabraType instance) being served.
     * This can be used if one need to call the Jabra API from within main instead of the client.
     */
    getJabraApi() {
        return this.jabraApi;
    }
    onClientInitResponsesRequestedChanged(clientInitResponsesRequested) {
        // Send delayed responses to client from our server that is now ready to process api calls:
        let responseRequested;
        while ((responseRequested = clientInitResponsesRequested.shift())) {
            this.window.webContents.sendToFrame(responseRequested.frameId, ipc_1.createApiClientInitResponseEventName, responseRequested.response);
        }
    }
    setupJabraEvents(jabraApi) {
        jabraApi.on('attach', (device) => {
            let deviceData = this.getPublicDeviceData(device);
            this.subscribeDeviceTypeEvents(device);
            this.window.webContents.send(ipc_1.getJabraTypeApiCallabackEventName('attach'), deviceData);
        });
        jabraApi.on('detach', (device) => {
            let deviceData = this.getPublicDeviceData(device);
            this.unsubscribeDeviceTypeEvents(device);
            this.window.webContents.send(ipc_1.getJabraTypeApiCallabackEventName('detach'), deviceData);
        });
        jabraApi.on('firstScanDone', () => {
            this.window.webContents.send(ipc_1.getJabraTypeApiCallabackEventName('firstScanDone'));
        });
    }
    /**
     * Helper that filter out internal data structures when forwarding data:
     */
    getPublicDeviceData(device) {
        return Object.keys(device).filter(key => !key.startsWith("_")).reduce((obj, key) => {
            return {
                ...obj,
                [key]: device[key]
            };
        }, {});
    }
    setupElectonEvents(jabraApi) {
        // Normally the client will be ready before the server, but if client
        // is ready after the server (in case of a refresh) the client will be
        // missing some important attach events. Thus, we here listen for client
        // becoming ready after the server and replay attach events.
        this.ipcMain.on(ipc_1.jabraApiClientReadyEventName, (event, clientReadyTime) => {
            const frameId = event.frameId;
            const devices = jabraApi.getAttachedDevices().filter(device => device.attached_time_ms < clientReadyTime);
            if (devices.length > 0) {
                const deviceIds = devices.map(device => device.deviceID);
                jabra_node_sdk_1._JabraNativeAddonLog(2 /* error */, "JabraApiServer.setupElectonEvents", "Replaying attach events to client for devices " + deviceIds.join(","));
                devices.forEach((device) => {
                    const deviceData = this.getPublicDeviceData(device);
                    this.window.webContents.sendToFrame(frameId, ipc_1.getJabraTypeApiCallabackEventName('attach'), deviceData);
                });
            }
        });
        // Receive JabraType api method calls from client:
        this.ipcMain.on(ipc_1.getExecuteJabraTypeApiMethodEventName(), (event, methodName, executionId, ...args) => {
            const frameId = event.frameId;
            try {
                const result = this.executeJabraApiCall(jabraApi, methodName, executionId, ...args);
                if (result instanceof Promise) {
                    result.then((v) => {
                        this.window.webContents.sendToFrame(frameId, ipc_1.getExecuteJabraTypeApiMethodResponseEventName(), methodName, executionId, undefined, v);
                    }).catch((err) => {
                        this.window.webContents.sendToFrame(frameId, ipc_1.getExecuteJabraTypeApiMethodResponseEventName(), methodName, executionId, util_1.serializeError(err), undefined);
                    });
                }
                else {
                    this.window.webContents.sendToFrame(frameId, ipc_1.getExecuteJabraTypeApiMethodResponseEventName(), methodName, executionId, undefined, result);
                }
            }
            catch (err) {
                jabra_node_sdk_1._JabraNativeAddonLog(2 /* error */, "JabraApiServer.setupElectonEvents", err);
                this.window.webContents.sendToFrame(frameId, ipc_1.getExecuteJabraTypeApiMethodResponseEventName(), methodName, executionId, util_1.serializeError(err), undefined);
            }
        });
    }
    subscribeDeviceTypeEvents(device) {
        // Receive DeviceType api method calls from client:
        this.ipcMain.on(ipc_1.getExecuteDeviceTypeApiMethodEventName(device.deviceID), (event, methodName, executionId, ...args) => {
            const frameId = event.frameId;
            try {
                const result = this.executeDeviceApiCall(device, methodName, executionId, ...args);
                if (result instanceof Promise) {
                    result.then((v) => {
                        this.window.webContents.sendToFrame(frameId, ipc_1.getExecuteDeviceTypeApiMethodResponseEventName(device.deviceID), methodName, executionId, undefined, v);
                    }).catch((err) => {
                        this.window.webContents.sendToFrame(frameId, ipc_1.getExecuteDeviceTypeApiMethodResponseEventName(device.deviceID), methodName, executionId, util_1.serializeError(err), undefined);
                    });
                }
                else {
                    this.window.webContents.sendToFrame(frameId, ipc_1.getExecuteDeviceTypeApiMethodResponseEventName(device.deviceID), methodName, executionId, undefined, result);
                }
            }
            catch (err) {
                jabra_node_sdk_1._JabraNativeAddonLog(2 /* error */, "JabraApiServer.subscribeDeviceTypeEvents", err);
                this.window.webContents.sendToFrame(frameId, ipc_1.getExecuteDeviceTypeApiMethodResponseEventName(device.deviceID), methodName, executionId, util_1.serializeError(err), undefined);
            }
        });
        // Setup forwarding for all device events:
        jabra_node_sdk_1.DeviceEventsList.forEach((e) => {
            device.on(e, ((...args) => {
                this.window.webContents.send(ipc_1.getDeviceTypeApiCallabackEventName(e, device.deviceID), ...args);
            }));
        });
    }
    unsubscribeDeviceTypeEvents(device) {
        this.ipcMain.removeAllListeners(ipc_1.getExecuteDeviceTypeApiMethodEventName(device.deviceID));
        jabra_node_sdk_1.DeviceEventsList.forEach((e) => {
            device.on(e, ((...args) => {
                this.window.webContents.removeAllListeners(ipc_1.getDeviceTypeApiCallabackEventName(e, device.deviceID));
            }));
        });
    }
    executeJabraApiCall(jabraApi, methodName, executionId, ...args) {
        jabra_node_sdk_1._JabraNativeAddonLog(6 /* verbose */, "executeJabraApiCall", "Executing " + methodName + " with execution id " + executionId);
        if (methodName == util_1.nameof("disposeAsync")) {
            const shutdownServer = args.length > 0 ? !!(args[0]) : false;
            if (shutdownServer) {
                return this.shutdown();
            }
            else {
                return Promise.resolve();
            }
        }
        else {
            return jabraApi[methodName].apply(jabraApi, args);
        }
    }
    executeDeviceApiCall(device, methodName, executionId, ...args) {
        jabra_node_sdk_1._JabraNativeAddonLog(6 /* verbose */, "executeDeviceApiCall", "Executing " + methodName + " with execution id " + executionId);
        if (device.detached_time_ms) {
            throw new Error("Failed executing method " + methodName + " on detached device with id=" + device.deviceID);
        }
        return device[methodName].apply(device, args);
    }
    /**
     * Call this when/if finished with the server and the embedded JabraApi.
    */
    shutdown() {
        this.ipcMain.removeAllListeners(ipc_1.getExecuteJabraTypeApiMethodEventName());
        this.ipcMain.removeAllListeners(ipc_1.jabraLogEventName);
        if (this.jabraApi) {
            const api = this.jabraApi;
            this.jabraApi = null;
            Array.from(api.getAttachedDevices().values()).forEach((device) => {
                this.unsubscribeDeviceTypeEvents(device);
            });
            return api.disposeAsync().then(() => {
                jabra_node_sdk_1._JabraNativeAddonLog(4 /* info */, "JabraApiServer.shutdown()", "Server shutdown");
            });
        }
        else {
            return Promise.resolve();
        }
    }
}
exports.JabraApiServer = JabraApiServer;
//# sourceMappingURL=jabraApiServer.js.map