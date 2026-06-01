export type Role = "admin" | "child";
export type ChildId = "luke" | "jaren";
export type UserId = "emily" | ChildId;
export type ChoreType = "daily" | "weekly" | "bonus";
export type Assignment = ChildId | "both";
export type TransactionType = "chore" | "payout";
export type CompletionMethod = "individual" | "together";

export interface AppUser {
  id: UserId;
  name: string;
  role: Role;
}

export interface Chore {
  id: string;
  title: string;
  description: string;
  amount: number;
  type: ChoreType;
  assignedTo: Assignment;
  assignToBothSeparately: boolean;
  active: boolean;
  bonusRepeats: boolean;
  disabledFor?: ChildId[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Completion {
  id: string;
  groupId: string;
  choreId: string;
  childId: ChildId;
  childName: string;
  choreTitle: string;
  choreType: ChoreType;
  amount: number;
  completionMethod: CompletionMethod;
  totalAmount: number;
  lukeAmount: number;
  jarenAmount: number;
  completedAt: Date;
  weekId: string;
  dayId: string;
}

export interface Payout {
  id: string;
  childId: ChildId;
  childName: string;
  amount: number;
  note: string;
  paidAt: Date;
  weekId: string;
}

export interface MoneyTransaction {
  id: string;
  childId: ChildId;
  childName: string;
  type: TransactionType;
  amount: number;
  label: string;
  note?: string;
  sourceId: string;
  createdAt: Date;
  weekId: string;
}

export interface BalanceSummary {
  childId: ChildId;
  currentBalance: number;
  totalEarned: number;
  totalPaidOut: number;
  earnedThisWeek: number;
  paidOutThisWeek: number;
  weeklyNet: number;
}

export interface ChoreFormValues {
  title: string;
  description: string;
  amount: number;
  type: ChoreType;
  assignedTo: Assignment;
  assignToBothSeparately: boolean;
  active: boolean;
  bonusRepeats: boolean;
}
