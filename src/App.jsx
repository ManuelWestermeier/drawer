import { useEffect, useRef, useState } from "react";

const defaultComps = [
  {
    type: "box",
    data: {
      x: 1,
      y: 1,
      w: 4,
      h: 4,
    },
  },
  {
    type: "box",
    data: {
      x: 5,
      y: 4,
      w: 3,
      h: 4,
    },
  }
];

function render(canvas, ctx = new OffscreenCanvasRenderingContext2D(), comps = defaultComps, [x, y, zoom]) {
  canvas.width = innerWidth - 300;
  canvas.height = innerHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const unit = (canvas.height > canvas.width ? canvas.height / 100 : canvas.width / 100) * zoom;

  for (const c of comps) {
    const getX = (key) => (c.data[key] * unit) + x;
    const getY = (key) => (c.data[key] * unit) + y;
    if (c.type == "box") {
      ctx.fillRect(getX("x"), getY("y"), getX("w"), getY("h"));
    }
  }
}

export default function App() {
  const [comps, setComps] = useState(defaultComps);
  const [off, setOff] = useState([0, 0, 1]);
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    render(canvas, ctx, comps, off);
  }, [comps, canvasRef, off]);

  return (
    <>
      <div className="left">
        {comps.map((c, i) => {
          return <div key={i}>{JSON.stringify(c)}</div>;
        })}
      </div>
      <canvas className="right" ref={canvasRef} onMouseMove={e => {
        e.preventDefault();
        if (e.ctrlKey) {
          setOff(([x, y, zoom]) => [x + e.movementX, y + e.movementY, zoom]);
        }
      }} />
    </>
  )
}
