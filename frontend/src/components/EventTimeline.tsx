import { useEffect, useRef } from 'react';
import type { RunState } from '../types';

function eventTime(timestamp: string) {
  const date = new Date(timestamp);
  return `${date.toLocaleTimeString('en-GB', { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`;
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
      <div className="timeline-heading"><h2 id="timeline-heading">Event Timeline</h2><span>{active ? 'STREAMING' : events.length ? `${events.length} EVENTS` : 'AWAITING RUN'}<span className="timeline-clock-note">Backend timestamps · local time</span></span></div>
      <div className="timeline-scroll" ref={bodyRef} tabIndex={events.length > 0 ? 0 : -1} aria-label="Runtime events">
        <table><thead><tr><th>Timestamp</th><th>Event</th><th>Detail</th></tr></thead>
          <tbody>{events.length ? events.map((event) => <tr key={event.id}>
            <td><time dateTime={event.timestamp}>{eventTime(event.timestamp)}</time></td>
            <td className={event.type === 'action.blocked' ? 'text-block' : event.type === 'action.allowed' ? 'text-allow' : ''}>{event.type}</td>
            <td>{event.detail}</td>
          </tr>) : <tr><td colSpan={3} className="timeline-empty">Run Analysis to follow the frame from observation to authorization.</td></tr>}</tbody>
        </table>
      </div>
      <span className="sr-only" role="status">{events.length ? `Latest event: ${events[events.length - 1].type}` : 'No runtime events yet'}</span>
    </section>
  );
}
