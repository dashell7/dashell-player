# 字幕滚动调试指南

## 🔍 如何检查滚动是否工作

### 步骤 1：打开开发者工具

1. 在 Obsidian 中按 `Ctrl+Shift+I` (Windows) 或 `Cmd+Option+I` (Mac)
2. 切换到 **Console (控制台)** 标签
3. 播放一个有字幕的视频

### 步骤 2：查看日志输出

你应该看到类似以下的日志：

#### ✅ 正常工作的日志
```
[SubtitleOverlay] Scroll Effect Triggered {
  activeIndex: 3,
  isManuallyLocked: false,
  hasActiveItemRef: true,
  hasListRef: true
}
[SubtitleOverlay] 🎯 Scrolling to Second Line: {
  activeIndex: 3,
  itemHeight: 100,
  itemOffsetTop: 300,
  calculatedScrollTop: 200,
  currentScrollTop: 150,
  containerHeight: 600,
  scrollHeight: 5000
}
```

**解读**：
- ✅ `hasActiveItemRef: true` - 当前字幕的 DOM 元素找到了
- ✅ `hasListRef: true` - 字幕列表容器找到了
- ✅ `itemHeight: 100` - 字幕项高度正常
- ✅ `calculatedScrollTop: 200` - 计算出滚动位置
- ✅ `scrollHeight > containerHeight` - 容器可以滚动

---

## 🐛 常见问题诊断

### 问题 1：没有任何日志输出

**可能原因**：
- 插件没有重新加载
- 没有播放字幕

**解决方法**：
1. 重启 Obsidian
2. 确保视频有字幕文件
3. 检查字幕是否正常加载

---

### 问题 2：日志显示 `hasActiveItemRef: false`

**症状**：
```
[SubtitleOverlay] Scroll Effect Triggered {
  activeIndex: 3,
  isManuallyLocked: false,
  hasActiveItemRef: false,  // ❌ 问题！
  hasListRef: true
}
```

**可能原因**：
- 当前字幕的 ref 没有正确绑定到 DOM
- activeIndex 和实际渲染的字幕不匹配

**解决方法**：
检查 SubtitleItem 组件的 ref 绑定：
```typescript
// 应该是这样
<div ref={isActive ? activeItemRef : null}>
```

---

### 问题 3：日志显示 `hasListRef: false`

**症状**：
```
[SubtitleOverlay] Scroll Effect Triggered {
  activeIndex: 3,
  isManuallyLocked: false,
  hasActiveItemRef: true,
  hasListRef: false  // ❌ 问题！
}
```

**可能原因**：
- 字幕列表容器的 ref 没有绑定
- showList 设置为 false

**解决方法**：
1. 检查设置中"显示内嵌字幕列表"是否开启
2. 检查 listRef 的绑定：
```typescript
<div className="linguaflow-subtitle-list" ref={listRef}>
```

---

### 问题 4：日志显示 `itemHeight: 0`

**症状**：
```
[SubtitleOverlay] 🎯 Scrolling to Second Line: {
  activeIndex: 3,
  itemHeight: 0,  // ❌ 问题！
  itemOffsetTop: 0,
  calculatedScrollTop: 0
}
```

**可能原因**：
- CSS 样式问题，字幕项没有高度
- 字幕内容为空

**解决方法**：
检查 CSS 样式：
```css
.linguaflow-subtitle-item {
  min-height: 60px;  /* 确保有最小高度 */
  padding: 12px;
}
```

---

### 问题 5：计算正确但不滚动

**症状**：
```
[SubtitleOverlay] 🎯 Scrolling to Second Line: {
  activeIndex: 3,
  itemHeight: 100,
  itemOffsetTop: 300,
  calculatedScrollTop: 200,  // ✓ 计算正确
  currentScrollTop: 150,     // ✓ 当前位置不同
  containerHeight: 600,
  scrollHeight: 600          // ❌ 无法滚动！
}
```

**可能原因**：
- 容器的 `scrollHeight` 等于 `containerHeight`，说明内容不够长，无法滚动
- CSS `overflow` 设置错误

**解决方法**：
检查 CSS：
```css
.linguaflow-subtitle-list {
  overflow-y: auto;  /* 必须允许滚动 */
  max-height: 100%;
}
```

---

### 问题 6：手动选择后仍然自动滚动

**症状**：
- 点击字幕后，滚动位置仍然会跳动

**日志特征**：
```
[SubtitleOverlay] Scroll Effect Triggered {
  activeIndex: 5,
  isManuallyLocked: false,  // ❌ 应该是 true
  ...
}
```

**可能原因**：
- 点击处理逻辑有问题
- `isManuallyLocked` 状态没有正确设置

**解决方法**：
检查点击处理：
```typescript
const handleSubtitleClick = (cue: SubtitleCue) => {
  setIsManuallyLocked(true);  // 必须设置锁定
  setSelectedCue(cue);
};
```

---

## 🔧 手动测试步骤

### 测试 1：基本滚动
1. 播放视频
2. 观察字幕列表
3. **预期**：当前字幕在第二行，上方有一行字幕

### 测试 2：滚动连续性
1. 让视频连续播放
2. 观察多个字幕切换
3. **预期**：每次切换，新字幕都显示在第二行

### 测试 3：手动选择
1. 点击某个字幕
2. 继续播放视频
3. **预期**：滚动停止，不再自动跟随

### 测试 4：解锁
1. 手动选择后，再次点击当前播放的字幕
2. **预期**：滚动恢复，继续自动跟随

---

## 📊 调试数据示例

### 正常工作的完整日志

```
// 第一次触发（索引 0）
[SubtitleOverlay] Scroll Effect Triggered {
  activeIndex: 0,
  isManuallyLocked: false,
  hasActiveItemRef: true,
  hasListRef: true
}
[SubtitleOverlay] 🎯 Scrolling to Second Line: {
  activeIndex: 0,
  itemHeight: 100,
  itemOffsetTop: 0,
  calculatedScrollTop: -100,  // 负数，实际会滚动到 0
  currentScrollTop: 0,
  containerHeight: 600,
  scrollHeight: 3000
}

// 第二次触发（索引 1）
[SubtitleOverlay] Scroll Effect Triggered {
  activeIndex: 1,
  isManuallyLocked: false,
  hasActiveItemRef: true,
  hasListRef: true
}
[SubtitleOverlay] 🎯 Scrolling to Second Line: {
  activeIndex: 1,
  itemHeight: 100,
  itemOffsetTop: 100,
  calculatedScrollTop: 0,     // 第一行
  currentScrollTop: 0,
  containerHeight: 600,
  scrollHeight: 3000
}

// 第三次触发（索引 2）
[SubtitleOverlay] Scroll Effect Triggered {
  activeIndex: 2,
  isManuallyLocked: false,
  hasActiveItemRef: true,
  hasListRef: true
}
[SubtitleOverlay] 🎯 Scrolling to Second Line: {
  activeIndex: 2,
  itemHeight: 100,
  itemOffsetTop: 200,
  calculatedScrollTop: 100,   // 第二行 ✓
  currentScrollTop: 0,
  containerHeight: 600,
  scrollHeight: 3000
}
```

---

## 🎯 如何确认功能正常

### 视觉检查清单
- [ ] 播放视频时，字幕列表自动滚动
- [ ] 当前字幕始终在第二行位置（从索引 2 开始）
- [ ] 当前字幕上方有一行字幕可见
- [ ] 当前字幕下方有多行字幕可见
- [ ] 滚动过程平滑自然
- [ ] 手动点击字幕后停止自动滚动
- [ ] 再次点击当前字幕可恢复自动滚动

### 控制台检查清单
- [ ] 每次 activeIndex 变化都有日志
- [ ] `hasActiveItemRef` 和 `hasListRef` 都是 true
- [ ] `itemHeight` 大于 0
- [ ] `scrollHeight` 大于 `containerHeight`
- [ ] `calculatedScrollTop` 的计算公式正确

---

## 💡 高级调试技巧

### 1. 检查 DOM 结构
在控制台执行：
```javascript
// 查找字幕列表容器
const list = document.querySelector('.linguaflow-subtitle-list');
console.log('List:', list);
console.log('ScrollHeight:', list?.scrollHeight);
console.log('ClientHeight:', list?.clientHeight);

// 查找当前激活的字幕项
const active = document.querySelector('.linguaflow-subtitle-item.active');
console.log('Active item:', active);
console.log('OffsetTop:', active?.offsetTop);
console.log('OffsetHeight:', active?.offsetHeight);
```

### 2. 手动触发滚动测试
```javascript
const list = document.querySelector('.linguaflow-subtitle-list');
const active = document.querySelector('.linguaflow-subtitle-item.active');

if (list && active) {
  const scrollTop = active.offsetTop - active.offsetHeight;
  console.log('Manual scroll to:', scrollTop);
  list.scrollTo({ top: scrollTop, behavior: 'smooth' });
}
```

### 3. 监听滚动事件
```javascript
const list = document.querySelector('.linguaflow-subtitle-list');
list?.addEventListener('scroll', (e) => {
  console.log('Scroll event:', {
    scrollTop: e.target.scrollTop,
    scrollHeight: e.target.scrollHeight,
    clientHeight: e.target.clientHeight
  });
});
```

---

## 📞 报告问题

如果按照以上步骤调试后仍然有问题，请提供：

1. **控制台完整日志**（从开始播放到出现问题）
2. **浏览器信息**（Chrome/Edge/Firefox，版本）
3. **字幕文件格式**（SRT/VTT）
4. **字幕数量**（多少条）
5. **复现步骤**

### 日志收集方法
1. 打开控制台
2. 右键点击控制台 → "Save as..."
3. 保存为文本文件
4. 提供该文件

---

**最后更新**：2025-12-26
**调试版本**：v1.2-debug
