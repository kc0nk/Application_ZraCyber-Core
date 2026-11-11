async function checkPrivilege(user) {
  return { isRoot: user === "root", sudoAccess: true };
}
module.exports = { checkPrivilege };
