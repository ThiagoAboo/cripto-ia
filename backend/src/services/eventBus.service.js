const clients = new Set();

function addClient(response) {
  clients.add(response);
}

function removeClient(response) {
  clients.delete(response);
}

function publish(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of clients) {
    try {
      client.write(payload);
    } catch (error) {
      clients.delete(client);
    }
  }
}

function publishStatusSnapshot(snapshot) {
  publish('status', snapshot);
}

module.exports = {
  addClient,
  removeClient,
  publish,
  publishStatusSnapshot,
};
