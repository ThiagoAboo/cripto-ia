function sendJson(response, statusCode, payload) {
  response.status(statusCode).json(payload);
}

module.exports = {
  sendJson,
};
