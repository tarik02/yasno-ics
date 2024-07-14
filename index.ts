import { createEvent, createEvents } from "ics";
import { writeFile, mkdir } from "node:fs/promises";
import {
	addDays,
	addHours,
	format,
	getDate,
	getMonth,
	getYear,
	startOfDay,
	startOfWeek,
} from "date-fns";

const data = await fetch(
	"https://api.yasno.com.ua/api/v1/pages/home/schedule-turn-off-electricity",
).then((res) => res.json());

const scheduleComponent = data.components.find(
	(it) => it.template_name === "electricity-outages-schedule",
);

const now = new Date();
const sow = startOfWeek(now, { weekStartsOn: 1 });

for (const [cityName, citySchedule] of Object.entries(
	scheduleComponent.schedule,
)) {
	for (const [groupName, groupSchedule] of Object.entries(citySchedule)) {
		const rawEvents = [];

		for (let dow = 0; dow < 7; ++dow) {
			for (const event of groupSchedule[dow]) {
				rawEvents.push({
					type: event.type,
					startDay: dow,
					endDay: dow,
					start: event.start,
					end: event.end,
				});
			}
		}

		for (let i = 1; i < rawEvents.length; ++i) {
			let cur = rawEvents[i - 1];
			let next = rawEvents[i];
			if (cur.type !== next.type) {
				continue;
			}
			if (
				!(
					cur.end === next.start ||
					(cur.end === 24 &&
						next.start === 0 &&
						next.startDay - cur.endDay === 1)
				)
			) {
				continue;
			}
			cur.end = next.end;
			cur.endDay = next.endDay;
			rawEvents.splice(i, 1);
			--i;
		}

		const first = rawEvents[0];
		const last = rawEvents[rawEvents.length - 1];
		if (
			first.type === last.type &&
			first.startDay === 0 &&
			first.start === 0 &&
			last.endDay === 6 &&
			last.end === 24
		) {
			first.startDay = -1;
			first.start = last.start;
			rawEvents.splice(-1);
		}

		const events = rawEvents.map((rawEvent) => ({
			title: {
				DEFINITE_OUTAGE: "Світла немає",
				POSSIBLE_OUTAGE: "Можливе відключення",
			}[rawEvent.type],
			start: addHours(
				addDays(sow, rawEvent.startDay),
				rawEvent.start,
			).getTime(),
			startInputType: "utc",
			end: addHours(addDays(sow, rawEvent.endDay), rawEvent.end).getTime(),
			endInputType: "utc",
			recurrenceRule: "FREQ=WEEKLY",
		}));

		const res = createEvents(events);
		if (res.error) {
			throw res.error;
		}

		await mkdir(`./out/${cityName}`, { recursive: true });
		await writeFile(`./out/${cityName}/${groupName}.ics`, res.value);
	}
}
