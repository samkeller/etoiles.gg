import { useEffect, useRef } from 'preact/hooks';

interface Star {
	x: number;
	y: number;
	size: number;
	phase: number;
	speed: number;
}

function drawStar(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	radius: number,
	rotation: number,
) {
	context.beginPath();
	for (let point = 0; point < 10; point += 1) {
		const angle = rotation + (point * Math.PI) / 5;
		const length = point % 2 === 0 ? radius : radius * 0.42;
		const nextX = x + Math.cos(angle) * length;
		const nextY = y + Math.sin(angle) * length;
		if (point === 0) context.moveTo(nextX, nextY);
		else context.lineTo(nextX, nextY);
	}
	context.closePath();
	context.fill();
}

export default function Starfield() {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context) return;

		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const stars: Star[] = Array.from({ length: 76 }, () => ({
			x: Math.random(),
			y: Math.random(),
			size: Math.random() * 1.8 + 0.55,
			phase: Math.random() * Math.PI * 2,
			speed: Math.random() * 0.5 + 0.15,
		}));
		let width = 0;
		let height = 0;
		let frame = 0;
		let pointerX = 0;
		let pointerY = 0;
		let elapsed = 0;

		const resize = () => {
			const bounds = canvas.getBoundingClientRect();
			const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
			width = bounds.width;
			height = bounds.height;
			canvas.width = width * pixelRatio;
			canvas.height = height * pixelRatio;
			context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
			draw();
		};

		const draw = () => {
			context.clearRect(0, 0, width, height);
			for (const star of stars) {
				const shimmer = 0.38 + (Math.sin(elapsed * star.speed + star.phase) + 1) * 0.31;
				context.globalAlpha = shimmer;
				context.fillStyle = star.size > 1.7 ? '#f5c542' : '#bfd7ff';
				drawStar(
					context,
					star.x * width + pointerX * star.size * 3,
					star.y * height + pointerY * star.size * 3,
					star.size,
					-Math.PI / 2,
				);
			}
			context.globalAlpha = 1;
		};

		const animate = () => {
			elapsed += 0.025;
			draw();
			if (!reducedMotion) frame = window.requestAnimationFrame(animate);
		};

		const onPointerMove = (event: PointerEvent) => {
			pointerX = event.clientX / window.innerWidth - 0.5;
			pointerY = event.clientY / window.innerHeight - 0.5;
			if (reducedMotion) draw();
		};

		resize();
		if (reducedMotion) draw();
		else frame = window.requestAnimationFrame(animate);
		window.addEventListener('resize', resize);
		window.addEventListener('pointermove', onPointerMove, { passive: true });

		return () => {
			window.cancelAnimationFrame(frame);
			window.removeEventListener('resize', resize);
			window.removeEventListener('pointermove', onPointerMove);
		};
	}, []);

	return <canvas ref={canvasRef} class="starfield" aria-hidden="true" />;
}
