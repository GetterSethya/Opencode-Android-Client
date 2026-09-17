module.exports = {
  launchImageLibraryAsync: () => Promise.resolve({ canceled: true, assets: [] }),
  launchCameraAsync: () => Promise.resolve({ canceled: true, assets: [] }),
  MediaTypeOptions: {
    All: 'All',
    Images: 'Images',
    Videos: 'Videos',
  },
};
