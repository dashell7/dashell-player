import { useState, useEffect, useCallback } from 'react';

/**
 * 监听元素尺寸变化的 Hook
 */
export function useResizeObserver<T extends HTMLElement>() {
	const [element, setElement] = useState<T | null>(null);
	const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

	const ref = useCallback((node: T | null) => {
		setElement(node);
	}, []);

	useEffect(() => {
		if (!element) return;

		const observer = new ResizeObserver((entries) => {
			if (!entries || entries.length === 0) return;
			
			const entry = entries[0];
			if (!entry) return;

			const { width, height } = entry.contentRect;
			
			setDimensions({ width, height });
		});

		observer.observe(element);

		return () => {
			observer.disconnect();
		};
	}, [element]);

	return { ref, width: dimensions.width, height: dimensions.height };
}
