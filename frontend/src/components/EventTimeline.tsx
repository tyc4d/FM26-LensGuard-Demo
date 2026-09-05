import { useEffect, useRef } from 'react';
import type { RunState } from '../types';
import { eventLabel } from '../labels';

function eventTime(timestamp: string) {
  const date = new Date(timestamp);
  return `${date.toLocaleTimeString('zh-TW', { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`;
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
      <div className="timeline-heading"><h2 id="timeline-heading">事件時間軸</h2><span>{active ? '持續接收中' : events.length ? `${events.length} 個事件` : '等待執行'}<span className="timeline-clock-note">後端時間戳記・本機時間</span></span></div>
      <div className="timeline-scroll" ref={bodyRef} tabIndex={events.length > 0 ? 0 : -1} aria-label="執行事件">
        <table><thead><tr><th>時間</th><th>事件</th><th>說明</th></tr></thead>
          <tbody>{events.length ? events.map((event) => <tr key={event.id}>
            <td><time dateTime={event.timestamp}>{eventTime(event.timestamp)}</time></td>
            <td className={event.type === 'action.blocked' ? 'text-block' : event.type === 'action.allowed' ? 'text-allow' : ''}>{eventLabel(event.type)}</td>
            <td>{event.detail}</td>
          </tr>) : <tr><td colSpan={3} className="timeline-empty">按下「開始分析」，追蹤影像從觀察到授權的過程。</td></tr>}</tbody>
        </table>
      </div>
      <span className="sr-only" role="status">{events.length ? `最新事件：${eventLabel(events[events.length - 1].type)}` : '尚無執行事件'}</span>
    </section>
  );
}
