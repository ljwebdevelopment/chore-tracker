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
  return {
    id: snapshot.id,
    choreId: data.choreId,
    childId: data.childId,
    childName: data.childName,
    choreTitle: data.choreTitle,
    choreType: data.choreType,
    amount: Number(data.amount ?? 0),
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

export async function completeChore(chore: Chore, childId: ChildId) {
  const database = requireDb();
  const name = childName(childId);
  const weekId = getWeekId();
  const dayId = getDayId();

  if (chore.type !== "bonus" || !chore.bonusRepeats) {
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
  }

  await runTransaction(database, async (transaction) => {
    const choreRef = doc(database, "chores", chore.id);
    const choreSnapshot = await transaction.get(choreRef);
    if (!choreSnapshot.exists()) throw new Error("This chore no longer exists.");

    const completionRef = doc(collection(database, "completions"));
    transaction.set(completionRef, {
      choreId: chore.id,
      childId,
      childName: name,
      choreTitle: chore.title,
      choreType: chore.type,
      amount: chore.amount,
      completedAt: serverTimestamp(),
      weekId,
      dayId,
    });

    const transactionRef = doc(collection(database, "transactions"));
    transaction.set(transactionRef, {
      childId,
      childName: name,
      type: "chore",
      amount: chore.amount,
      label: chore.title,
      sourceId: completionRef.id,
      createdAt: serverTimestamp(),
      weekId,
    });

    if (chore.type === "bonus" && !chore.bonusRepeats) {
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
