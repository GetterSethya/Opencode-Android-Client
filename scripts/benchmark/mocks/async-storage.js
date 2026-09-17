const store = new Map();

const AsyncStorage = {
  getItem: (key) => Promise.resolve(store.get(key) ?? null),
  setItem: (key, val) => {
    store.set(key, val);
    return Promise.resolve();
  },
  removeItem: (key) => {
    store.delete(key);
    return Promise.resolve();
  },
  clear: () => {
    store.clear();
    return Promise.resolve();
  },
  getAllKeys: () => Promise.resolve(Array.from(store.keys())),
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
