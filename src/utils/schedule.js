// Delivery date & time-slot rules. All times are India time (IST, UTC+5:30),
// even when the server runs in another time zone (e.g. on Render).
const { settings } = require('../data/menu');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Returns a Date whose UTC fields equal the current IST wall-clock time.
function istNow(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MS);
}

function toKey(d) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function isWeekendKey(key) {
  const day = new Date(`${key}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

// Dates a customer may choose, e.g. [{ value: '2026-10-30', label: 'Tomorrow, Fri 30 Oct' }]
function availableDates(now = new Date()) {
  const ist = istNow(now);
  const sameDayOpen = ist.getUTCHours() < settings.sameDayCutoffHour;
  const dates = [];
  for (let offset = sameDayOpen ? 0 : 1; offset <= settings.maxDaysAhead; offset += 1) {
    const d = new Date(ist.getTime() + offset * DAY_MS);
    const pretty = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    const prefix = offset === 0 ? 'Today, ' : offset === 1 ? 'Tomorrow, ' : '';
    dates.push({ value: toKey(d), label: prefix + pretty, weekend: isWeekendKey(toKey(d)) });
  }
  return dates;
}

function formatDateKey(key) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

// Returns an error message, or null if the date/slot is valid for these cart lines.
function validateSchedule(dateKey, slot, lines, now = new Date()) {
  const allowed = availableDates(now).map((d) => d.value);
  if (!allowed.includes(dateKey)) {
    return `Please choose a date from the list. Same-day orders close at ${settings.sameDayCutoffHour % 12} PM.`;
  }
  if (!settings.slots.includes(slot)) return 'Please choose a time slot.';
  const weekendOnly = lines.filter((l) => l.item.weekendOnly).map((l) => l.item.name);
  if (weekendOnly.length && !isWeekendKey(dateKey)) {
    return `${weekendOnly.join(', ')} is available on Saturday and Sunday only. Pick a weekend date or remove it.`;
  }
  return null;
}

module.exports = { availableDates, validateSchedule, formatDateKey, isWeekendKey };
