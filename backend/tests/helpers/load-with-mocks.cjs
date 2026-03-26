const Module = require('node:module');

function loadWithMocks(targetPath, mocks = {}) {
  const resolvedTarget = require.resolve(targetPath);
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[resolvedTarget];

  try {
    return require(resolvedTarget);
  } finally {
    Module._load = originalLoad;
  }
}

module.exports = {
  loadWithMocks,
};
