import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { performanceThrottle } from '../utils/performanceUtils';

/**
 * 虚拟滚动组件属性
 */
export interface VirtualScrollProps<T> {
	/** 数据数组 */
	items: T[];
	/** 每个项目的高度（px） */
	itemHeight: number;
	/** 容器高度（px） */
	containerHeight: number;
	/** 缓冲区项目数（上下各渲染额外的项目） */
	overscan?: number;
	/** 渲染函数 */
	renderItem: (item: T, index: number) => React.ReactNode;
	/** 获取项目唯一键 */
	getItemKey: (item: T, index: number) => string | number;
	/** 容器className */
	className?: string;
	/** 滚动到指定索引时的回调 */
	onScrollToIndex?: (index: number) => void;
}

/**
 * 虚拟滚动组件
 * 只渲染可见区域的项目，大幅提升大列表性能
 */
export function VirtualScroll<T>({
	items,
	itemHeight,
	containerHeight,
	overscan = 3,
	renderItem,
	getItemKey,
	className = '',
	onScrollToIndex
}: VirtualScrollProps<T>) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [scrollTop, setScrollTop] = useState(0);
	const scrollToIndexRef = useRef<number | null>(null);

	// 计算总高度
	const totalHeight = items.length * itemHeight;

	// 计算可见范围
	const { startIndex, endIndex, visibleItems } = useMemo(() => {
		// 计算可见区域的第一个和最后一个索引
		const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
		const end = Math.min(
			items.length - 1,
			Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
		);

		return {
			startIndex: start,
			endIndex: end,
			visibleItems: items.slice(start, end + 1)
		};
	}, [scrollTop, itemHeight, containerHeight, overscan, items]);

	// 节流的滚动处理器
	const handleScroll = useMemo(
		() =>
			performanceThrottle((e: Event) => {
				const target = e.target as HTMLDivElement;
				setScrollTop(target.scrollTop);
			}, 16), // 60fps
		[]
	);

	// 监听滚动事件
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		container.addEventListener('scroll', handleScroll);
		return () => {
			container.removeEventListener('scroll', handleScroll);
		};
	}, [handleScroll]);

	// 滚动到指定索引
	const scrollToIndex = useCallback(
		(index: number, behavior: ScrollBehavior = 'smooth') => {
			const container = containerRef.current;
			if (!container) return;

			const targetScrollTop = index * itemHeight;
			container.scrollTo({
				top: targetScrollTop,
				behavior
			});

			scrollToIndexRef.current = index;
			onScrollToIndex?.(index);
		},
		[itemHeight, onScrollToIndex]
	);

	// 公开滚动到索引的方法
	useEffect(() => {
		if (containerRef.current) {
			(containerRef.current as any).scrollToIndex = scrollToIndex;
		}
	}, [scrollToIndex]);

	// 计算偏移量
	const offsetY = startIndex * itemHeight;

	return (
		<div
			ref={containerRef}
			className={`virtual-scroll-container ${className}`}
			style={{
				height: `${containerHeight}px`,
				overflow: 'auto',
				position: 'relative',
				willChange: 'transform' // 性能优化
			}}
		>
			{/* 占位元素，撑起总高度 */}
			<div style={{ height: `${totalHeight}px`, position: 'relative' }}>
				{/* 可见项目容器 */}
				<div
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						transform: `translateY(${offsetY}px)`,
						willChange: 'transform'
					}}
				>
					{visibleItems.map((item, relativeIndex) => {
						const absoluteIndex = startIndex + relativeIndex;
						const key = getItemKey(item, absoluteIndex);

						return (
							<div
								key={key}
								style={{
									height: `${itemHeight}px`,
									overflow: 'hidden'
								}}
								data-index={absoluteIndex}
							>
								{renderItem(item, absoluteIndex)}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

/**
 * 虚拟滚动Hook
 * 简化虚拟滚动的使用
 */
export function useVirtualScroll<T>(
	items: T[],
	config: {
		itemHeight: number;
		containerHeight: number;
		overscan?: number;
	}
) {
	const scrollRef = useRef<HTMLDivElement>(null);

	const scrollToIndex = useCallback(
		(index: number, behavior: ScrollBehavior = 'smooth') => {
			const container = scrollRef.current;
			if (container && (container as any).scrollToIndex) {
				(container as any).scrollToIndex(index, behavior);
			}
		},
		[]
	);

	const scrollToTop = useCallback(() => {
		scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
	}, []);

	const scrollToBottom = useCallback(() => {
		const container = scrollRef.current;
		if (container) {
			container.scrollTo({
				top: container.scrollHeight,
				behavior: 'smooth'
			});
		}
	}, []);

	return {
		scrollRef,
		scrollToIndex,
		scrollToTop,
		scrollToBottom,
		...config
	};
}

/**
 * 自动高度虚拟滚动组件
 * 支持不同高度的项目（使用预估高度）
 */
interface AutoHeightVirtualScrollProps<T> {
	items: T[];
	estimatedItemHeight: number;
	containerHeight: number;
	overscan?: number;
	renderItem: (item: T, index: number) => React.ReactNode;
	getItemKey: (item: T, index: number) => string | number;
	className?: string;
}

export const AutoHeightVirtualScroll = React.forwardRef<any, AutoHeightVirtualScrollProps<any>>(({
	items,
	estimatedItemHeight,
	containerHeight,
	overscan = 3,
	renderItem,
	getItemKey,
	className = ''
}, ref) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const [scrollTop, setScrollTop] = useState(0);
	const [itemHeights, setItemHeights] = useState<Map<number, number>>(new Map());

	// 测量项目高度
	const measureItemHeight = useCallback((index: number, height: number) => {
		setItemHeights(prev => {
			if (prev.get(index) === height) return prev;
			const next = new Map(prev);
			next.set(index, height);
			return next;
		});
	}, []);

	// 计算项目位置
	const itemPositions = useMemo(() => {
		const positions: number[] = [];
		let currentPosition = 0;

		for (let i = 0; i < items.length; i++) {
			positions.push(currentPosition);
			const height = itemHeights.get(i) || estimatedItemHeight;
			currentPosition += height;
		}

		return {
			positions,
			totalHeight: currentPosition
		};
	}, [items.length, itemHeights, estimatedItemHeight]);

	// 暴露滚动方法
	React.useImperativeHandle(ref, () => ({
		scrollToIndex: (index: number, options?: { behavior?: ScrollBehavior; offset?: number }) => {
			const { behavior = 'smooth', offset = 0 } = options || {};
			const itemTop = itemPositions.positions[index] ?? 0;
			// 目标滚动位置 = 项目顶部位置 - 期望的偏移量
			// 例如：如果希望项目在容器中间，offset 应该是 (containerHeight / 2) - (itemHeight / 2)
			// 这里简单处理，offset 就是项目顶部距离容器顶部的距离
			const targetScrollTop = Math.max(0, itemTop - offset);
			
			containerRef.current?.scrollTo({
				top: targetScrollTop,
				behavior
			});
		},
		getScrollElement: () => containerRef.current
	}));

	// 找到可见范围
	const { startIndex, endIndex } = useMemo(() => {
		const { positions } = itemPositions;
		
		if (positions.length === 0) {
			return { startIndex: 0, endIndex: 0 };
		}

		// 二分查找起始索引
		let start = 0;
		let end = positions.length - 1;

		while (start < end) {
			const mid = Math.floor((start + end) / 2);
			const midPos = positions[mid];
			if (midPos !== undefined && midPos < scrollTop) {
				start = mid + 1;
			} else {
				end = mid;
			}
		}

		start = Math.max(0, start - overscan);
		end = start;

		// 找到结束索引
		const viewportBottom = scrollTop + containerHeight;
		while (end < positions.length) {
			const endPos = positions[end];
			if (endPos === undefined || endPos >= viewportBottom) break;
			end++;
		}

		end = Math.min(positions.length - 1, end + overscan);

		return { startIndex: start, endIndex: end };
	}, [scrollTop, containerHeight, overscan, itemPositions]);

  // 节流的滚动处理
  const handleScroll = useMemo(
    () =>
      performanceThrottle((e: Event) => {
        const target = e.target as HTMLDivElement;
        setScrollTop(target.scrollTop);
      }, 16),
    []
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  return (
    <div
      ref={containerRef}
      className={`virtual-scroll-auto-height ${className}`}
      style={{
        height: `${containerHeight}px`,
        overflow: 'auto',
        position: 'relative'
      }}
    >
      <div style={{ height: `${itemPositions.totalHeight}px`, position: 'relative' }}>
        {items.slice(startIndex, endIndex + 1).map((item, relativeIndex) => {
          const absoluteIndex = startIndex + relativeIndex;
          const key = getItemKey(item, absoluteIndex);
          const top = itemPositions.positions[absoluteIndex] ?? 0;

          return (
            <ItemMeasurer
              key={key}
              index={absoluteIndex}
              top={top}
              onHeightChange={measureItemHeight}
            >
              {renderItem(item, absoluteIndex)}
            </ItemMeasurer>
          );
        })}
      </div>
    </div>
  );
});

AutoHeightVirtualScroll.displayName = 'AutoHeightVirtualScroll';

/**
 * 项目高度测量组件
 */
interface ItemMeasurerProps {
	index: number;
	top: number;
	children: React.ReactNode;
	onHeightChange: (index: number, height: number) => void;
}

const ItemMeasurer: React.FC<ItemMeasurerProps> = React.memo(
	({ index, top, children, onHeightChange }) => {
		const ref = useRef<HTMLDivElement>(null);

		useEffect(() => {
			if (ref.current) {
				const height = ref.current.offsetHeight;
				onHeightChange(index, height);
			}
		}, [index, onHeightChange, children]);

		return (
			<div
				ref={ref}
				style={{
					position: 'absolute',
					top: `${top}px`,
					left: 0,
					right: 0
				}}
				data-index={index}
			>
				{children}
			</div>
		);
	}
);

ItemMeasurer.displayName = 'ItemMeasurer';
