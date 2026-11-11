async function connectSsh(target, credentials) {
  return { connected: true, session: "active_ssh_session" };
}
module.exports = { connectSsh };
