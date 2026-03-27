const Module = require('module');
const path = require('node:path');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

function resolveTargetPath(targetPath) {
  if (!targetPath) {
    throw new Error('targetPath is required');
  }

  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }

  if (targetPath.startsWith('./')) {
    return path.resolve(BACKEND_ROOT, targetPath.slice(2));
  }

  if (targetPath.startsWith('src/')) {
    return path.resolve(BACKEND_ROOT, targetPath);
  }

  return targetPath;
}

function loadWithMocks(targetPath, mocks = {}) {
  const originalLoad = Module._load;
  const resolvedTargetPath = resolveTargetPath(targetPath);

  Module._load = function patched(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve(resolvedTargetPath)];
    return require(resolvedTargetPath);
  } finally {
    Module._load = originalLoad;
  }
}

module.exports = { loadWithMocks, resolveTargetPath };
