// Processo principal provisório: será substituído pela implementação completa (janela, bandeja, IPC, motor).
import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#05070b',
    webPreferences: { preload: join(import.meta.dirname, '../preload/index.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
});
app.on('window-all-closed', () => app.quit());
