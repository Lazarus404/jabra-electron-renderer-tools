# Jabra Node.js Electron Renderer Helper

This optional package allows a secure render process in ElectronJs (https://electronjs.org/) to transparently access the full [Jabra Node.js SDK](../nodesdk/README.md) API through proxies implemented on top of Electron's IPC mechanism. This makes it much easier for a sandboxed render process to call into Jabra classes without having to pass messages around.

*Note that this package is optional and only potentially useful in a sandboxed electron setup, where the render process does not have access rights to call into the node modules such as the Jabra Node.js API npm module. Even in this case this package is optional, as electron applications can perfectly decide to manage any such messaging themselves.*

# Usage tips

1. Get a [Jabra API Key](https://developer.jabra.com/site/global/sdks/api_keys/index.gsp)

2. Install dependencies to your existing electron project

    ```npm
    npm install @gnaudio/jabra-node-sdk
    npm install @gnaudio/jabra-electron-renderer-helper
    ```

3. Configure your existing MAIN process script

    Add a top level imports and global:

    ```typescript
    import { app, BrowserWindow, ipcMain } from 'electron';
    import { ConfigParamsCloud } from '@gnaudio/jabra-node-sdk';
    import { JabraApiServerFactory, JabraApiServer } from '@gnaudio/jabra-electron-renderer-helper';

    let jabraServerFactory : JabraApiServerFactory | null = null;
    let jabraServer: JabraApiServer | null = null;
    ```

    Add a preload script to your BrowserWindow instantiation if it is missing:
      
    ```typescript
    preload: path.join(__dirname, 'preload.js')
    ```

    Setup jabra api server when electron is ready:

    ```typescript
    app.on("ready", async () => {
      // Setup the jabra server factory BEFORE creating GUI.
      jabraServerFactory = new JabraApiServerFactory(ipcMain);

      // Code to create GUI window here
      // Tip: Return window.loadFile promise or wait for 'did-finish-load' event and convert it to a promise.
      let fullyLoadedWindow = await your_code_to_create_gui_that_resolves_when_loaded();

      // As window is now fully loaded we can instantiate our api server for the client.
      jabraServer = await jabraServerFactory.create('<Set your Jabra API key here>', 
                                                    { /* config here if needed */}, 
                                                    fullyLoadedWindow);
    });
    ```

    Cleanup when closing:
    ```typescript
    app.on("window-all-closed", async () => {
        if (process.platform !== "darwin") {
            if (jabraServer) {
                await jabraServer.shutdown();
                jabraServer = null;
            }
            if (app) {
                app.quit();
            }
        }
    });
    ```

4. Configure the preload script to expose ipcRender to the renderer process

    ```typescript
    import { ipcRenderer } from 'electron';

    window.electron = { 
        ipcRenderer
    };
    ```

5. Configure to your render javascript (loaded by your html)

    ```typescript
    import { createApiClient } from '@gnaudio/jabra-electron-renderer-helper';
    import { JabraType, ClassEntry, JabraEventsList, DeviceEventsList } from '@gnaudio/jabra-node-sdk';

    createApiClient(window.electron.ipcRenderer).then((client) => {    
        client.on('attach', (device) => {
            // TODO: Add code here to call into provided DeviceType proxy. 
        });

        client.on('detach', (device) => {
        // TODO: Add code here if needed.
        });
    }).catch( (err) => {
        console.error("Could not initialize Jabra Api client : " + err);
    });
    ```


6. Use typescript along with browserify, webpack or other build tool to produce a javascript bundle for the renderer.

# Complete example and details.

Refer to the [demoapp](../demoapp/README.md) for a complete example of how to use this package.
