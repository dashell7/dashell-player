import { App, Modal, Setting, Notice, TFile } from 'obsidian';
import type LinguaFlowPlugin from '../main';

/**
 * 媒体输入对话框
 * 允许用户输入本地文件路径或远程媒体URL
 */
export class MediaInputModal extends Modal {
	plugin: LinguaFlowPlugin;
	inputValue: string = '';

	constructor(app: App, plugin: LinguaFlowPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('linguaflow-media-input-modal');

		// 标题
		contentEl.createEl('h2', { text: '打开媒体文件' });

		// 输入框
		const inputSetting = new Setting(contentEl)
			.setName('媒体源')
			.setDesc('输入本地文件路径或远程媒体URL');

		inputSetting.addText(text => {
			text.setPlaceholder('videos/lesson.mp4 或 https://example.com/video.mp4')
				.setValue(this.inputValue)
				.onChange(value => {
					this.inputValue = value.trim();
				});
			
			// 自动聚焦
			text.inputEl.focus();
			
			// 监听 Enter 键
			text.inputEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					this.handleOpen();
				}
			});
			
			// 设置输入框样式
			text.inputEl.style.width = '100%';
		});

		// 按钮组
		const buttonContainer = contentEl.createDiv('linguaflow-modal-buttons');
		
		// 打开按钮
		const openButton = buttonContainer.createEl('button', {
			text: '打开',
			cls: 'mod-cta'
		});
		openButton.addEventListener('click', () => this.handleOpen());

		// 本地文件按钮
		const localButton = buttonContainer.createEl('button', {
			text: '选择本地文件'
		});
		localButton.addEventListener('click', () => this.handleLocalFile());

		// 取消按钮
		const cancelButton = buttonContainer.createEl('button', {
			text: '取消'
		});
		cancelButton.addEventListener('click', () => this.close());

		// 提示信息
		contentEl.createEl('div', {
			text: '💡 支持本地视频路径和远程媒体URL',
			cls: 'linguaflow-modal-hint'
		});
	}

	/**
	 * 处理打开媒体
	 */
	async handleOpen() {
		if (!this.inputValue) {
			new Notice('请输入媒体链接或路径');
			return;
		}

		try {
			// 判断是 URL 还是本地文件
			if (this.inputValue.startsWith('http://') || this.inputValue.startsWith('https://')) {
				// 远程 URL
				await this.plugin.openUrl(this.inputValue);
				new Notice('正在加载媒体...');
			} else {
				// 本地文件路径
				const file = this.app.vault.getAbstractFileByPath(this.inputValue);
				if (file instanceof TFile) {
					await this.plugin.openFile(file);
					new Notice('正在加载媒体...');
				} else {
					new Notice('找不到文件: ' + this.inputValue);
					return;
				}
			}
			
			this.close();
		} catch (error) {
			console.error('[MediaInputModal] Error:', error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice('打开失败: ' + errorMsg);
		}
	}

	/**
	 * 处理选择本地文件
	 */
	async handleLocalFile() {
		// 创建文件选择器
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'video/*,audio/*,.mp4,.mkv,.webm,.avi,.mov,.mp3,.wav,.ogg';
		
		input.addEventListener('change', async (e) => {
			const files = (e.target as HTMLInputElement).files;
			if (files && files.length > 0) {
				const file = files[0];
				if (file) {
					try {
						// 直接从文件创建 URL（支持库外文件）
						const fileUrl = URL.createObjectURL(file);
						
						// 直接加载文件
						await this.plugin.openUrl(fileUrl, undefined, file.name);
						new Notice(`正在加载: ${file.name}`);
						this.close();
					} catch (error) {
						console.error('[MediaInputModal] Error loading file:', error);
						const errorMsg = error instanceof Error ? error.message : String(error);
						new Notice('加载失败: ' + errorMsg);
					}
				}
			}
		});
		
		input.click();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
