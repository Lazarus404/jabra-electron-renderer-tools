"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * For type-safe string name lookup of properties/method names.
 *
 * @internal
 * @hidden
 */
exports.nameof = (name) => name;
/**
 * Helper method that returns true if code is running as part of node
 * and not (for example) as part of a browser render process.
 *
 * @internal
 * @hidden
 */
function isNodeJs() {
    return typeof process !== 'undefined' &&
        process.versions != null &&
        process.versions.node != null;
}
exports.isNodeJs = isNodeJs;
/**
 * Helper method that returns true if code is running as part of
 * a browser render process.
 *
 * @internal
 * @hidden
 */
function isBrowser() {
    return typeof window !== 'undefined';
}
exports.isBrowser = isBrowser;
/**
 * Internal helper to serialize errors as event data.
 *
 * @internal
 * @hidden
 */
function serializeError(error) {
    if (error !== undefined && error !== null) {
        var simpleObject = {};
        if (error.name) {
            simpleObject["name"] = error.name;
        }
        if (error.message) {
            simpleObject["message"] = error.message;
        }
        if (error.stack) {
            simpleObject["stack"] = error.stack;
        }
        // Copy extra properties not mentioned here.
        Object.getOwnPropertyNames(error).forEach(function (key) {
            if (simpleObject[key] == undefined) {
                simpleObject[key] = error[key];
            }
        });
        return simpleObject;
    }
    else {
        return error;
    }
}
exports.serializeError = serializeError;
//# sourceMappingURL=util.js.map