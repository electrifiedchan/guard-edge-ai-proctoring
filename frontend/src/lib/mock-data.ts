export type Session = {
  id: string;
  role: string;
  date: string;
  durationMin: number;
  overall: number;
  focusBuckets: number[];
  star: { S: number; T: number; A: number; R: number; clarity: number };
  verdictExcerpt: string;
  wpm: number;
};

export const sessions: Session[] = [
  {
    id: "S-042",
    role: "Senior Frontend Engineer — Stripe",
    date: "2024-07-22",
    durationMin: 14,
    overall: 91,
    focusBuckets: [88, 92, 95, 90, 87, 93, 91, 89, 94, 92, 88, 91],
    star: { S: 88, T: 92, A: 95, R: 90, clarity: 91 },
    verdictExcerpt: "Strong RESULT framing; gaze drift during technical answers needs work.",
    wpm: 132,
  },
  {
    id: "S-041",
    role: "Staff Engineer — Vercel",
    date: "2024-07-20",
    durationMin: 12,
    overall: 84,
    focusBuckets: [80, 85, 88, 82, 79, 84, 86, 83, 87, 81, 85, 84],
    star: { S: 82, T: 86, A: 88, R: 84, clarity: 80 },
    verdictExcerpt: "Solid TASK framing; ACTION steps lacked specificity in system design.",
    wpm: 118,
  },
  {
    id: "S-040",
    role: "Engineering Manager — Linear",
    date: "2024-07-18",
    durationMin: 16,
    overall: 76,
    focusBuckets: [72, 78, 75, 80, 74, 76, 79, 73, 77, 75, 78, 76],
    star: { S: 78, T: 74, A: 76, R: 72, clarity: 75 },
    verdictExcerpt: "Composure held under pressure; SITUATION context was under-developed.",
    wpm: 108,
  },
  {
    id: "S-039",
    role: "Principal Engineer — Figma",
    date: "2024-07-15",
    durationMin: 11,
    overall: 88,
    focusBuckets: [85, 90, 87, 92, 88, 86, 91, 89, 87, 90, 88, 86],
    star: { S: 90, T: 88, A: 86, R: 92, clarity: 88 },
    verdictExcerpt: "Excellent RESULT quantification; minor filler word spikes at 4:20.",
    wpm: 124,
  },
  {
    id: "S-038",
    role: "Tech Lead — Notion",
    date: "2024-07-12",
    durationMin: 13,
    overall: 62,
    focusBuckets: [58, 65, 60, 68, 55, 62, 64, 59, 66, 61, 63, 60],
    star: { S: 65, T: 60, A: 58, R: 62, clarity: 64 },
    verdictExcerpt: "Gaze instability flagged; ACTION narrative needs concrete ownership language.",
    wpm: 98,
  },
  {
    id: "S-037",
    role: "Senior SWE — Anthropic",
    date: "2024-07-10",
    durationMin: 15,
    overall: 55,
    focusBuckets: [50, 58, 52, 60, 48, 55, 57, 51, 59, 53, 56, 54],
    star: { S: 58, T: 52, A: 55, R: 50, clarity: 56 },
    verdictExcerpt: "High anxiety markers; SITUATION framing was vague — needs a full rebuild.",
    wpm: 88,
  },
];
