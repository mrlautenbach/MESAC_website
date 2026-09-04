// The full slate of activities MESAC plans to run this year, keyed to
// Season 1/2/3 by `Season.order` - independent of whether an Activity row
// has actually been created for each one yet. Lets the site show "coming
// soon" placeholders for sports admins haven't set up, instead of a season
// looking empty until every activity has been entered by hand.
export type ExpectedActivity = {
  name: string;
  sport: string;
  seasonOrder: 1 | 2 | 3;
  divisions: string[];
};

export const EXPECTED_ROSTER: ExpectedActivity[] = [
  { name: "JV Volleyball", sport: "Volleyball", seasonOrder: 1, divisions: ["Girls", "Boys"] },
  { name: "Varsity Volleyball", sport: "Volleyball", seasonOrder: 1, divisions: ["Girls", "Boys"] },
  { name: "Swimming", sport: "Swimming", seasonOrder: 1, divisions: [] },
  { name: "Golf", sport: "Golf", seasonOrder: 1, divisions: [] },
  { name: "Academic Games", sport: "Academic Games", seasonOrder: 1, divisions: [] },

  { name: "JV Basketball", sport: "Basketball", seasonOrder: 2, divisions: ["Girls", "Boys"] },
  { name: "Varsity Basketball", sport: "Basketball", seasonOrder: 2, divisions: ["Girls", "Boys"] },
  { name: "JV Soccer", sport: "Soccer", seasonOrder: 2, divisions: ["Girls", "Boys"] },
  { name: "Varsity Soccer", sport: "Soccer", seasonOrder: 2, divisions: ["Girls", "Boys"] },
  { name: "Tennis", sport: "Tennis", seasonOrder: 2, divisions: [] },
  { name: "Cross Country", sport: "Cross Country", seasonOrder: 2, divisions: [] },
  { name: "Wrestling", sport: "Wrestling", seasonOrder: 2, divisions: ["Girls", "Boys"] },
  { name: "Senior Fine Arts", sport: "Fine Arts", seasonOrder: 2, divisions: [] },

  { name: "Badminton", sport: "Badminton", seasonOrder: 3, divisions: [] },
  { name: "Track & Field", sport: "Track & Field", seasonOrder: 3, divisions: [] },
  { name: "Baseball", sport: "Baseball", seasonOrder: 3, divisions: [] },
  { name: "Softball", sport: "Softball", seasonOrder: 3, divisions: [] },
  { name: "Speech & Debate", sport: "Speech & Debate", seasonOrder: 3, divisions: [] },
];
