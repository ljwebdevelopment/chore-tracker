import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { childName, FAMILY_USERS } from "./family";
import { getDayId, getWeekId } from "./dateUtils";
import type {
  AppUser,
  Assignment,
  ChildId,
  Chore,
  ChoreFormValues,
  CompletionMethod,
  Completion,
  MoneyTransaction,
  Payout,
} from "./types";

function requireDb() {
  if (!db) {
    throw new Error("Firebase is not configured. Add .env.local values before using live data.");
  }
  return db;
}

function toDate(value: unknown): Date {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  return new Date();
}

function readChore(snapshot: QueryDocumentSnapshot<DocumentData>): Chore {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    title: data.title ?? "",
    description: data.description ?? "",
    amount: Number(data.amount ?? 0),
    type: data.type ?? "daily",
    assignedTo: data.assignedTo ?? "both",
    active: Boolean(data.active),
    bonusRepeats: Boolean(data.bonusRepeats),
    disabledFor: data.disabledFor ?? [],
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function readCompletion(snapshot: QueryDocumentSnapshot<DocumentData>): Completion {
  const data = snapshot.data();
  const amount = Number(data.amount ?? 0);
  const totalAmount = Number(data.totalAmount ?? data.amount ?? 0);
  return {
    id: snapshot.id,
    groupId: data.groupId ?? snapshot.id,
    choreId: data.choreId,
    childId: data.childId,
    childName: data.childName,
    choreTitle: data.choreTitle,
    choreType: data.choreType,
    amount,
    completionMethod: data.completionMethod ?? "individual",
    totalAmount,
    lukeAmount: Number(data.lukeAmount ?? (data.childId === "luke" ? amount : 0)),
    jarenAmount: Number(data.jarenAmount ?? (data.childId === "jaren" ? amount : 0)),
    completedAt: toDate(data.completedAt),
    weekId: data.weekId,
    dayId: data.dayId,
  };
}

function readPayout(snapshot: QueryDocumentSnapshot<DocumentData>): Payout {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    childId: data.childId,
    childName: data.childName,
    amount: Number(data.amount ?? 0),
    note: data.note ?? "",
    paidAt: toDate(data.paidAt),
    weekId: data.weekId,
  };
}

function readTransaction(snapshot: QueryDocumentSnapshot<DocumentData>): MoneyTransaction {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    childId: data.childId,
    childName: data.childName,
    type: data.type,
    amount: Number(data.amount ?? 0),
    label: data.label,
    note: data.note ?? "",
    sourceId: data.sourceId,
    createdAt: toDate(data.createdAt),
    weekId: data.weekId,
  };
}

export async function seedFamilyUsers() {
  const database = requireDb();
  await Promise.all(
    FAMILY_USERS.map(async (user) => {
      const ref = doc(database, "users", user.id);
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) {
        await setDoc(ref, user);
      }
    }),
  );
}

export function subscribeUsers(callback: (users: AppUser[]) => void, onError: (error: Error) => void) {
  return onSnapshot(
    collection(requireDb(), "users"),
    (snapshot) => callback(snapshot.docs.map((userDoc) => userDoc.data() as AppUser)),
    onError,
  );
}

export function subscribeChores(callback: (chores: Chore[]) => void, onError: (error: Error) => void) {
  return onSnapshot(
    query(collection(requireDb(), "chores"), orderBy("createdAt", "desc")),
    (snapshot) => callback(snapshot.docs.map(readChore)),
    onError,
  );
}

export function subscribeCompletions(callback: (items: Completion[]) => void, onError: (error: Error) => void) {
  return onSnapshot(
    query(collection(requireDb(), "completions"), orderBy("completedAt", "desc")),
    (snapshot) => callback(snapshot.docs.map(readCompletion)),
    onError,
  );
}

export function subscribePayouts(callback: (items: Payout[]) => void, onError: (error: Error) => void) {
  return onSnapshot(
    query(collection(requireDb(), "payouts"), orderBy("paidAt", "desc")),
    (snapshot) => callback(snapshot.docs.map(readPayout)),
    onError,
  );
}

export function subscribeTransactions(
  callback: (items: MoneyTransaction[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(requireDb(), "transactions"), orderBy("createdAt", "desc")),
    (snapshot) => callback(snapshot.docs.map(readTransaction)),
    onError,
  );
}

export async function saveChore(values: ChoreFormValues, choreId?: string) {
  const database = requireDb();
  const now = serverTimestamp();
  const payload = {
    ...values,
    amount: Number(values.amount),
    updatedAt: now,
  };

  if (choreId) {
    await updateDoc(doc(database, "chores", choreId), payload);
    return choreId;
  }

  const ref = await addDoc(collection(database, "chores"), {
    ...payload,
    disabledFor: [],
    createdAt: now,
  });
  return ref.id;
}

export async function deleteChore(choreId: string) {
  await deleteDoc(doc(requireDb(), "chores", choreId));
}

function completionLockId(chore: Chore, dayId: string, weekId: string) {
  if (chore.type === "daily") return `${chore.id}_${dayId}`;
  if (chore.type === "weekly") return `${chore.id}_${weekId}`;
  return `${chore.id}_bonus`;
}

export async function completeChore(chore: Chore, childId: ChildId, completionMethod: CompletionMethod) {
  const database = requireDb();
  const name = childName(childId);
  const weekId = getWeekId();
  const dayId = getDayId();
  const groupId = doc(collection(database, "completions")).id;
  const lockId = completionLockId(chore, dayId, weekId);

  const completionQuery = query(
    collection(database, "completions"),
    where("choreId", "==", chore.id),
    ...(chore.type === "daily"
      ? [where("dayId", "==", dayId)]
      : chore.type === "weekly"
        ? [where("weekId", "==", weekId)]
        : []),
  );
  const existing = await getDocs(completionQuery);
  if (!existing.empty) {
    const resetWindow = chore.type === "daily" ? "day" : chore.type === "weekly" ? "week" : "round";
    throw new Error(`${chore.title} is already complete for this ${resetWindow}.`);
  }

  await runTransaction(database, async (transaction) => {
    const choreRef = doc(database, "chores", chore.id);
    const lockRef = doc(database, "completionLocks", lockId);
    const choreSnapshot = await transaction.get(choreRef);
    if (!choreSnapshot.exists()) throw new Error("This chore no longer exists.");
    const lockSnapshot = await transaction.get(lockRef);
    if (lockSnapshot.exists()) {
      const resetWindow = chore.type === "daily" ? "day" : chore.type === "weekly" ? "week" : "round";
      throw new Error(`${chore.title} is already complete for this ${resetWindow}.`);
    }

    const totalAmount = Number(chore.amount);
    const lukeAmount = completionMethod === "together" ? totalAmount / 2 : childId === "luke" ? totalAmount : 0;
    const jarenAmount = completionMethod === "together" ? totalAmount / 2 : childId === "jaren" ? totalAmount : 0;
    const earners: Array<{ childId: ChildId; childName: string; amount: number }> =
      completionMethod === "together"
        ? [
            { childId: "luke", childName: childName("luke"), amount: lukeAmount },
            { childId: "jaren", childName: childName("jaren"), amount: jarenAmount },
          ]
        : [{ childId, childName: name, amount: totalAmount }];

    transaction.set(lockRef, {
      choreId: chore.id,
      choreTitle: chore.title,
      choreType: chore.type,
      completionMethod,
      completedBy: childId,
      dayId,
      weekId,
      createdAt: serverTimestamp(),
    });

    earners.forEach((earner) => {
      const completionRef = doc(collection(database, "completions"));
      transaction.set(completionRef, {
        groupId,
        choreId: chore.id,
        childId: earner.childId,
        childName: earner.childName,
        choreTitle: chore.title,
        choreType: chore.type,
        amount: earner.amount,
        completionMethod,
        totalAmount,
        lukeAmount,
        jarenAmount,
        completedAt: serverTimestamp(),
        weekId,
        dayId,
      });

      const transactionRef = doc(collection(database, "transactions"));
      transaction.set(transactionRef, {
        childId: earner.childId,
        childName: earner.childName,
        type: "chore",
        amount: earner.amount,
        label: chore.title,
        note: completionMethod === "together" ? "Completed together" : "Completed individually",
        sourceId: completionRef.id,
        createdAt: serverTimestamp(),
        weekId,
      });
    });

    if (chore.type === "bonus") {
      const choreData = choreSnapshot.data() as { assignedTo?: Assignment; disabledFor?: ChildId[] };
      const assignedTo = choreData.assignedTo ?? chore.assignedTo;
      const assignedChildren = assignedTo === "both" ? (["luke", "jaren"] as ChildId[]) : [assignedTo];
      const disabledFor = Array.from(new Set([...(choreData.disabledFor ?? []), ...assignedChildren]));
      transaction.update(choreRef, { disabledFor, updatedAt: serverTimestamp() });
    }
  });
}

export async function recordPayout(childId: ChildId, amount: number, note: string) {
  const database = requireDb();
  const name = childName(childId);
  const weekId = getWeekId();

  await runTransaction(database, async (transaction) => {
    const payoutRef = doc(collection(database, "payouts"));
    transaction.set(payoutRef, {
      childId,
      childName: name,
      amount,
      note,
      paidAt: serverTimestamp(),
      weekId,
    });

    const transactionRef = doc(collection(database, "transactions"));
    transaction.set(transactionRef, {
      childId,
      childName: name,
      type: "payout",
      amount: -Math.abs(amount),
      label: "Money paid out",
      note,
      sourceId: payoutRef.id,
      createdAt: serverTimestamp(),
      weekId,
    });
  });
}
