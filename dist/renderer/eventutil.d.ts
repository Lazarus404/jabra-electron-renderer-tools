import { JabraType, DeviceType } from "@gnaudio/jabra-node-sdk";
export declare function multiOn(apiObject: JabraType | DeviceType, nameSpec: string | RegExp | Array<string | RegExp>, callback: (...args: any[]) => void): void;
