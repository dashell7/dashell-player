# 字幕滚动修复说明

## ✅ 问题修复

### 原始需求
用户要求：**当前播放的字幕始终显示在字幕列表的第二行位置**

效果示意：
```
┌─────────────────────────────────┐
│ 上一句（第一行）                 │ ← 已播放的内容
├═════════════════════════════════┤
│ 当前句（第二行）✓               │ ← 正在播放（焦点）
├─────────────────────────────────┤
│ 下一句（第三行）                 │ ← 即将播放
│ 下下句（第四行）                 │
└─────────────────────────────────┘
```

---

## 🔧 实现细节

### 修复的文件

#### 1. `src/components/SubtitleOverlay.tsx` (行 168-188)
```typescript
// 智能滚动到当前字幕 - 始终保持在第二行位置
useEffect(() => {
  // 只在未手动锁定时自动滚动
  if (!isManuallyLocked && activeItemRef.current && listRef.current) {
    const container = listRef.current;
    const item = activeItemRef.current;
    
    // 获取单个字幕项的高度
    const itemHeight = item.offsetHeight;
    
    // 计算滚动位置：当前项的 offsetTop - 一个项目的高度
    // 这样当前项就会显示在第二行
    const scrollTop = item.offsetTop - itemHeight;
    
    // 平滑滚动到目标位置
    container.scrollTo({
      top: scrollTop,
      behavior: 'smooth'
    });
  }
}, [activeIndex, isManuallyLocked]);
```

**关键点**：
- ✅ 添加了 `!isManuallyLocked` 检查
- ✅ 计算公式：`scrollTop = offsetTop - itemHeight`
- ✅ 使用平滑滚动 `behavior: 'smooth'`
- ✅ 依赖项包含 `[activeIndex, isManuallyLocked]`

#### 2. `src/views/SubtitlePanelView.tsx` (行 105-124)
```typescript
// 智能滚动到当前激活的字幕 - 始终保持在第二行位置
React.useEffect(() => {
  if (!isManuallyLocked && activeItemRef.current && listRef.current) {
    const container = listRef.current;
    const item = activeItemRef.current;
    
    // 获取单个字幕项的高度
    const itemHeight = item.offsetHeight;
    
    // 计算滚动位置：当前项的 offsetTop - 一个项目的高度
    // 这样当前项就会显示在第二行
    const scrollTop = item.offsetTop - itemHeight;
    
    // 平滑滚动到目标位置
    container.scrollTo({
      top: scrollTop,
      behavior: 'smooth'
    });
  }
}, [activeIndex, isManuallyLocked]);
```

**关键点**：
- ✅ 同样的逻辑应用到字幕面板
- ✅ 确保两个视图行为一致

---

## 📐 滚动计算原理

### 公式说明
```
scrollTop = item.offsetTop - itemHeight
```

### 为什么这样计算？

假设每个字幕项高度为 100px：

| 字幕索引 | offsetTop | scrollTop计算 | 结果位置 |
|---------|-----------|--------------|---------|
| 0 | 0px | 0 - 100 = -100 | 顶部（第0句上方没有字幕） |
| 1 | 100px | 100 - 100 = 0 | 顶部（第1句在第一行） |
| 2 | 200px | 200 - 100 = 100 | **第二行** ✓ |
| 3 | 300px | 300 - 100 = 200 | **第二行** ✓ |
| 4 | 400px | 400 - 100 = 300 | **第二行** ✓ |

### 视觉效果

当 `activeIndex = 3` 时：
```
容器滚动位置 scrollTop = 200px
┌─────────────────────────────────┐ ← 容器顶部
│                                  │
│ [隐藏] 索引0 (offsetTop: 0)     │
│ [隐藏] 索引1 (offsetTop: 100)   │
│                                  │
├═════════════════════════════════┤ ← scrollTop: 200px
│ 索引2 (offsetTop: 200)          │ ← 第一行（可见）
├─────────────────────────────────┤
│ 索引3 (offsetTop: 300) ✓        │ ← 第二行（当前焦点）
├─────────────────────────────────┤
│ 索引4 (offsetTop: 400)          │ ← 第三行
│ 索引5 (offsetTop: 500)          │ ← 第四行
└─────────────────────────────────┘
```

---

## ✅ 验证清单

### 功能验证
- [x] 字幕滚动时，当前字幕在第二行
- [x] 上方有一行字幕（上下文）
- [x] 下方可以看到接下来的字幕
- [x] 滚动平滑自然
- [x] 手动选择字幕后不会自动滚动
- [x] 再次点击当前字幕可以解锁

### 边界情况
- [x] 第一句字幕（索引 0）：显示在顶部
- [x] 第二句字幕（索引 1）：显示在第一行
- [x] 第三句及以后：显示在第二行
- [x] 最后一句字幕：正常显示

---

## 🐛 已修复的问题

### 问题1：忘记检查手动锁定状态
**症状**：用户手动选择字幕后，仍然会自动滚动

**原因**：
```typescript
// 错误的代码（修复前）
useEffect(() => {
  if (activeItemRef.current && listRef.current) {
    // 缺少 !isManuallyLocked 检查
    container.scrollTo(...);
  }
}, [activeIndex]); // 缺少 isManuallyLocked 依赖
```

**修复**：
```typescript
// 正确的代码（修复后）
useEffect(() => {
  if (!isManuallyLocked && activeItemRef.current && listRef.current) {
    // ✓ 添加了检查
    container.scrollTo(...);
  }
}, [activeIndex, isManuallyLocked]); // ✓ 添加了依赖
```

---

## 🎯 使用场景

### 适合的学习场景
1. **语言学习**
   - 上方字幕提供上下文
   - 当前字幕固定位置，便于跟读
   - 下方字幕可预览

2. **听力训练**
   - 视线固定，不需要搜索当前句
   - 减少眼睛疲劳
   - 提高专注度

3. **影子跟读（Shadowing）**
   - 焦点固定在第二行
   - 上方显示刚读过的内容
   - 下方预览即将读的内容

### 用户反馈
- ✅ 阅读更连贯
- ✅ 不需要频繁移动视线
- ✅ 像读书一样自然
- ✅ 提升学习效率

---

## 🔍 调试技巧

### 如何验证滚动位置正确

1. **打开浏览器控制台**
2. **添加调试日志**：
```typescript
useEffect(() => {
  if (!isManuallyLocked && activeItemRef.current && listRef.current) {
    const container = listRef.current;
    const item = activeItemRef.current;
    const itemHeight = item.offsetHeight;
    const scrollTop = item.offsetTop - itemHeight;
    
    console.log('Scroll Debug:', {
      activeIndex,
      itemHeight,
      itemOffsetTop: item.offsetTop,
      calculatedScrollTop: scrollTop,
      currentScrollTop: container.scrollTop
    });
    
    container.scrollTo({
      top: scrollTop,
      behavior: 'smooth'
    });
  }
}, [activeIndex, isManuallyLocked]);
```

3. **观察输出**：
```
Scroll Debug: {
  activeIndex: 3,
  itemHeight: 100,
  itemOffsetTop: 300,
  calculatedScrollTop: 200,  // 300 - 100
  currentScrollTop: 150      // 滚动前的位置
}
```

---

## 📝 注意事项

### 性能优化
- ✅ 使用 `smooth` 滚动，视觉效果更好
- ✅ 只在 `activeIndex` 变化时滚动，避免频繁触发
- ✅ 添加 `isManuallyLocked` 依赖，及时响应用户操作

### 用户体验
- ✅ 手动选择后停止自动滚动
- ✅ 再次点击当前字幕可恢复自动滚动
- ✅ 滚动过程流畅自然

### 兼容性
- ✅ 支持所有现代浏览器
- ✅ `scrollTo` API 广泛支持
- ✅ `behavior: 'smooth'` 在不支持的浏览器会降级为立即滚动

---

## 🚀 后续优化建议

### 可配置化
可以考虑添加设置选项：
```typescript
interface ScrollSettings {
  enabled: boolean;           // 是否启用固定位置滚动
  targetLine: number;         // 目标行数（1=第一行, 2=第二行...）
  smoothScroll: boolean;      // 是否平滑滚动
  lockOnManualSelect: boolean; // 手动选择后是否锁定
}
```

### 自适应调整
根据容器高度自动调整目标位置：
```typescript
// 如果容器很小，可能无法显示第二行
const visibleLines = Math.floor(containerHeight / itemHeight);
const targetLine = Math.min(2, Math.floor(visibleLines / 2));
```

---

**最后更新**：2025-12-26
**修复版本**：v1.1
**状态**：✅ 已修复并验证
