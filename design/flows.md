# SmartLab Monitor — User Flows

## Student Flow

1. Computer Portal (auto-detect computer ID & connectivity)
2. Student fills `Record Computer Usage` form (Name, Register No, Department, Year, Start, End)
3. Client validates fields and checks local time overlap via API call
4. If conflict: show `Computer Unavailable` message with option to edit times
5. If OK: submit → show `Usage Record Submitted` success screen with summary
6. Option: `NEW ENTRY` or `BACK TO HOME`

Notes: student does not maintain an active session; record saved on submit.

## Admin Flow

1. Admin signs in (Login screen)
2. Arrives at Dashboard (KPIs, computer grid overview)
3. Click a computer → open Computer Details (status, last seen, usage history)
4. Open Usage Records → search/filter/view/edit/delete records
5. Open Students → manage student profiles and view history
6. Generate Reports or export data
7. Open Analytics for charts & insights

## Time-overlap check (server-side)

- When creating a record, server must reject if any existing record for the same computer has: newStart < existingEnd AND existingStart < newEnd
- Allow if newStart == existingEnd or newEnd == existingStart
