# Private Family Chore Tracker

A private web app for Emily, Luke, and Jaren to track chores, weekly earnings, payouts, and unpaid balances.

## What Was Built

- Mobile-friendly account picker for Emily, Luke, and Jaren.
- Emily admin dashboard with family balances, activity, chore management, payouts, child detail views, stats, history, archive, and settings.
- Luke and Jaren dashboards with a large money balance, available daily/weekly/bonus chores, completed chore history, earned money, paid-out money, and remaining unpaid balance.
- Firebase Firestore persistence so the family can use the same live data from different phones or computers.

## Stack

- Vite
- React
- TypeScript
- React Router
- Firebase Firestore
- Lucide React icons

## Setup

1. Create a Firebase project at <https://console.firebase.google.com/>.
2. Create a Web App in that Firebase project.
3. Enable Firestore Database.
4. Copy `.env.example` to `.env.local`.
5. Fill in the Firebase web app values:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

6. For the first private family version, deploy the included `firestore.rules` or equivalent rules that allow your family app to read and write.

## Run Locally

```bash
npm install
npm run dev
```

Then open the local URL Vite prints, usually <http://localhost:5173/>.

## Build

```bash
npm run build
```

The production build is emitted to `dist/`.

## Data Storage

Data is stored in Firebase Firestore collections:

- `users`
- `chores`
- `completions`
- `payouts`
- `transactions`

The account picker is only saved locally in the browser so the app remembers who was selected. Chores, payouts, balances, completions, history, and stats all come from Firestore.

## Daily And Weekly Resets

- Daily chore availability is calculated from the current `dayId` in `America/Chicago`.
- Weekly chore availability is calculated from a Monday-start `weekId` in `America/Chicago`.
- Daily and weekly completion records are not deleted. They stay in history and archive views.
- Unpaid balances do not reset. They only change when a child completes a chore or Emily records a payout.

## Limitations

- Version 1 uses a family account picker, not secure authentication.
- The included Firestore rules are intentionally open for quick private setup and should be tightened before wider use.
- Stats are calculated in the browser from Firestore records, which is fine for a family app but not designed for large multi-family scale.
- There is no offline conflict handling beyond Firebase's normal client behavior.

## Recommended Next Improvements

- Add PINs or Firebase Auth for Emily, Luke, and Jaren.
- Add private production Firestore security rules based on authenticated users.
- Add Firebase Hosting for easy phone access.
- Add week-by-week archive filters.
- Add chore templates and recurring notes.
- Add optional notifications or reminders.
