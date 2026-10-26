// What a page looks like while it's on its way (loading.tsx in each language):
// the masthead and the shapes of the front page, shimmering.
export default function Skeleton({ name }: { name: string }) {
  return (
    <div className="skel" aria-busy="true" aria-live="polite">
      <div className="skel-top"><div className="wrap skel-bar"><span className="sk sk-ib" /><b className="skel-wm">{name}</b><span className="sk sk-ib" /></div></div>
      <div className="wrap">
        <div className="skel-secs">{Array.from({ length: 7 }, (_, i) => <span key={i} className="sk sk-chip" />)}</div>
        <div className="skel-lead">
          <div><span className="sk sk-line w40" /><span className="sk sk-h" /><span className="sk sk-h w80" /><span className="sk sk-line" /><span className="sk sk-line w60" /></div>
          <span className="sk sk-photo" />
        </div>
        <div className="skel-cards">{Array.from({ length: 3 }, (_, i) => (
          <div key={i}><span className="sk sk-photo" /><span className="sk sk-line" /><span className="sk sk-line w80" /></div>))}</div>
      </div>
    </div>
  );
}
