const Module = require('module');
const path = require('path');

function loadWithMocks(modulePath, mocks = {}) {
  const originalLoad = Module._load;
  const resolvedPath = path.resolve(process.cwd(), modulePath);
  Module._load = function patched(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    delete require.cache[resolvedPath];
    return require(resolvedPath);
  } finally {
    Module._load = originalLoad;
  }
}

module.exports = { loadWithMocks };
