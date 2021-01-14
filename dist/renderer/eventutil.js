"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jabra_node_sdk_1 = require("@gnaudio/jabra-node-sdk");
/**
 * Internal helper that returns an array of valid event keys that correspond to the event specificator and are known to exist.
 */
function getEvents(nameSpec, eventList) {
    if (Array.isArray(nameSpec)) {
        // @ts-ignore: Disable wrong "argument not assignable" error in ts 3.4
        return [...new Set([].concat.apply([], nameSpec.map(a => this.getEvents(a, eventList))))];
    }
    else if (nameSpec instanceof RegExp) {
        return Array.from(eventList).filter(key => nameSpec.test(key));
    }
    else { // String
        if (eventList.includes(nameSpec)) {
            return [nameSpec];
        }
        else {
            console.warn("Unknown event " + nameSpec + " ignored when adding/removing eventlistener");
        }
    }
    return [];
}
function multiOn(apiObject, nameSpec, callback) {
    if (apiObject instanceof jabra_node_sdk_1.JabraType) {
        getEvents(nameSpec, jabra_node_sdk_1.JabraEventsList).map(name => {
            apiObject.on(name, callback);
        });
    }
    else if (apiObject instanceof jabra_node_sdk_1.DeviceType) {
        getEvents(nameSpec, jabra_node_sdk_1.DeviceEventsList).map(name => {
            apiObject.on(name, callback);
        });
    }
}
exports.multiOn = multiOn;
;
//# sourceMappingURL=eventutil.js.map