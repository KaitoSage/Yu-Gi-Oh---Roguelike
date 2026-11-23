const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 740,
    backgroundColor: '#0b0a14',
    title: 'Yu-Gi-Oh! Roguelike',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false, // preload'ın fs ile kart verisini okuyabilmesi için
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

ipcMain.handle('quit', () => app.quit());
ipcMain.handle('fullscreen', (_e, on) => { if (win) win.setFullScreen(on); return win ? win.isFullScreen() : false; });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
