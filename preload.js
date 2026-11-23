const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const dataDir = path.join(__dirname, 'data');

contextBridge.exposeInMainWorld('api', {
  loadCards: () => JSON.parse(fs.readFileSync(path.join(dataDir, 'cards.dm.json'), 'utf8')),
  imageUrl: id => pathToFileURL(path.join(dataDir, 'images', id + '.jpg')).href,
  quit: () => ipcRenderer.invoke('quit'),
  setFullscreen: on => ipcRenderer.invoke('fullscreen', !!on),
});
