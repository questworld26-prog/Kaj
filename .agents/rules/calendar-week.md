# Kaj Calendar Domain Rule: Week Starts on Monday

- For all scheduling, calendar grid rendering, recurring period matching, and automatic task promotions in Kaj, a week starts on **Monday** (`day 1`) and ends on **Sunday** (`day 7`).
- Both `getMondayWeekStartYMD` (`YYYY-MM-DD`) and `getISOWeekKey` (`YYYY-Www`) enforce Monday-to-Sunday boundaries cleanly across month and year transitions.

