// Pure layout for the interactive calendar grid (ADR 0021). Times are
// minutes from the local midnight of the day column.
export const SLOT_MINUTES = 30;
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;

export type GridBlock<T> = {
  entry: T;
  startMinute: number;
  endMinute: number;
  lane: number;
  lanes: number;
};

// Entries overlapping [dayStart, dayEnd), clipped to the day and placed in
// side-by-side lanes when they overlap each other.
export function layoutDay<T extends { startsAt: string; endsAt: string }>(
  entries: readonly T[],
  dayStart: string,
  dayEnd: string,
): GridBlock<T>[] {
  const start = Date.parse(dayStart);
  const end = Date.parse(dayEnd);
  const blocks = entries
    .filter((e) => Date.parse(e.startsAt) < end && Date.parse(e.endsAt) > start)
    .map((entry) => ({
      entry,
      startMinute: Math.max(0, (Date.parse(entry.startsAt) - start) / 60_000),
      endMinute: Math.min(
        (end - start) / 60_000,
        (Date.parse(entry.endsAt) - start) / 60_000,
      ),
      lane: 0,
      lanes: 1,
    }))
    .sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);
  // Clusters of transitively overlapping blocks share one lane count.
  let cluster: typeof blocks = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];
  const close = () => {
    const lanes = Math.max(1, ...cluster.map((b) => b.lane + 1));
    cluster.forEach((b) => (b.lanes = lanes));
    cluster = [];
    laneEnds.length = 0;
  };
  for (const block of blocks) {
    if (block.startMinute >= clusterEnd) close();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= block.startMinute);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = block.endMinute;
    block.lane = lane;
    cluster.push(block);
    clusterEnd = Math.max(clusterEnd, block.endMinute);
  }
  close();
  return blocks;
}

export function minuteToTime(minute: number) {
  const value = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

// Wall-clock arithmetic on a "YYYY-MM-DD" + "HH:MM" pair; the result is a
// datetime-local value that the server converts with the interface zone.
export function addLocalMinutes(date: string, time: string, minutes: number) {
  const value = new Date(`${date}T${time}:00Z`);
  value.setUTCMinutes(value.getUTCMinutes() + minutes);
  return value.toISOString().slice(0, 16);
}

export const DURATIONS = [30, 60, 90, 120, 180, 240, 300, 360, 480] as const;

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
