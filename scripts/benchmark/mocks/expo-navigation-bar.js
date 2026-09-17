const NavigationBar = {
  setHidden: () => Promise.resolve(),
  setBackgroundColorAsync: () => Promise.resolve(),
  setButtonStyleAsync: () => Promise.resolve(),
};

function NavigationBarComponent() {
  return null;
}

module.exports = {
  NavigationBar: Object.assign(NavigationBarComponent, NavigationBar),
};
