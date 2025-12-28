import React, { useRef, useState, useEffect } from 'react';

interface DraggableWindowProps {
	title: string;
	defaultPosition?: { x: number; y: number };
	defaultSize?: { width: number; height: number };
	onPositionChange?: (position: { x: number; y: number }) => void;
	onSizeChange?: (size: { width: number; height: number }) => void;
	children: React.ReactNode;
}

/**
 * 可拖动、可调整大小的浮动窗口组件
 */
export const DraggableWindow: React.FC<DraggableWindowProps> = ({
	title,
	defaultPosition = { x: 20, y: 20 },
	defaultSize = { width: 400, height: 600 },
	onPositionChange,
	onSizeChange,
	children,
}) => {
	const windowRef = useRef<HTMLDivElement>(null);
	const headerRef = useRef<HTMLDivElement>(null);
	
	const [position, setPosition] = useState(defaultPosition);
	const [size, setSize] = useState(defaultSize);
	const [isDragging, setIsDragging] = useState(false);
	const [isResizing, setIsResizing] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });

	// 拖动开始（鼠标）
	const handleMouseDown = (e: React.MouseEvent) => {
		if (e.target !== headerRef.current && !headerRef.current?.contains(e.target as Node)) {
			return;
		}
		
		e.preventDefault();
		setIsDragging(true);
		setDragStart({
			x: e.clientX - position.x,
			y: e.clientY - position.y,
		});
	};

	// 拖动开始（触摸）
	const handleTouchStart = (e: React.TouchEvent) => {
		if (e.target !== headerRef.current && !headerRef.current?.contains(e.target as Node)) {
			return;
		}
		
		if (e.touches.length !== 1) return;
		
		const touch = e.touches[0];
		if (!touch) return;
		
		setIsDragging(true);
		setDragStart({
			x: touch.clientX - position.x,
			y: touch.clientY - position.y,
		});
	};

	// 调整大小开始（鼠标）
	const handleResizeMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsResizing(true);
		setResizeStart({
			x: e.clientX,
			y: e.clientY,
			width: size.width,
			height: size.height,
		});
	};

	// 调整大小开始（触摸）
	const handleResizeTouchStart = (e: React.TouchEvent) => {
		e.preventDefault();
		e.stopPropagation();
		
		if (e.touches.length !== 1) return;
		
		const touch = e.touches[0];
		if (!touch) return;
		
		setIsResizing(true);
		setResizeStart({
			x: touch.clientX,
			y: touch.clientY,
			width: size.width,
			height: size.height,
		});
	};

	// 鼠标和触摸移动
	useEffect(() => {
		if (!isDragging && !isResizing) return;

		const handleMouseMove = (e: MouseEvent) => {
			if (isDragging) {
				const newX = e.clientX - dragStart.x;
				const newY = e.clientY - dragStart.y;
				
				// 边界限制
				const maxX = window.innerWidth - 100;
				const maxY = window.innerHeight - 50;
				
				const boundedX = Math.max(0, Math.min(newX, maxX));
				const boundedY = Math.max(0, Math.min(newY, maxY));
				
				setPosition({ x: boundedX, y: boundedY });
				onPositionChange?.({ x: boundedX, y: boundedY });
			}
			
			if (isResizing) {
				const deltaX = e.clientX - resizeStart.x;
				const deltaY = e.clientY - resizeStart.y;
				
				const newWidth = Math.max(300, resizeStart.width + deltaX);
				const newHeight = Math.max(400, resizeStart.height + deltaY);
				
				setSize({ width: newWidth, height: newHeight });
				onSizeChange?.({ width: newWidth, height: newHeight });
			}
		};

		const handleTouchMove = (e: TouchEvent) => {
			if (e.touches.length !== 1) return;
			
			const touch = e.touches[0];
			if (!touch) return;
			
			if (isDragging) {
				const newX = touch.clientX - dragStart.x;
				const newY = touch.clientY - dragStart.y;
				
				// 边界限制
				const maxX = window.innerWidth - 100;
				const maxY = window.innerHeight - 50;
				
				const boundedX = Math.max(0, Math.min(newX, maxX));
				const boundedY = Math.max(0, Math.min(newY, maxY));
				
				setPosition({ x: boundedX, y: boundedY });
				onPositionChange?.({ x: boundedX, y: boundedY });
			}
			
			if (isResizing) {
				const deltaX = touch.clientX - resizeStart.x;
				const deltaY = touch.clientY - resizeStart.y;
				
				const newWidth = Math.max(300, resizeStart.width + deltaX);
				const newHeight = Math.max(400, resizeStart.height + deltaY);
				
				setSize({ width: newWidth, height: newHeight });
				onSizeChange?.({ width: newWidth, height: newHeight });
			}
		};

		const handleEnd = () => {
			setIsDragging(false);
			setIsResizing(false);
		};

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleEnd);
		document.addEventListener('touchmove', handleTouchMove);
		document.addEventListener('touchend', handleEnd);
		document.addEventListener('touchcancel', handleEnd);
		
		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleEnd);
			document.removeEventListener('touchmove', handleTouchMove);
			document.removeEventListener('touchend', handleEnd);
			document.removeEventListener('touchcancel', handleEnd);
		};
	}, [isDragging, isResizing, dragStart, resizeStart, onPositionChange, onSizeChange]);

	return (
		<div
			ref={windowRef}
			className="linguaflow-draggable-window"
			style={{
				position: 'fixed',
				left: `${position.x}px`,
				top: `${position.y}px`,
				width: `${size.width}px`,
				height: `${size.height}px`,
				zIndex: 1000,
			}}
		>
			{/* 窗口标题栏 */}
			<div
				ref={headerRef}
				className="linguaflow-window-header"
				onMouseDown={handleMouseDown}
				onTouchStart={handleTouchStart}
			>
				<div className="linguaflow-window-title">
					<span className="linguaflow-window-icon">📝</span>
					<span>{title}</span>
				</div>
				<div className="linguaflow-window-drag-hint">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
						<circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
					</svg>
				</div>
			</div>

			{/* 窗口内容 */}
			<div className="linguaflow-window-content">
				{children}
			</div>

			{/* 调整大小手柄 */}
			<div
				className="linguaflow-window-resize-handle"
				onMouseDown={handleResizeMouseDown}
				onTouchStart={handleResizeTouchStart}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<path d="M21 15l-6 6M21 9l-12 12M21 3l-18 18"/>
				</svg>
			</div>
		</div>
	);
};
