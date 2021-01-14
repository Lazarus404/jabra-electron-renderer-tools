import { JabraTypeEvents, DeviceTypeEvents, NativeAddonLogConfig, ClassEntry } from '@gnaudio/jabra-node-sdk';
/**
 * The configuration/meta data returned to clients once server is ready.
 */
export interface ApiClientInitEventData {
    logConfig: NativeAddonLogConfig;
    apiMeta: ReadonlyArray<ClassEntry>;
}
/**
 * A serialized error is just an object that is json friendly.
 */
export declare type SerializedError = object;
/**
 * Type for saved responses in init response queue.
 */
export declare type ApiClientIntResponse = {
    frameId: number;
    response: SerializedError | ApiClientInitEventData;
};
/**
 * Send when the client is initializing asking the Api server for meta data when ready.
 */
export declare const createApiClientInitEventName = "jabraApiClientIntializing";
/**
 * Send when the server is ready along with meta data for the client
 */
export declare const createApiClientInitResponseEventName = "jabraApiClientIntializingResponse";
/**
 * Send when the client wants to log something to the native Jabra Log.
 */
export declare const jabraLogEventName = "jabraApiClientLog";
/**
 * Send when the client is ready and wants to receive any prior attach events.
 * Nb. This event might be missed by the server if the client is ready before
 * the server is. This should not be a problem though as there should then
 * be no prior attach events to resend.
 */
export declare const jabraApiClientReadyEventName = "jabraApiClientReadyEventName";
/**
 * Event channel name for executing methods against a specific device.
 */
export declare function getExecuteDeviceTypeApiMethodEventName(deviceID: number): string;
/**
 * Event channel name for responding with results to executing methods against a specific device.
 */
export declare function getExecuteDeviceTypeApiMethodResponseEventName(deviceID: number): string;
/**
 * Event channel name for receiving events for a specific device.
 */
export declare function getDeviceTypeApiCallabackEventName(eventName: DeviceTypeEvents, deviceID: number): string;
/**
 * Event channel name for executing general methods on the jabra sdk (not device specific).
 */
export declare function getExecuteJabraTypeApiMethodEventName(): string;
/**
 * Event channel name for responding with results to executing methods on the jabra sdk (not device specific).
 */
export declare function getExecuteJabraTypeApiMethodResponseEventName(): string;
/**
 * Event channel name for receiving general (not device specific) jabra sdk events.
 */
export declare function getJabraTypeApiCallabackEventName(eventName: JabraTypeEvents): JabraTypeEvents;
