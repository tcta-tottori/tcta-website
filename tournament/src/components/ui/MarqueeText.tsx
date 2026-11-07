// 枠に収まらないときだけ横に流す 1 行の文字（所属など）。収まるときはそのまま止めて出す。
//   ・幅が変わるたびに収まるかを見直す
//   ・軽量モード（html.is-lite）・動きを減らす設定では流さず、端を省略する（CSS の .mqt）
import { useLayoutEffect, useRef, useState } from 'react';

export default function MarqueeText({ text, className = '', align = 'left' }: { text: string; className?: string; align?: 'left' | 'right' }) {
  const box = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [run, setRun] = useState(false);

  useLayoutEffect(() => {
    const check = () => { if (box.current && inner.current) setRun(inner.current.scrollWidth > box.current.clientWidth + 1); };
    check();
    const ro = new ResizeObserver(check);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [text]);

  return (
    <span ref={box} className={`mqt ${run ? 'is-run' : ''} ${align === 'right' ? 'mqt--right' : ''} ${className}`} title={text}>
      <span className="mqt__track" style={run ? { animationDuration: `${Math.max(5, text.length * 0.45)}s` } : undefined}>
        <span ref={inner} className="mqt__text">{text}</span>
        {run && <span className="mqt__text" aria-hidden="true">{text}</span>}
      </span>
    </span>
  );
}
