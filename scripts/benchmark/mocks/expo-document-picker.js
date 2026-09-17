module.exports = {
  getDocumentAsync: () => Promise.resolve({ canceled: true, assets: [] }),
};
