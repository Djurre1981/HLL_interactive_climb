export function canModifyPin(pin, steamId, role) {
  if (role === "admin" || role === "owner") {
    return true;
  }
  if (role === "user") {
    return pin?.createdBy === steamId;
  }
  return false;
}
