const Module = require('module');
const fs = require('fs');
const path = require('path');

function tryResolve(candidate) {
  const options = [
    candidate,
    `${candidate}.js`,
    `${candidate}.cjs`,
    `${candidate}.mjs`,
    path.join(candidate, 'index.js'),
    path.join(candidate, 'index.cjs'),
    path.join(candidate, 'index.mjs'),
  ];

  return options.find((item) => fs.existsSync(item)) || null;
}

function resolveModulePath(modulePath) {
  if (path.isAbsolute(modulePath)) {
    return modulePath;
  }

  const cwdCandidate = tryResolve(path.resolve(process.cwd(), modulePath));
  if (cwdCandidate) {
    return cwdCandidate;
  }

  const backendRoot = path.resolve(__dirname, '..', '..');
  const normalized = modulePath.replace(/^\.\//, '');
  const backendCandidate = tryResolve(path.resolve(backendRoot, normalized));
  if (backendCandidate) {
    return backendCandidate;
  }

  return modulePath;
}

function loadWithMocks(modulePath, mocks = {}) {
  const originalLoad = Module._load;
  const resolvedModulePath = resolveModulePath(modulePath);

  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const cacheKey = require.resolve(resolvedModulePath);
    delete require.cache[cacheKey];
    return require(resolvedModulePath);
  } finally {
    Module._load = originalLoad;
  }
}

module.exports = { loadWithMocks };
