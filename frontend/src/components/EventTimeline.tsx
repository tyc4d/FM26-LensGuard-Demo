import { useEffect, useRef } from 'react';
import type { RunState } from '../types';
import { eventLabel } from '../labels';

function eventTime(timestamp: string) {
  const date = new Date(timestamp);
  return `${date.toLocaleTimeString('en-US', { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

export function EventTimeline({ run, active }: { run: RunState | null; active: boolean }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const events = run?.events || [];
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [events]);
  return (
    <section className="timeline surface" aria-labelledby="timeline-heading">
      <div className="timeline-heading"><h2 id="timeline-heading">Event timeline</h2><span>{active ? 'Receiving events' : events.length ? `${events.length} events` : 'Awaiting execution'}<span className="timeline-clock-note">Backend timestamps · Local time</span></span></div>
      <div className="timeline-scroll" ref={bodyRef} tabIndex={events.length > 0 ? 0 : -1} aria-label="Run events">
        <table><thead><tr><th>Time</th><th>Event</th><th>Description</th></tr></thead>
          <tbody>{events.length ? events.map((event) => <tr key={event.id}>
            <td><time dateTime={event.timestamp}>{eventTime(event.timestamp)}</time></td>
            <td className={event.type === 'action.blocked' ? 'text-block' : event.type === 'action.allowed' ? 'text-allow' : ''}>{eventLabel(event.type)}</td>
            <td>{event.detail}</td>
          </tr>) : <tr><td colSpan={3} className="timeline-empty">Select Start analysis to follow the image from observation to authorization.</td></tr>}</tbody>
        </table>
      </div>
      <span className="sr-only" role="status">{events.length ? `Latest event: ${eventLabel(events[events.length - 1].type)}` : 'No run events yet'}</span>
    </section>
  );
}
