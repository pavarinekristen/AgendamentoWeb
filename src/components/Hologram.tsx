// Agenda hologramada do login (mesma cena do desktop, em CSS 3D puro).
export function Hologram() {
  return (
    <div className="holo" aria-hidden="true">
      <div className="holo-cone" />
      <div className="holo-floor" />
      <div className="holo-stage">
        <div className="holo-spin">
          <div className="holo-cal holo-cal-depth" />
          <div className="holo-cal" />
        </div>
      </div>
      <div className="holo-scanlines" />
      <div className="holo-ring-main" />
      <div className="holo-ring-inner" />
    </div>
  );
}
