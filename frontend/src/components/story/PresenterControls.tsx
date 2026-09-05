interface PresenterControlsProps {
  playing: boolean;
  canPrevious: boolean;
  canNext: boolean;
  canPlay?: boolean;
  canReplay: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onReplay: () => void;
}

export function PresenterControls({ playing, canPrevious, canNext, canPlay = canNext, canReplay, onPrevious, onNext, onTogglePlay, onReplay }: PresenterControlsProps) {
  return <div className="story-presenter-controls" role="group" aria-label="展示播放控制">
    <button type="button" onClick={onReplay} disabled={!canReplay}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8a8 8 0 1 1-1 8M5 3v5h5" /></svg><span>重播</span></button>
    <span className="story-controls-divider" aria-hidden="true" />
    <button type="button" onClick={onPrevious} disabled={!canPrevious}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg><span>上一步</span></button>
    <button type="button" className="story-play-button" onClick={onTogglePlay} disabled={!playing && !canPlay} aria-label={playing ? '暫停展示' : '播放展示'}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{playing ? <path d="M9 5v14M15 5v14" /> : <path d="m9 5 10 7-10 7Z" />}</svg><span>{playing ? '暫停' : '播放'}</span>
    </button>
    <button type="button" onClick={onNext} disabled={!canNext}><span>下一步</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg></button>
  </div>;
}
