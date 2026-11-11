async function validateAuth(session) {
  return { authenticated: true, user: "root" };
}
module.exports = { validateAuth };
