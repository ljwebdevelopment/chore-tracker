import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Coins,
  Home,
  ListChecks,
  Plus,
  Settings,
  UserRound,
  WalletCards,
} from "lucide-react";
import { getDayId, getWeekId, formatDateTime, formatMoney } from "./dateUtils";
import { CHILDREN, FAMILY_USERS, childName } from "./family";
import { isFirebaseConfigured } from "./firebase";
import {
  completeChore,
  deleteChore,
  recordPayout,
  saveChore,
  seedFamilyUsers,
  subscribeChores,
  subscribeCompletions,
  subscribePayouts,
  subscribeTransactions,
  subscribeUsers,
} from "./store";
import type {
  AppUser,
  BalanceSummary,
  ChildId,
  Chore,
  ChoreFormValues,
  CompletionMethod,
  ChoreType,
  Completion,
  MoneyTransaction,
  Payout,
  UserId,
} from "./types";
import "./index.css";

const ACCOUNT_KEY = "family-chore-account";

const blankChore: ChoreFormValues = {
  title: "",
  description: "",
  amount: 1,
  type: "daily",
  assignedTo: "both",
  active: true,
  bonusRepeats: true,
};

const CHORE_TYPE_ORDER: Record<ChoreType, number> = {
  daily: 0,
  weekly: 1,
  bonus: 2,
};

interface AppData {
  users: AppUser[];
  chores: Chore[];
  completions: Completion[];
  payouts: Payout[];
  transactions: MoneyTransaction[];
}

function useLiveData() {
  const [data, setData] = useState<AppData>({
    users: FAMILY_USERS,
    chores: [],
    completions: [],
    payouts: [],
    transactions: [],
  });
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState(
    isFirebaseConfigured ? "" : "Add Firebase values to .env.local to connect shared family data.",
  );

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return;
    }

    let ready = 0;
    const markReady = () => {
      ready += 1;
      if (ready >= 5) setLoading(false);
    };
    const fail = (err: Error) => {
      setError(err.message);
      setLoading(false);
    };

    seedFamilyUsers().catch(fail);
    const unsubscribers = [
      subscribeUsers((users) => {
        setData((current) => ({ ...current, users: users.length ? users : FAMILY_USERS }));
        markReady();
      }, fail),
      subscribeChores((chores) => {
        setData((current) => ({ ...current, chores }));
        markReady();
      }, fail),
      subscribeCompletions((completions) => {
        setData((current) => ({ ...current, completions }));
        markReady();
      }, fail),
      subscribePayouts((payouts) => {
        setData((current) => ({ ...current, payouts }));
        markReady();
      }, fail),
      subscribeTransactions((transactions) => {
        setData((current) => ({ ...current, transactions }));
        markReady();
      }, fail),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  return { data, loading, error };
}

function useAccount() {
  const [accountId, setAccountId] = useState<UserId | null>(() => {
    return (localStorage.getItem(ACCOUNT_KEY) as UserId | null) ?? null;
  });

  const chooseAccount = (id: UserId | null) => {
    if (id) localStorage.setItem(ACCOUNT_KEY, id);
    else localStorage.removeItem(ACCOUNT_KEY);
    setAccountId(id);
  };

  return { accountId, chooseAccount };
}

function assignedToChild(chore: Chore, childId: ChildId) {
  return chore.assignedTo === "both" || chore.assignedTo === childId;
}

function isChoreAvailable(chore: Chore, childId: ChildId, completions: Completion[]) {
  if (!chore.active || !assignedToChild(chore, childId)) return false;
  if (chore.type === "bonus" && chore.disabledFor?.includes(childId)) return false;
  if (chore.type === "bonus") {
    return !completions.some((item) => item.choreId === chore.id);
  }
  if (chore.type === "daily") {
    return !completions.some((item) => item.choreId === chore.id && item.dayId === getDayId());
  }
  if (chore.type === "weekly") {
    return !completions.some((item) => item.choreId === chore.id && item.weekId === getWeekId());
  }
  return true;
}

function sortChoresByType(chores: Chore[]) {
  return [...chores].sort((a, b) => {
    const typeSort = CHORE_TYPE_ORDER[a.type] - CHORE_TYPE_ORDER[b.type];
    if (typeSort !== 0) return typeSort;
    return a.title.localeCompare(b.title);
  });
}

function balancesFrom(transactions: MoneyTransaction[]): Record<ChildId, BalanceSummary> {
  const currentWeek = getWeekId();
  return CHILDREN.reduce(
    (result, child) => {
      const childTransactions = transactions.filter((item) => item.childId === child.id);
      const totalEarned = childTransactions
        .filter((item) => item.amount > 0)
        .reduce((sum, item) => sum + item.amount, 0);
      const totalPaidOut = Math.abs(
        childTransactions.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0),
      );
      const weekly = childTransactions.filter((item) => item.weekId === currentWeek);
      const earnedThisWeek = weekly.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
      const paidOutThisWeek = Math.abs(
        weekly.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0),
      );

      result[child.id] = {
        childId: child.id,
        currentBalance: childTransactions.reduce((sum, item) => sum + item.amount, 0),
        totalEarned,
        totalPaidOut,
        earnedThisWeek,
        paidOutThisWeek,
        weeklyNet: earnedThisWeek - paidOutThisWeek,
      };
      return result;
    },
    {} as Record<ChildId, BalanceSummary>,
  );
}

function App() {
  const { accountId, chooseAccount } = useAccount();
  const live = useLiveData();
  const balances = useMemo(() => balancesFrom(live.data.transactions), [live.data.transactions]);

  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<AccountPicker chooseAccount={chooseAccount} />} />
        <Route
          path="/app/*"
          element={
            accountId ? (
              <Shell
                accountId={accountId}
                chooseAccount={chooseAccount}
                data={live.data}
                balances={balances}
                loading={live.loading}
                error={live.error}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function AccountPicker({ chooseAccount }: { chooseAccount: (id: UserId) => void }) {
  const navigate = useNavigate();

  function pick(id: UserId) {
    chooseAccount(id);
    navigate("/app");
  }

  return (
    <main className="picker-page">
      <section className="picker-panel">
        <p className="eyebrow">Family chore money</p>
        <h1>Who is using the app?</h1>
        <div className="account-grid">
          {FAMILY_USERS.map((user) => (
            <button className={`account-card ${user.role}`} key={user.id} onClick={() => pick(user.id)}>
              <UserRound aria-hidden />
              <span>{user.name}</span>
              <small>{user.role === "admin" ? "Mom / Admin" : "Dashboard"}</small>
            </button>
          ))}
        </div>
        <p className="quiet">Private family picker. PINs or Firebase Auth can be added later.</p>
      </section>
    </main>
  );
}

function Shell({
  accountId,
  chooseAccount,
  data,
  balances,
  loading,
  error,
}: {
  accountId: UserId;
  chooseAccount: (id: UserId | null) => void;
  data: AppData;
  balances: Record<ChildId, BalanceSummary>;
  loading: boolean;
  error: string;
}) {
  const account = FAMILY_USERS.find((user) => user.id === accountId) ?? FAMILY_USERS[0];
  const isEmily = account.id === "emily";

  return (
    <>
      <header className="topbar">
        <Link to="/app" className="topbar-title">
          <WalletCards aria-hidden />
          <span>Chores</span>
        </Link>
        <div className="topbar-actions">
          <span>{account.name}</span>
          <button className="ghost-button" onClick={() => chooseAccount(null)}>
            Switch
          </button>
        </div>
      </header>

      <div className="layout">
        <nav className="side-nav" aria-label="Main navigation">
          <NavLink to="/app" end>
            <Home aria-hidden /> Home
          </NavLink>
          {isEmily && (
            <>
              <NavLink to="/app/chores">
                <ClipboardList aria-hidden /> Chores
              </NavLink>
              <NavLink to="/app/payout">
                <Coins aria-hidden /> Payout
              </NavLink>
              <NavLink to="/app/stats">
                <BarChart3 aria-hidden /> Stats
              </NavLink>
            </>
          )}
          <NavLink to="/app/history">
            <CalendarDays aria-hidden /> History
          </NavLink>
          <NavLink to="/app/archive">
            <ListChecks aria-hidden /> Archive
          </NavLink>
          <NavLink to="/app/settings">
            <Settings aria-hidden /> Settings
          </NavLink>
        </nav>

        <main className="content">
          {loading && <Banner tone="info">Loading shared family data...</Banner>}
          {error && <Banner tone="warning">{error}</Banner>}
          <Routes>
            <Route
              path="/"
              element={
                isEmily ? (
                  <EmilyDashboard data={data} balances={balances} />
                ) : (
                  <ChildDashboard childId={account.id as ChildId} data={data} balance={balances[account.id as ChildId]} />
                )
              }
            />
            <Route path="/chores" element={isEmily ? <ChoreManager chores={data.chores} /> : <Navigate to="/app" />} />
            <Route path="/child/:childId" element={isEmily ? <ChildDetail data={data} balances={balances} /> : <Navigate to="/app" />} />
            <Route path="/payout" element={isEmily ? <PayoutForm /> : <Navigate to="/app" />} />
            <Route path="/stats" element={isEmily ? <StatsDashboard data={data} balances={balances} /> : <Navigate to="/app" />} />
            <Route path="/history" element={<WeeklyHistory data={data} balances={balances} accountId={account.id} />} />
            <Route path="/archive" element={<Archive data={data} />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </>
  );
}

function Banner({ children, tone }: { children: string; tone: "info" | "warning" }) {
  return <div className={`banner ${tone}`}>{children}</div>;
}

function EmilyDashboard({ data, balances }: { data: AppData; balances: Record<ChildId, BalanceSummary> }) {
  const currentWeek = getWeekId();
  const recent = data.transactions.slice(0, 8);

  return (
    <section className="page-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Emily dashboard</p>
          <h1>Family balances</h1>
        </div>
        <Link className="primary-button" to="/app/chores">
          <Plus aria-hidden /> Add chore
        </Link>
      </div>

      <div className="child-balance-grid">
        {CHILDREN.map((child) => (
          <Link className="balance-card admin" to={`/app/child/${child.id}`} key={child.id}>
            <span>{child.name}</span>
            <strong>{formatMoney(balances[child.id]?.currentBalance ?? 0)}</strong>
            <small>
              {formatMoney(balances[child.id]?.earnedThisWeek ?? 0)} earned this week /{" "}
              {formatMoney(balances[child.id]?.paidOutThisWeek ?? 0)} paid
            </small>
          </Link>
        ))}
      </div>

      <div className="two-column">
        <Panel title="This week">
          {CHILDREN.map((child) => (
            <MetricRow
              key={child.id}
              label={child.name}
              value={`${data.completions.filter((item) => item.childId === child.id && item.weekId === currentWeek).length} chores`}
              detail={`${formatMoney(balances[child.id]?.weeklyNet ?? 0)} net`}
            />
          ))}
        </Panel>
        <Panel title="Activity feed">
          <ActivityList transactions={recent} emptyText="No chore or payout activity yet." />
        </Panel>
      </div>
    </section>
  );
}

function ChildDashboard({
  childId,
  data,
  balance,
}: {
  childId: ChildId;
  data: AppData;
  balance: BalanceSummary;
}) {
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const chores = data.chores.filter((chore) => assignedToChild(chore, childId) && chore.active);
  const available = sortChoresByType(chores.filter((chore) => isChoreAvailable(chore, childId, data.completions)));
  const remainingByType = (type: ChoreType) => available.filter((chore) => chore.type === type);
  const completedThisWeek = data.completions.filter((item) => item.childId === childId && item.weekId === getWeekId());

  async function markComplete(chore: Chore, completionMethod: CompletionMethod) {
    setBusyId(`${chore.id}-${completionMethod}`);
    setMessage("");
    try {
      await completeChore(chore, childId, completionMethod);
      setMessage(
        completionMethod === "together"
          ? `${chore.title} split between Luke and Jaren.`
          : `${chore.title} added to ${childName(childId)}'s balance.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not complete chore.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="page-stack">
      <BalanceHero childId={childId} balance={balance} />
      {message && <Banner tone="info">{message}</Banner>}

      <div className="type-tabs">
        <StatusPill label="Daily" value={remainingByType("daily").length} tone="daily" />
        <StatusPill label="Weekly" value={remainingByType("weekly").length} tone="weekly" />
        <StatusPill label="Bonus" value={remainingByType("bonus").length} tone="bonus" />
      </div>

      {(["daily", "weekly", "bonus"] as ChoreType[]).map((type) => {
        const choresByType = remainingByType(type);
        return (
          <ChoreSection title={`${type[0].toUpperCase()}${type.slice(1)} chores`} key={type}>
            {choresByType.length === 0 ? (
              <EmptyState text={`No ${type} chores left right now.`} />
            ) : (
              choresByType.map((chore) => (
                <ChoreCard key={chore.id} chore={chore}>
                  <div className="complete-actions">
                    <button
                      className="primary-button"
                      disabled={busyId.startsWith(chore.id)}
                      onClick={() => markComplete(chore, "individual")}
                    >
                      <CheckCircle2 aria-hidden /> {busyId === `${chore.id}-individual` ? "Saving..." : "Completed"}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={busyId.startsWith(chore.id)}
                      onClick={() => markComplete(chore, "together")}
                    >
                      <CheckCircle2 aria-hidden /> {busyId === `${chore.id}-together` ? "Saving..." : "Completed Together"}
                    </button>
                  </div>
                </ChoreCard>
              ))
            )}
          </ChoreSection>
        );
      })}

      <Panel title="Completed this week">
        <CompletionList items={completedThisWeek} />
      </Panel>
    </section>
  );
}

function BalanceHero({ childId, balance }: { childId: ChildId; balance: BalanceSummary }) {
  return (
    <section className="balance-hero">
      <p>{childName(childId)}'s balance</p>
      <strong>{formatMoney(balance?.currentBalance ?? 0)}</strong>
      <div className="money-grid">
        <span>
          <small>Earned this week</small>
          {formatMoney(balance?.earnedThisWeek ?? 0)}
        </span>
        <span>
          <small>Paid out this week</small>
          {formatMoney(balance?.paidOutThisWeek ?? 0)}
        </span>
        <span>
          <small>Remaining unpaid</small>
          {formatMoney(balance?.currentBalance ?? 0)}
        </span>
      </div>
    </section>
  );
}

function ChoreManager({ chores }: { chores: Chore[] }) {
  const [editing, setEditing] = useState<Chore | null>(null);

  return (
    <section className="page-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Chore manager</h1>
        </div>
      </div>
      <ChoreForm key={editing?.id ?? "new"} editing={editing} onDone={() => setEditing(null)} />
      <ChoreSection title="All chores">
        {chores.length === 0 ? (
          <EmptyState text="Create the first chore to get started." />
        ) : (
          sortChoresByType(chores).map((chore) => (
            <ChoreCard key={chore.id} chore={chore}>
              <div className="button-row">
                <button className="secondary-button" onClick={() => setEditing(chore)}>
                  Edit
                </button>
                <button className="danger-button" onClick={() => deleteChore(chore.id)}>
                  Delete
                </button>
              </div>
            </ChoreCard>
          ))
        )}
      </ChoreSection>
    </section>
  );
}

function ChoreForm({ editing, onDone }: { editing: Chore | null; onDone: () => void }) {
  const [values, setValues] = useState<ChoreFormValues>(() =>
    editing
      ? {
          title: editing.title,
          description: editing.description,
          amount: editing.amount,
          type: editing.type,
          assignedTo: editing.assignedTo,
          active: editing.active,
          bonusRepeats: editing.bonusRepeats,
        }
      : blankChore,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await saveChore(values, editing?.id);
      setValues(blankChore);
      onDone();
      setMessage(editing ? "Chore updated." : "Chore created.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save chore.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-panel" onSubmit={submit}>
      <h2>{editing ? "Edit chore" : "Create chore"}</h2>
      {message && <p className="form-message">{message}</p>}
      <label>
        Title
        <input value={values.title} required onChange={(event) => setValues({ ...values, title: event.target.value })} />
      </label>
      <label>
        Description
        <textarea value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} />
      </label>
      <div className="form-grid">
        <label>
          Amount
          <input
            type="number"
            min="0"
            step="0.25"
            value={values.amount}
            required
            onChange={(event) => setValues({ ...values, amount: Number(event.target.value) })}
          />
        </label>
        <label>
          Type
          <select value={values.type} onChange={(event) => setValues({ ...values, type: event.target.value as ChoreType })}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="bonus">Bonus</option>
          </select>
        </label>
        <label>
          Assigned to
          <select value={values.assignedTo} onChange={(event) => setValues({ ...values, assignedTo: event.target.value as ChoreFormValues["assignedTo"] })}>
            <option value="both">Luke and Jaren</option>
            <option value="luke">Luke</option>
            <option value="jaren">Jaren</option>
          </select>
        </label>
      </div>
      <div className="toggle-row">
        <label>
          <input type="checkbox" checked={values.active} onChange={(event) => setValues({ ...values, active: event.target.checked })} />
          Active
        </label>
      </div>
      <div className="button-row">
        <button className="primary-button" disabled={saving}>
          {saving ? "Saving..." : editing ? "Save changes" : "Create chore"}
        </button>
        {editing && (
          <button type="button" className="secondary-button" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function ChildDetail({ data, balances }: { data: AppData; balances: Record<ChildId, BalanceSummary> }) {
  const params = useParams();
  const childId = params.childId as ChildId;
  if (!CHILDREN.some((child) => child.id === childId)) return <Navigate to="/app" />;

  const weekCompletions = data.completions.filter((item) => item.childId === childId && item.weekId === getWeekId());
  const weekPayouts = data.payouts.filter((item) => item.childId === childId && item.weekId === getWeekId());

  return (
    <section className="page-stack">
      <BalanceHero childId={childId} balance={balances[childId]} />
      <div className="two-column">
        <Panel title="Current week chores">
          <CompletionList items={weekCompletions} />
        </Panel>
        <Panel title="Payout history">
          <PayoutList payouts={weekPayouts} />
        </Panel>
      </div>
      <Link className="primary-button fit" to="/app/payout">
        <Coins aria-hidden /> Record payout
      </Link>
    </section>
  );
}

function PayoutForm() {
  const [childId, setChildId] = useState<ChildId>("luke");
  const [amount, setAmount] = useState(5);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await recordPayout(childId, amount, note);
      setNote("");
      setMessage(`Recorded ${formatMoney(amount)} payout for ${childName(childId)}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not record payout.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-stack narrow">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Emily</p>
          <h1>Record payout</h1>
        </div>
      </div>
      <form className="form-panel" onSubmit={submit}>
        {message && <p className="form-message">{message}</p>}
        <label>
          Child
          <select value={childId} onChange={(event) => setChildId(event.target.value as ChildId)}>
            <option value="luke">Luke</option>
            <option value="jaren">Jaren</option>
          </select>
        </label>
        <label>
          Amount
          <input type="number" min="0.01" step="0.25" value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
        </label>
        <label>
          Note
          <textarea value={note} placeholder="Cash, allowance, special payout..." onChange={(event) => setNote(event.target.value)} />
        </label>
        <button className="primary-button" disabled={saving}>
          <ArrowDownCircle aria-hidden /> {saving ? "Saving..." : "Record payout"}
        </button>
      </form>
    </section>
  );
}

function StatsDashboard({ data, balances }: { data: AppData; balances: Record<ChildId, BalanceSummary> }) {
  const currentWeek = getWeekId();
  const currentDay = getDayId();
  const weeklyCompletions = data.completions.filter((item) => item.weekId === currentWeek);
  const activeDaily = data.chores.filter((chore) => chore.active && chore.type === "daily");
  const activeWeekly = data.chores.filter((chore) => chore.active && chore.type === "weekly");
  const totalDailySlots = activeDaily.length;
  const totalWeeklySlots = activeWeekly.length;
  const completedDailyToday = data.completions.filter((item) => item.dayId === currentDay && item.choreType === "daily").length;
  const completedWeekly = weeklyCompletions.filter((item) => item.choreType === "weekly").length;
  const uniqueCompletions = uniqueCompletionGroups(data.completions);
  const mostCompleted = topByCount(uniqueCompletions.map((item) => item.choreTitle));
  const highestEarning = [...uniqueCompletions].sort((a, b) => b.totalAmount - a.totalAmount)[0]?.choreTitle ?? "None yet";

  return (
    <section className="page-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Emily stats</p>
          <h1>Weekly summary</h1>
        </div>
      </div>
      <div className="stat-grid">
        {CHILDREN.map((child) => (
          <StatCard key={child.id} label={`${child.name} balance`} value={formatMoney(balances[child.id]?.currentBalance ?? 0)} />
        ))}
        <StatCard label="Daily completion" value={percent(completedDailyToday, totalDailySlots)} />
        <StatCard label="Weekly completion" value={percent(completedWeekly, totalWeeklySlots)} />
        <StatCard label="Most completed chore" value={mostCompleted} />
        <StatCard label="Highest earning chore" value={highestEarning} />
      </div>
      <div className="two-column">
        <Panel title="Side-by-side">
          {CHILDREN.map((child) => (
            <MetricRow
              key={child.id}
              label={child.name}
              value={`${formatMoney(balances[child.id]?.earnedThisWeek ?? 0)} earned`}
              detail={`${data.completions.filter((item) => item.childId === child.id && item.weekId === currentWeek).length} completed`}
            />
          ))}
        </Panel>
        <Panel title="Remaining chores">
          {CHILDREN.map((child) => (
            <MetricRow
              key={child.id}
              label={child.name}
              value={`${data.chores.filter((chore) => isChoreAvailable(chore, child.id, data.completions)).length} remaining`}
              detail={`${activeDaily.filter((chore) => isChoreAvailable(chore, child.id, data.completions)).length} daily left`}
            />
          ))}
        </Panel>
      </div>
      <Panel title="Payout history">
        <PayoutList payouts={data.payouts.slice(0, 8)} />
      </Panel>
    </section>
  );
}

function WeeklyHistory({
  data,
  balances,
  accountId,
}: {
  data: AppData;
  balances: Record<ChildId, BalanceSummary>;
  accountId: UserId;
}) {
  const visibleChildren = accountId === "emily" ? CHILDREN : CHILDREN.filter((child) => child.id === accountId);
  const currentWeek = getWeekId();

  return (
    <section className="page-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Current week</p>
          <h1>Weekly history</h1>
        </div>
      </div>
      {visibleChildren.map((child) => {
        const completions = data.completions.filter((item) => item.childId === child.id && item.weekId === currentWeek);
        const payouts = data.payouts.filter((item) => item.childId === child.id && item.weekId === currentWeek);
        return (
          <Panel title={`${child.name} - ${formatMoney(balances[child.id]?.weeklyNet ?? 0)} net`} key={child.id}>
            <CompletionList items={completions} />
            <div className="mini-divider" />
            <PayoutList payouts={payouts} />
          </Panel>
        );
      })}
    </section>
  );
}

function Archive({ data }: { data: AppData }) {
  const weeks = Array.from(new Set(data.transactions.map((item) => item.weekId))).filter(Boolean);
  return (
    <section className="page-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Past weeks</p>
          <h1>Archive</h1>
        </div>
      </div>
      {weeks.length === 0 ? (
        <EmptyState text="Past weeks will appear after chore activity is recorded." />
      ) : (
        weeks.map((week) => (
          <Panel title={week} key={week}>
            <ActivityList transactions={data.transactions.filter((item) => item.weekId === week)} emptyText="No activity." />
          </Panel>
        ))
      )}
    </section>
  );
}

function SettingsPage() {
  return (
    <section className="page-stack narrow">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Family app setup</h1>
        </div>
      </div>
      <Panel title="Data and resets">
        <MetricRow label="Storage" value="Firebase Firestore" detail="Shared live data across devices" />
        <MetricRow label="Daily reset" value="Every new day" detail="America/Chicago" />
        <MetricRow label="Weekly reset" value="Monday" detail="Weekly history is grouped by week id" />
        <MetricRow label="Access" value="Family picker" detail="Ready for PINs or real auth later" />
      </Panel>
    </section>
  );
}

function ChoreSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="chore-section">
      <h2>{title}</h2>
      <div className="card-list">{children}</div>
    </section>
  );
}

function ChoreCard({ chore, children }: { chore: Chore; children: React.ReactNode }) {
  return (
    <article className={`chore-card ${chore.type} ${chore.active ? "" : "inactive"}`}>
      <div>
        <div className="card-title-row">
          <h3>{chore.title}</h3>
          <strong>{formatMoney(chore.amount)}</strong>
        </div>
        {chore.description && <p>{chore.description}</p>}
        <div className="pill-row">
          <span className={`pill ${chore.type}`}>{chore.type}</span>
          <span className="pill muted">{chore.assignedTo === "both" ? "Luke + Jaren" : childName(chore.assignedTo)}</span>
          {!chore.active && <span className="pill muted">inactive</span>}
        </div>
      </div>
      {children}
    </article>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function CompletionList({ items }: { items: Completion[] }) {
  if (items.length === 0) return <EmptyState text="No completed chores yet." />;
  return (
    <div className="history-list">
      {items.map((item) => (
        <div className="history-item" key={item.id}>
          <ArrowUpCircle aria-hidden className="earned-icon" />
          <span>
            <strong>{item.choreTitle}</strong>
            <small>
              {item.choreType} / {item.completionMethod === "together" ? "Together" : "Individual"} /{" "}
              {formatDateTime(item.completedAt)}
            </small>
            <small>
              Total {formatMoney(item.totalAmount)} / Luke {formatMoney(item.lukeAmount)} / Jaren{" "}
              {formatMoney(item.jarenAmount)}
            </small>
          </span>
          <b>{formatMoney(item.amount)}</b>
        </div>
      ))}
    </div>
  );
}

function PayoutList({ payouts }: { payouts: Payout[] }) {
  if (payouts.length === 0) return <EmptyState text="No payouts recorded." />;
  return (
    <div className="history-list">
      {payouts.map((payout) => (
        <div className="history-item" key={payout.id}>
          <ArrowDownCircle aria-hidden className="paid-icon" />
          <span>
            <strong>{payout.childName}</strong>
            <small>
              {formatDateTime(payout.paidAt)}
              {payout.note ? ` / ${payout.note}` : ""}
            </small>
          </span>
          <b>-{formatMoney(payout.amount)}</b>
        </div>
      ))}
    </div>
  );
}

function ActivityList({ transactions, emptyText }: { transactions: MoneyTransaction[]; emptyText: string }) {
  if (transactions.length === 0) return <EmptyState text={emptyText} />;
  return (
    <div className="history-list">
      {transactions.map((item) => (
        <div className="history-item" key={item.id}>
          {item.amount >= 0 ? <ArrowUpCircle aria-hidden className="earned-icon" /> : <ArrowDownCircle aria-hidden className="paid-icon" />}
          <span>
            <strong>{item.childName}: {item.label}</strong>
            <small>
              {formatDateTime(item.createdAt)}
              {item.note ? ` / ${item.note}` : ""}
            </small>
          </span>
          <b>{formatMoney(item.amount)}</b>
        </div>
      ))}
    </div>
  );
}

function MetricRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric-row">
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <b>{value}</b>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="stat-card">
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: number; tone: ChoreType }) {
  return (
    <span className={`status-pill ${tone}`}>
      {label} <strong>{value}</strong>
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function topByCount(values: string[]) {
  if (!values.length) return "None yet";
  const counts = values.reduce(
    (result, value) => {
      result[value] = (result[value] ?? 0) + 1;
      return result;
    },
    {} as Record<string, number>,
  );
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function uniqueCompletionGroups(items: Completion[]) {
  return Array.from(new Map(items.map((item) => [item.groupId, item])).values());
}

function percent(done: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((done / total) * 100)}%`;
}

export default App;
