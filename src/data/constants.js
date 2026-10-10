const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
export const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

export const STATUSES = ["Submitted", "Under Review", "In Progress", "Resolved", "Rejected"];
export const PRIORITIES = ["Low", "Medium", "High"];

export const CATEGORIES = [
  "Roads and Infrastructure",
  "Water Supply",
  "Sanitation and Waste Management",
  "Streetlights",
  "Public Safety",
  "Other Civic Services",
];

export const CATEGORY_DEPARTMENT = {
  "Roads and Infrastructure": "Public Works Department",
  "Water Supply": "Water Supply Board",
  "Sanitation and Waste Management": "Sanitation Department",
  Streetlights: "Electrical Services",
  "Public Safety": "Public Safety Cell",
  "Other Civic Services": "General Administration",
};

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso) {
  if (!iso) return "-";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const isOpen = (c) => c.status !== "Resolved" && c.status !== "Rejected";
export const isPending = (c) => c.status === "Submitted" || c.status === "Under Review";
