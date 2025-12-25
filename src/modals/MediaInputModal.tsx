import { App, Modal, Setting, Notice, TFile } from 'obsidian';
import type LinguaFlowPlugin from '../main';

/**
 * 媒体输入对话框
 * 允许用户输入YouTube链接或本地文件路径
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
			.setDesc('输入 YouTube 链接、本地文件路径，或拖放文件到这里');

		inputSetting.addText(text => {
			text.setPlaceholder('https://youtube.com/watch?v=... 或 videos/lesson.mp4')
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
			text: '💡 支持 YouTube 链接、本地视频路径',
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
				// YouTube 或其他 URL
				await this.plugin.openUrl(this.inputValue);
				new Notice('正在加载视频...');
			} else {
				// 本地文件路径
				const file = this.app.vault.getAbstractFileByPath(this.inputValue);
				if (file instanceof TFile) {
					await this.plugin.openFile(file);
					new Notice('正在加载视频...');
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
					// 这里我们只能提示用户将文件添加到 vault
					new Notice('请将文件添加到 Obsidian vault 中，然后输入相对路径');
					// 可以尝试显示文件名作为提示
					this.inputValue = file.name;
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
