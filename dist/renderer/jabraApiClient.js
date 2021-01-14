"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jabra_node_sdk_1 = require("@gnaudio/jabra-node-sdk");
const ipc_1 = require("../common/ipc");
const util_1 = require("../common/util");
/**
 * Promise singleton tthat createApiClient creates/reuses.
 */
let cachedApiClientPromise = null;
/**
* Factory method for creating promise returning remote client-side singleton instance of JabraType.
*/
function createApiClient(ipcRenderer) {
    if (!util_1.isBrowser()) {
        return Promise.reject(new Error("This createApiClient() function needs to run in a browser process"));
    }
    if (!ipcRenderer) {
        return Promise.reject(new Error("ipcRenderer argument missing to createApiClient() factory method"));
    }
    if (cachedApiClientPromise) {
        return cachedApiClientPromise;
    }
    else {
        cachedApiClientPromise = new Promise((resolve, reject) => {
            try {
                JabraNativeAddonLog(ipcRenderer, 4 /* info */, "createApiClient", "Looking up Jabra API meta data");
                // Notify server that client is up and running and that we would like to get meta data as a response event.
                ipcRenderer.send(ipc_1.createApiClientInitEventName);
                // Wait for answer from server.
                ipcRenderer.once(ipc_1.createApiClientInitResponseEventName, (event, setupConfigResponse) => {
                    // Make return value easier to use and print:
                    addToStringToDeserializedObject(setupConfigResponse);
                    // If we have some log configuration, save it locally for optimaization purposes.
                    if (setupConfigResponse && setupConfigResponse.hasOwnProperty(util_1.nameof("logConfig"))) {
                        logConfig = setupConfigResponse.logConfig;
                        JabraNativeAddonLog(ipcRenderer, 6 /* verbose */, "createApiClient", "Got jabra log configuration:" + JSON.stringify(logConfig, null, 3));
                    }
                    // Get meta information from setup response.
                    if (setupConfigResponse && setupConfigResponse.hasOwnProperty(util_1.nameof("apiMeta"))) {
                        const apiMeta = setupConfigResponse.apiMeta;
                        JabraNativeAddonLog(ipcRenderer, 6 /* verbose */, "createApiClient", "Got jabra apiMeta:" + JSON.stringify(apiMeta, null, 3));
                        const jabraClassName = jabra_node_sdk_1.JabraType.name;
                        let jabraTypeMeta = apiMeta.find((c) => c.name === jabraClassName);
                        if (!jabraTypeMeta) {
                            let error = new Error("Could not find meta data for " + jabraClassName);
                            JabraNativeAddonLog(ipcRenderer, 2 /* error */, "createApiClient", error);
                            return Promise.reject(error);
                        }
                        const deviceClassName = jabra_node_sdk_1.DeviceType.name;
                        let deviceTypeMeta = apiMeta.find((c) => c.name === deviceClassName);
                        if (!deviceTypeMeta) {
                            let error = new Error("Could not find meta data for " + deviceClassName);
                            JabraNativeAddonLog(ipcRenderer, 2 /* error */, "createApiClient", error);
                            return Promise.reject(error);
                        }
                        const result = doCreateRemoteJabraType(jabraTypeMeta, deviceTypeMeta, ipcRenderer);
                        // Calulate the ready time used to replay old events. There is a potential unsolved
                        // theoretical problem if events hanppened while doCreateRemoteJabraType is being executed.
                        // We could improve this marginally by setting the ready time inside this function at 
                        // the exact right place after event handlers are setup, but even that might fail
                        // in theory. However, as USB scanning takes time (so events will come after this
                        // code) these kind of problems are unlikely to happen in real life.
                        // 
                        // Another potential problem with this timing call, is that the browser values are
                        // by design fuzzied because of secruity issues with Meltdown/Spectre. The time 
                        // returned here might thus be off by a couple of milliseconds which creates
                        // another potential race condition, that might cause a attach event to be missed
                        // or repeated if we are extremely unlucky.
                        const clientReadyTime = Date.now();
                        JabraNativeAddonLog(ipcRenderer, 4 /* info */, "createApiClient", "Client side JabraType proxy succesfully created at t=" + clientReadyTime);
                        // Ask server to re-send attach events before now
                        ipcRenderer.send(ipc_1.jabraApiClientReadyEventName, clientReadyTime);
                        return resolve(result);
                    }
                    else {
                        let failure;
                        if (setupConfigResponse.name) {
                            failure = deserializeError(setupConfigResponse);
                            JabraNativeAddonLog(ipcRenderer, 2 /* error */, "createApiClient", failure);
                        }
                        else {
                            failure = setupConfigResponse;
                        }
                        return reject(failure);
                    }
                });
            }
            catch (err) {
                let combinedError = new Error("Internal error during meta retrivial / construction of remote proxy. Got error " + err);
                JabraNativeAddonLog(ipcRenderer, 2 /* error */, "createApiClient", combinedError);
                return reject(combinedError);
            }
        });
        return cachedApiClientPromise;
    }
}
exports.createApiClient = createApiClient;
/**
 * Helper that create a js proxy handler for a api class meta description. Mehod execution and event management
 * must be handled by provided delegating callbacks.
 */
function doCreateProxy(meta, validCheck, methodExecutor, on, off) {
    return {
        get: (target, propKey, receiver) => {
            const isValid = validCheck();
            const propName = propKey.toString();
            let methodEntry;
            if (propKey === Symbol.toPrimitive) {
                return undefined; // Not supported.
            }
            else if (propName === util_1.nameof("toString") || propName === util_1.nameof("toLocaleString")) {
                return () => "[object proxy for " + meta.name + "]";
            }
            else if (propName === util_1.nameof("valueOf")) {
                return () => JSON.stringify(target, null, 2);
            }
            else if (propName === "toJSON") {
                return () => target;
            }
            else if (propName === util_1.nameof("getMeta")) {
                return () => meta; // Use local value for efficiency rather than server side value.
            }
            else if (propName === util_1.nameof("on")) {
                return (eventName, callback) => {
                    on(eventName, callback);
                };
            }
            else if (propName === util_1.nameof("off")) {
                return (eventName, callback) => {
                    off(eventName, callback);
                };
            }
            else if (meta.properties.find(p => p.name === propName)) {
                // Properties (if any) are stored on local object (all readonly).
                return Reflect.get(target, propKey);
            }
            else if ((methodEntry = meta.methods.find(m => m.name === propName)) || propName.startsWith("_")) {
                return (...args) => {
                    // Normal (non-internal) calls are only allowed if we are fully valid, otherwise provide error.
                    if (isValid || propName.startsWith("_")) {
                        return methodExecutor(propKey.toString(), methodEntry, ...args);
                    }
                    else {
                        const error = new Error(meta.name + "instance no longer active/valid. Can not call method");
                        if (methodEntry && methodEntry.jsType === Promise.name) {
                            return Promise.reject(error);
                        }
                        else {
                            throw error;
                        }
                    }
                };
            }
            else {
                return undefined;
            }
        },
        setPrototypeOf: (target, v) => {
            throw new TypeError("setPrototypeOf not supported");
        },
        isExtensible: (target) => {
            return false;
        },
        preventExtensions: (target) => {
            return true;
        },
        getOwnPropertyDescriptor: (target, p) => {
            let key = p.toString();
            let propIndex = meta.properties.findIndex(p => p.name === key);
            if (propIndex) {
                return {
                    configurable: false,
                    enumerable: true,
                    writable: !meta.properties[propIndex].readonly,
                    value: target[key]
                };
            }
            let methodIndex = meta.methods.findIndex(p => p.name === key);
            if (methodIndex) {
                return {
                    configurable: false,
                    enumerable: true,
                    writable: false,
                    value: undefined
                };
            }
            return undefined;
        },
        has: (target, p) => {
            let key = p.toString();
            return meta.properties.findIndex(p => p.name === key) >= 0 || meta.methods.findIndex(p => p.name === key) >= 0;
        },
        set: (target, p, value, receiver) => {
            throw new TypeError("set not supported");
        },
        deleteProperty: (target, p) => {
            throw new TypeError("deleteProperty not supported");
        },
        defineProperty: (target, p, attributes) => {
            throw new TypeError("defineProperty not supported");
        },
        enumerate: (target) => {
            return [...meta.properties.map(p => p.name), ...meta.methods.map(p => p.name)];
        },
        ownKeys: (target) => {
            return [...meta.properties.map(p => p.name), ...meta.methods.map(p => p.name)];
        },
        apply: (target, thisArg, argArray) => {
            throw new TypeError("apply not supported");
        },
        construct: (target, argArray, newTarget) => {
            throw new TypeError("construct not supported");
        }
    };
}
/**
 * Handles event subscription and emits like a simple EventEmitter
 * that can be used client-side.
 */
class SimpleEventEmitter {
    constructor(events) {
        this._eventListeners = new Map();
        this._events = events;
        this._events.forEach((event) => this._eventListeners.set(event, []));
    }
    emit(eventName, ...args) {
        let callbacks = this._eventListeners.get(eventName);
        if (callbacks) {
            callbacks.forEach((callback) => {
                callback(...args);
            });
        }
    }
    on(eventName, callback) {
        let callbacks = this._eventListeners.get(eventName);
        if (!callbacks.find((c) => c === callback)) {
            callbacks.push(callback);
        }
    }
    off(eventName, callback) {
        let callbacks = this._eventListeners.get(eventName);
        let findIndex = callbacks.findIndex((c) => c === callback);
        if (findIndex >= 0) {
            callbacks.splice(findIndex, 1);
        }
    }
    removeAllListeners() {
        this._eventListeners.forEach((l) => {
            l.length = 0;
        });
    }
}
// Execution id should be unique across API instances so needs to be a global.
let methodExecutionId = 0;
/**
 * Create remote remote JabraType using a proxy that forwards events and commands using ipc.
 * There should only be once instance running at the same time
 */
function doCreateRemoteJabraType(jabraTypeMeta, deviceTypeMeta, ipcRenderer) {
    const devices = new Map();
    const resultsByExecutionId = new Map();
    // Find out where the range of method execitions start, so we
    // can dismss messages from an earlier API instance (in case we diposed client and recreated it).
    // Nb. this assumes that only one instance is functioning at the same time.
    const startMethodExecutionId = methodExecutionId;
    const eventEmitter = new SimpleEventEmitter(jabra_node_sdk_1.JabraEventsList);
    let shutDownStatus = false;
    function isValid() {
        return !shutDownStatus;
    }
    function emitEvent(eventName, ...args) {
        eventEmitter.emit(eventName, ...args);
    }
    function executeOn(eventName, callback) {
        eventEmitter.on(eventName, callback);
    }
    function executeOff(eventName, callback) {
        eventEmitter.off(eventName, callback);
    }
    function executeApiMethod(methodName, methodMeta, ...args) {
        if (methodName == util_1.nameof("getAttachedDevices")) {
            // Return our own list of proxies devices for this method !!
            return Array.from(devices.values());
        }
        else if (methodMeta) {
            const thisMethodId = methodExecutionId++;
            let combinedEventArgs = [methodName, thisMethodId, ...args];
            ipcRenderer.send(ipc_1.getExecuteJabraTypeApiMethodEventName(), ...combinedEventArgs);
            if (methodMeta.jsType === Promise.name) {
                return new Promise(function (resolve, reject) {
                    resultsByExecutionId.set(thisMethodId, { methodName, resolve, reject });
                });
            }
            else {
                // For now, we only need to support async remote method (returning promises). If needed in the future, 
                // such methods could be easily supported by calling ipcRenderer.sendSync instead and handle that on the server.
                let error = new Error("This remote client currently only support async remote methods that return promises unlike '" + methodName + "'.");
                console.warn(error);
                JabraNativeAddonLog(ipcRenderer, 2 /* error */, "doCreateRemoteJabraType.executeApiMethod", error);
                throw error;
            }
        }
        else {
            JabraNativeAddonLog(ipcRenderer, 2 /* error */, "doCreateRemoteJabraType.executeApiMethod", "Do not know how to execute " + methodName);
        }
    }
    /**
     * Receive async method execiution results and resolve/reject corresponding promises.
     */
    ipcRenderer.on(ipc_1.getExecuteJabraTypeApiMethodResponseEventName(), (event, methodName, executionId, err, result) => {
        // First, ignore responses from old methods from an earlier instance of the client API:
        if (executionId < startMethodExecutionId) {
            return;
        }
        // First make it easier to debug/inspect results:
        addToStringToDeserializedObject(err);
        addToStringToDeserializedObject(result);
        let promiseCallbacks = resultsByExecutionId.get(executionId);
        if (promiseCallbacks) {
            resultsByExecutionId.delete(executionId);
            if (methodName !== promiseCallbacks.methodName) {
                let internalError = new Error("Internal error - Expected method name " + methodName + " does match actual method name " + promiseCallbacks.methodName + " for executionId " + executionId);
                console.warn(internalError.message);
                JabraNativeAddonLog(ipcRenderer, 3 /* warning */, "doCreateRemoteJabraType", internalError);
                promiseCallbacks.reject(internalError);
            }
            else if (err) {
                let properError = deserializeError(err);
                promiseCallbacks.reject(properError);
            }
            else {
                promiseCallbacks.resolve(result);
            }
            if (methodName == util_1.nameof("disposeAsync")) {
                shutdown();
            }
            ;
        }
        else {
            let internalError = new Error("Internal error - Could not find callback for method name " + methodName + " with executionId " + executionId);
            console.warn(internalError.message);
            JabraNativeAddonLog(ipcRenderer, 3 /* warning */, "doCreateRemoteJabraType", internalError);
        }
    });
    ipcRenderer.on(ipc_1.getJabraTypeApiCallabackEventName('attach'), (event, deviceInfo) => {
        // First make it easier to debug/inspect results:
        addToStringToDeserializedObject(deviceInfo);
        let device = createRemoteDeviceType(deviceInfo, deviceTypeMeta, ipcRenderer);
        devices.set(deviceInfo.deviceID, device);
        emitEvent('attach', device);
    });
    ipcRenderer.on(ipc_1.getJabraTypeApiCallabackEventName('detach'), (event, deviceInfo) => {
        // First make it easier to debug/inspect results:
        addToStringToDeserializedObject(deviceInfo);
        let device = devices.get(deviceInfo.deviceID);
        if (device) {
            devices.delete(deviceInfo.deviceID);
            device._update_detached_time_ms(deviceInfo.detached_time_ms);
            emitEvent('detach', device);
            device._shutdown();
        }
        else {
            // If we can't find the device it must be because it was attached in a previous session.
            let error = new Error("Failure to find device with id " + deviceInfo.deviceID + " in mapping.");
            console.warn(error);
            JabraNativeAddonLog(ipcRenderer, 3 /* warning */, "doCreateRemoteJabraType", error);
        }
    });
    ipcRenderer.on(ipc_1.getJabraTypeApiCallabackEventName('firstScanDone'), (event) => {
        emitEvent('firstScanDone');
    });
    function shutdown() {
        // Mark this instance.
        shutDownStatus = true;
        // Invalidate singleton so a new can be created.
        cachedApiClientPromise = null;
        // Unsubscriber everything:
        ipcRenderer.removeAllListeners(ipc_1.getExecuteJabraTypeApiMethodResponseEventName());
        jabra_node_sdk_1.JabraEventsList.forEach((e) => {
            ipcRenderer.removeAllListeners(ipc_1.getJabraTypeApiCallabackEventName(e));
        });
        // Unsubscriber everything for each device also:
        devices.forEach((device, key) => {
            device._shutdown();
        });
        // Fail all API calls in progress:
        const shutdownError = new Error("Operation cancelled - API is shutdown");
        const inProgressResultsCopy = Array.from(resultsByExecutionId.values());
        resultsByExecutionId.clear();
        inProgressResultsCopy.forEach((e) => {
            e.reject(shutdownError);
        });
        // Remove all listeners.
        eventEmitter.removeAllListeners();
    }
    const proxyHandler = doCreateProxy(jabraTypeMeta, isValid, executeApiMethod, executeOn, executeOff);
    const jabraTypeReadonlyProperties = {
        appID: undefined // unsupported by proxy at this time (and properly for good for security).
    };
    return new Proxy(jabraTypeReadonlyProperties, proxyHandler);
}
/**
 * Create remote DeviceType using a proxy that forwards events and commands using ipc.
 */
function createRemoteDeviceType(deviceInfo, deviceTypeMeta, ipcRenderer) {
    const eventEmitter = new SimpleEventEmitter(jabra_node_sdk_1.DeviceEventsList);
    const resultsByExecutionId = new Map();
    // We use a unique channel for each device (since deviceId is ever increasing), so we don't have
    // to care with possible collisions of device execution ids. Thus, just use local i
    let methodExecutionId = 0;
    let shutDownStatus = false;
    function isValid() {
        return deviceInfo.detached_time_ms === undefined && !shutDownStatus;
    }
    function emitEvent(eventName, ...args) {
        eventEmitter.emit(eventName, ...args);
    }
    function executeOn(eventName, callback) {
        eventEmitter.on(eventName, callback);
    }
    function executeOff(eventName, callback) {
        eventEmitter.off(eventName, callback);
    }
    function executeApiMethod(methodName, methodMeta, ...args) {
        if (deviceInfo.detached_time_ms) {
            return;
        }
        if (methodName == util_1.nameof("_shutdown")) {
            // Special local handling for when we are finshed with the device.
            shutdown();
        }
        else if (methodName == util_1.nameof("_update_detached_time_ms")) {
            const time_ms = args[0];
            // Assign to detached_time_ms even though it is formally a readonly because we don't want clients to change it.
            deviceInfo.detached_time_ms = time_ms;
        }
        else if (methodMeta) {
            const thisMethodExecutionId = methodExecutionId++;
            let combinedEventArgs = [methodName, thisMethodExecutionId, ...args];
            if (methodMeta.jsType === Promise.name) {
                ipcRenderer.send(ipc_1.getExecuteDeviceTypeApiMethodEventName(deviceInfo.deviceID), ...combinedEventArgs);
                return new Promise(function (resolve, reject) {
                    resultsByExecutionId.set(thisMethodExecutionId, { methodName, resolve, reject });
                });
            }
            else {
                // For now, we only need to support async remote method (returning promises). If needed in the future, 
                // such methods could be easily supported by calling ipcRenderer.sendSync instead and handle that on the server.
                let error = new Error("This remote client currently only support async remote methods that return promises unlike '" + methodName + "'.");
                JabraNativeAddonLog(ipcRenderer, 2 /* error */, "createRemoteDeviceType.executeApiMethod", error);
                throw error;
            }
        }
        else {
            JabraNativeAddonLog(ipcRenderer, 2 /* error */, "createRemoteDeviceType.executeApiMethod", "Do not know how to execute " + methodName);
        }
    }
    /**
     * Receive async method execiution results and resolve/reject corresponding promises.
     */
    ipcRenderer.on(ipc_1.getExecuteDeviceTypeApiMethodResponseEventName(deviceInfo.deviceID), (event, methodName, executionId, err, result) => {
        // First make it easier to debug/inspect results:
        addToStringToDeserializedObject(err);
        addToStringToDeserializedObject(result);
        let promiseCallbacks = resultsByExecutionId.get(executionId);
        if (promiseCallbacks) {
            resultsByExecutionId.delete(executionId);
            if (methodName !== promiseCallbacks.methodName) {
                let internalError = new Error("Internal error - Expected method name " + methodName + " does match actual method name " + promiseCallbacks.methodName + " for executionId " + executionId + " and device with Id " + deviceInfo.deviceID);
                console.error(internalError.message);
                JabraNativeAddonLog(ipcRenderer, 2 /* error */, "createRemoteDeviceType", internalError);
                promiseCallbacks.reject(internalError);
            }
            else if (err) {
                let properError = deserializeError(err);
                promiseCallbacks.reject(properError);
            }
            else {
                promiseCallbacks.resolve(result);
            }
        }
        else {
            let internalError = new Error("Internal error - Could not find callback for method name " + methodName + " with executionId " + executionId + " and device with Id " + deviceInfo.deviceID);
            console.warn(internalError.message);
            JabraNativeAddonLog(ipcRenderer, 3 /* warning */, "createRemoteDeviceType", internalError);
        }
    });
    ipcRenderer.on(ipc_1.getDeviceTypeApiCallabackEventName('btnPress', deviceInfo.deviceID), (event, btnType, value) => {
        emitEvent('btnPress', btnType, value);
    });
    ipcRenderer.on(ipc_1.getDeviceTypeApiCallabackEventName('busyLightChange', deviceInfo.deviceID), (event, status) => {
        emitEvent('busyLightChange', status);
    });
    ipcRenderer.on(ipc_1.getDeviceTypeApiCallabackEventName('downloadFirmwareProgress', deviceInfo.deviceID), (event, type, status, dwnldStatusInPrcntg) => {
        emitEvent('downloadFirmwareProgress', type, status, dwnldStatusInPrcntg);
    });
    ipcRenderer.on(ipc_1.getDeviceTypeApiCallabackEventName('onBTParingListChange', deviceInfo.deviceID), (event, pairedListInfo) => {
        emitEvent('onBTParingListChange', pairedListInfo);
    });
    ipcRenderer.on(ipc_1.getDeviceTypeApiCallabackEventName('onGNPBtnEvent', deviceInfo.deviceID), (event, btnEvents) => {
        emitEvent('onGNPBtnEvent', btnEvents);
    });
    ipcRenderer.on(ipc_1.getDeviceTypeApiCallabackEventName('onDevLogEvent', deviceInfo.deviceID), (event, eventString) => {
        emitEvent('onDevLogEvent', eventString);
    });
    ipcRenderer.on(ipc_1.getDeviceTypeApiCallabackEventName('onBatteryStatusUpdate', deviceInfo.deviceID), (event, levelInPercent, isCharging, isBatteryLow) => {
        emitEvent('onBatteryStatusUpdate', levelInPercent, isCharging, isBatteryLow);
    });
    ipcRenderer.on(ipc_1.getDeviceTypeApiCallabackEventName('onUploadProgress', deviceInfo.deviceID), (event, status, levelInPercent) => {
        emitEvent('onUploadProgress', status, levelInPercent);
    });
    function shutdown() {
        JabraNativeAddonLog(ipcRenderer, 6 /* verbose */, "createRemoteDeviceType.shutdown", "device #" + deviceInfo.deviceID + " shutdown.");
        // Signal that device is no longer valid:
        shutDownStatus = true;
        // Remove all event subscriptions:
        jabra_node_sdk_1.DeviceEventsList.forEach((e) => {
            ipcRenderer.removeAllListeners(ipc_1.getDeviceTypeApiCallabackEventName(e, deviceInfo.deviceID));
        });
        // Fail all API calls in progress:
        const shutdownError = new Error("Operation cancelled - Device no longer attached / api shutdown");
        const inProgressResultsCopy = Array.from(resultsByExecutionId.values());
        resultsByExecutionId.clear();
        inProgressResultsCopy.forEach((e) => {
            e.reject(shutdownError);
        });
        // Remove all subscribers.
        eventEmitter.removeAllListeners();
    }
    const proxyHandler = doCreateProxy(deviceTypeMeta, isValid, executeApiMethod, executeOn, executeOff);
    JabraNativeAddonLog(ipcRenderer, 6 /* verbose */, "createRemoteDeviceType", "device #" + deviceInfo.deviceID + " created.");
    return new Proxy(deviceInfo, proxyHandler);
}
/**
 * Patch deserialized object to make it more friendly to use.
 */
function addToStringToDeserializedObject(o) {
    if (o != undefined && o != null && typeof o === 'object') {
        o.toString = () => {
            return JSON.stringify(o, null, 3);
        };
    }
}
/**
 * Return a proper new Error object based on a deserialized one.
 */
function deserializeError(o) {
    let result = new Error(o.message);
    result.stack = o.stack;
    result.code = o.code;
    return result;
}
/**
 * Set during createApiClient initialization and used for optimization.
 */
let logConfig = undefined;
/**
 * Internal helper for sending log info to Jabra native log - used to integrate logs for diagnosing errors.
 *
 * If logConfig is available use this to optimize and filter out log events that are beneath selected log threshold.
 */
function JabraNativeAddonLog(ipcRenderer, severity, caller, msg) {
    try {
        const maxSeverity = logConfig ? logConfig.maxSeverity : 6 /* verbose */;
        if (severity <= maxSeverity) {
            // Always send strings - serialize if needed:
            const serializedMsg = (typeof msg === 'string' || msg instanceof String) ? msg : JSON.stringify(util_1.serializeError(msg), null, 3);
            ipcRenderer.send(ipc_1.jabraLogEventName, severity, caller, serializedMsg);
        }
    }
    catch (e) { // Swallow exceptions to make this call safe to call anywhere.
        console.error(e);
    }
}
//# sourceMappingURL=jabraApiClient.js.map