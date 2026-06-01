import type { AppUser, ChildId } from "./types";

export const FAMILY_USERS: AppUser[] = [
  { id: "emily", name: "Emily", role: "admin" },
  { id: "luke", name: "Luke", role: "child" },
  { id: "jaren", name: "Jaren", role: "child" },
];

export const CHILDREN = FAMILY_USERS.filter((user) => user.role === "child") as Array<
  AppUser & { id: ChildId }
>;

export function childName(childId: ChildId) {
  return CHILDREN.find((child) => child.id === childId)?.name ?? childId;
}
