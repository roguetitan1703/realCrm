# Performance: what a day answers, and what a range answers

**For:** the owner or manager at a desk, reading the team *by agent*. Also the
agent's own "My work" on the phone.

The page reads one set of facts (`services/activityReport.ts`: a person
contacted, a call, its outcome, a status change, a visit, a follow-up). This
spec is about which **questions** those facts answer, which depends on the
period.

## 1. Two lenses, two jobs

| | **A day** | **A range** (7 days, 30 days, custom) |
|---|---|---|
| The question | What happened today, and what is stuck right now? | How is it going, and who is slipping? |
| Kind of reading | Operational: act on it today | Analytical: decide whom to talk to this week |
| What a number is | A count of today's work | A trend, a rate, or a regularity |

Putting a range through the day's page just adds up the daily numbers. "Mohit:
212 people in 30 days" can't tell a steady 7 a day from 60 on Monday and nothing
after it. That difference is the thing a manager needs to see. A range must not
be a bigger day.

## 2. The day (unchanged)

The current page, in this order: summary (people contacted, calls, picked up),
how the calls went, what came of it, the other activity, then **Needs
attention**. Needs attention covers what is open *now*: never contacted, new and
not called, missed and due follow-ups, calls with no result written.

## 3. The range: four questions, in the order a manager asks them

### 3.1 Is the team working the book? (trend)

- **A chart of people contacted each day**, one bar per firm day. Over it is a
  line for the **share who picked up** that day.
- Beside it are the range's totals: **different people contacted**, calls, and
  the picked-up rate.
- Each total shows its change against **the period just before, of the same
  length** ("↑ 12% on the 7 days before").
- Tapping a bar opens that day: the same page in the day lens.

Two counts that must not share a word (CLAUDE.md §3.3): a person rung on three
days is in three bars but is **one** of the range's "different people". So the
chart says *each day* and the total says *different people*.

### 3.2 Who is carrying it, and who is slipping? (regularity, by agent)

One row per agent, by name, in the same place every time. It is not a ranking.

| Column | Meaning |
|---|---|
| Trend | a small line of their people contacted per day |
| Days worked | days with at least one person contacted, out of the days in the range: "5 of 7" |
| A worked day | different people contacted ÷ days worked (an average over days worked, not all days) |
| Picked up | rate over the range |
| Change | different people, against their previous period |

Off-duty and gone people are greyed, as today. Tapping a row opens the agent,
in the same range.

### 3.3 Is the calling reaching people? (quality)

The existing "How the calls went" donut, over the range. A share over 30 days
means more than a share over one day. It is shown together with the picked-up
rate's change against the previous period.

### 3.4 What is it turning into? (outcomes)

- **What came of it**: the existing statuses people were moved to, over the
  range.
- **New leads that came in**, and how many were called: "84 came in · 71
  called". Same rule as the day (`came_in`), over the range.
- Site visits done and follow-ups done (existing measures).

### 3.5 Needs attention: collapsed

On a range it is one line, "Needs attention · 6", which opens on a tap. It
describes now, not the range, and on a range page it would otherwise sit there
permanently.

## 4. Rules that keep it honest

- **One fact list.** The per-day series is `facts()` over the range, grouped by
  firm day. A bar for a day must equal that day's own report. Check this every
  time it is built.
- **The previous period** is the same query, its range moved back by its own
  length.
- **No comparison against nothing.** When the previous period is 0, show no
  arrow and no percentage, and show "—" in that column. Unknown is not a
  default (CLAUDE.md §3.1).
- **Days in range are calendar days.** There is no weekly-off model yet, so an
  agent off on Sundays reads "6 of 7". That is true, and it's visible. A firm's
  weekly off is parked (Later).
- **No money and no ranking.** No revenue or deal-value hero, no leaderboard.
- **Every number opens its people,** as today.

## 5. My work (the agent, a range)

Their own chart (3.1) and their own days worked. No team, no comparison
against anyone else.

## 6. As built

- **The series rides on the report.** `GET /activity` with `from` adds `days`
  to each person: `{ day, people, calls, answered }` per firm day, grouped from
  the same `facts()` in the same request (`contactByDay` is `contactOf`'s rule
  per day). One request, so the bars and the totals cannot come from two
  different reads. A day has no `days`. Checked on dev `delpat`, 30 days: all 7
  days with calls equal their own one-day report (leads), and 3 of 3 (calling).
- **The previous period** is the same call, `from − n` to `from − 1`
  (`usePrevious`). A rate's change is in points; a count's in percent.
- **Two bands, not two axes.** The picked-up line sits in its own band above
  the bars on its own 0–100% scale; the day axis is shared. A day with nobody
  contacted has no rate, and the line breaks there.
- The parts are `components/RangeView.jsx`: Trend, Totals, RangeAgents, Spark,
  CameIn, Folded. AgentWork and TeamBoard switch to them when `from` is set.
  Pending work on an agent's page folds like Needs attention.
- The phone's Team tab now keeps `from` when it opens an agent and on Back.

## Later

- A firm's weekly off, so days worked can be read against working days.
  Waits on how the firms actually work.
