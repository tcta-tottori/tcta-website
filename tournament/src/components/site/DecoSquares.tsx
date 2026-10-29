// 地の色とわずかに色の違う四角を、大きさも位置もばらばらに散らした背景。
// サイトの src/components/DecoSquares.astro と同じ値（フッター・スマホのメニューの黒地で使う）。
import { memo } from 'react';

const DOTS = [
  { x: '63.0%', y: '23.6%', s: '185px', c: '#202020', d: '9.2s', delay: '-4.8s', dx: '6px', dy: '10px', depth: 1.68, r: '-1.3deg' },
  { x: '66.9%', y: '77.9%', s: '53px', c: '#171717', d: '9.9s', delay: '-1.9s', dx: '8px', dy: '10px', depth: 0.31, r: '-0.4deg' },
  { x: '11.2%', y: '82.4%', s: '166px', c: '#202020', d: '8.2s', delay: '-0.6s', dx: '2px', dy: '-6px', depth: 1.48, r: '0.7deg' },
  { x: '73.1%', y: '49.5%', s: '150px', c: '#171717', d: '10.0s', delay: '-5.5s', dx: '-4px', dy: '0px', depth: 1.32, r: '-1.4deg' },
  { x: '78.7%', y: '16.5%', s: '126px', c: '#232323', d: '9.8s', delay: '-5.6s', dx: '-1px', dy: '14px', depth: 1.07, r: '-2.3deg' },
  { x: '28.7%', y: '0.6%', s: '122px', c: '#121212', d: '10.9s', delay: '-0.7s', dx: '14px', dy: '8px', depth: 1.03, r: '-0.4deg' },
  { x: '74.9%', y: '91.8%', s: '42px', c: '#232323', d: '10.6s', delay: '-6.2s', dx: '-5px', dy: '-5px', depth: 0.20, r: '0.7deg' },
  { x: '56.1%', y: '25.7%', s: '40px', c: '#202020', d: '7.0s', delay: '-11.6s', dx: '1px', dy: '2px', depth: 0.18, r: '-0.8deg' },
  { x: '34.2%', y: '29.2%', s: '187px', c: '#171717', d: '10.3s', delay: '-7.1s', dx: '-18px', dy: '-19px', depth: 1.70, r: '-2.5deg' },
  { x: '12.6%', y: '61.5%', s: '136px', c: '#232323', d: '9.3s', delay: '-5.7s', dx: '-11px', dy: '8px', depth: 1.17, r: '-0.2deg' },
  { x: '45.6%', y: '97.7%', s: '49px', c: '#0E0E0E', d: '8.0s', delay: '-5.8s', dx: '0px', dy: '7px', depth: 0.27, r: '2.4deg' },
  { x: '66.4%', y: '3.2%', s: '79px', c: '#1E1414', d: '7.4s', delay: '-8.5s', dx: '10px', dy: '-7px', depth: 0.58, r: '1.4deg' },
  { x: '74.8%', y: '47.0%', s: '137px', c: '#232323', d: '7.1s', delay: '-7.8s', dx: '-10px', dy: '14px', depth: 1.18, r: '1.1deg' },
  { x: '69.5%', y: '39.3%', s: '177px', c: '#1E1414', d: '8.2s', delay: '-5.2s', dx: '3px', dy: '9px', depth: 1.60, r: '0.4deg' },
  { x: '85.4%', y: '30.4%', s: '181px', c: '#232323', d: '8.8s', delay: '-3.1s', dx: '-1px', dy: '19px', depth: 1.64, r: '-2.9deg' },
  { x: '92.1%', y: '34.4%', s: '146px', c: '#101010', d: '9.8s', delay: '-3.3s', dx: '8px', dy: '-0px', depth: 1.28, r: '1.6deg' },
  { x: '40.3%', y: '26.0%', s: '160px', c: '#171717', d: '9.6s', delay: '-7.0s', dx: '16px', dy: '-5px', depth: 1.42, r: '-2.3deg' },
  { x: '4.6%', y: '35.1%', s: '43px', c: '#121212', d: '9.4s', delay: '-10.8s', dx: '-6px', dy: '9px', depth: 0.21, r: '-2.3deg' },
  { x: '5.4%', y: '35.8%', s: '149px', c: '#101010', d: '6.9s', delay: '-1.5s', dx: '11px', dy: '2px', depth: 1.31, r: '-3.8deg' },
  { x: '87.6%', y: '31.2%', s: '92px', c: '#232323', d: '8.4s', delay: '-3.3s', dx: '3px', dy: '-0px', depth: 0.72, r: '1.9deg' },
  { x: '77.3%', y: '85.7%', s: '119px', c: '#121212', d: '7.7s', delay: '-1.8s', dx: '-2px', dy: '-2px', depth: 1.00, r: '-3.2deg' },
  { x: '59.8%', y: '45.7%', s: '86px', c: '#202020', d: '11.0s', delay: '-5.4s', dx: '10px', dy: '9px', depth: 0.66, r: '1.6deg' },
  { x: '91.7%', y: '82.7%', s: '77px', c: '#0E0E0E', d: '6.7s', delay: '-5.9s', dx: '-8px', dy: '-4px', depth: 0.56, r: '-2.3deg' },
  { x: '67.6%', y: '54.5%', s: '80px', c: '#101010', d: '7.8s', delay: '-4.7s', dx: '11px', dy: '-11px', depth: 0.59, r: '-1.2deg' },
  { x: '41.2%', y: '58.6%', s: '155px', c: '#171717', d: '8.8s', delay: '-6.2s', dx: '-13px', dy: '5px', depth: 1.37, r: '-1.5deg' },
  { x: '20.5%', y: '26.3%', s: '85px', c: '#232323', d: '10.1s', delay: '-7.8s', dx: '1px', dy: '7px', depth: 0.65, r: '-0.0deg' },
];

function DecoSquares({ className = '' }: { className?: string }) {
  return (
    <div className={`footer-deco ${className}`} aria-hidden="true">
      {DOTS.map((d, i) => (
        <span
          key={i}
          className="footer-dot"
          style={{
            '--x': d.x, '--y': d.y, '--s': d.s, '--c': d.c, '--d': d.d, '--delay': d.delay,
            '--dx': d.dx, '--dy': d.dy, '--depth': d.depth, '--r': d.r,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export default memo(DecoSquares);
