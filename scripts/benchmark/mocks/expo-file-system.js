module.exports = {
  documentDirectory: '/mock/docs/',
  cacheDirectory: '/mock/cache/',
  readAsStringAsync: () => Promise.resolve(''),
  writeAsStringAsync: () => Promise.resolve(),
  deleteAsync: () => Promise.resolve(),
  getInfoAsync: () => Promise.resolve({ exists: true, isDirectory: false, size: 1024 }),
  makeDirectoryAsync: () => Promise.resolve(),
  readDirectoryAsync: () => Promise.resolve([]),
  createDownloadResumable: () => ({
    downloadAsync: () => Promise.resolve({ uri: '', status: 200, headers: {}, md5: '' }),
  }),
};
