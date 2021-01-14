"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
;
/**
 * Send when the client is initializing asking the Api server for meta data when ready.
 */
exports.createApiClientInitEventName = "jabraApiClientIntializing";
/**
 * Send when the server is ready along with meta data for the client
 */
exports.createApiClientInitResponseEventName = "jabraApiClientIntializingResponse";
/**
 * Send when the client wants to log something to the native Jabra Log.
 */
exports.jabraLogEventName = "jabraApiClientLog";
/**
 * Send when the client is ready and wants to receive any prior attach events.
 * Nb. This event might be missed by the server if the client is ready before
 * the server is. This should not be a problem though as there should then
 * be no prior attach events to resend.
 */
exports.jabraApiClientReadyEventName = "jabraApiClientReadyEventName";
/**
 * Event channel name for executing methods against a specific device.
 */
function getExecuteDeviceTypeApiMethodEventName(deviceID) {
    return 'executeDeviceApiMethod:' + deviceID.toString();
}
exports.getExecuteDeviceTypeApiMethodEventName = getExecuteDeviceTypeApiMethodEventName;
/**
 * Event channel name for responding with results to executing methods against a specific device.
 */
function getExecuteDeviceTypeApiMethodResponseEventName(deviceID) {
    return 'executeDeviceApiMethodResponse:' + deviceID.toString();
}
exports.getExecuteDeviceTypeApiMethodResponseEventName = getExecuteDeviceTypeApiMethodResponseEventName;
/**
 * Event channel name for receiving events for a specific device.
 */
function getDeviceTypeApiCallabackEventName(eventName, deviceID) {
    return eventName + ':' + deviceID.toString();
}
exports.getDeviceTypeApiCallabackEventName = getDeviceTypeApiCallabackEventName;
/**
 * Event channel name for executing general methods on the jabra sdk (not device specific).
 */
function getExecuteJabraTypeApiMethodEventName() {
    return 'executeJabraApiMethod';
}
exports.getExecuteJabraTypeApiMethodEventName = getExecuteJabraTypeApiMethodEventName;
/**
 * Event channel name for responding with results to executing methods on the jabra sdk (not device specific).
 */
function getExecuteJabraTypeApiMethodResponseEventName() {
    return 'executeJabraApiMethodResponse';
}
exports.getExecuteJabraTypeApiMethodResponseEventName = getExecuteJabraTypeApiMethodResponseEventName;
/**
 * Event channel name for receiving general (not device specific) jabra sdk events.
 */
function getJabraTypeApiCallabackEventName(eventName) {
    return eventName;
}
exports.getJabraTypeApiCallabackEventName = getJabraTypeApiCallabackEventName;
//# sourceMappingURL=ipc.js.map