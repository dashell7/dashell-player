import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type LinguaFlowPlugin from './main';

/**
 * 语音服务提供商
 */
export type SpeechProvider = 'openai' | 'azure' | 'assemblyai' | 'custom';

/**
 * LinguaFlow 插件设置
 */
export interface LinguaFlowSettings {
	// 启用/禁用语音转文字
	enableVoice2Text: boolean;          // 启用语音转文字功能
	
	// 语音服务提供商选择
	speechProvider: SpeechProvider;     // 'openai' | 'azure' | 'assemblyai' | 'custom'
	
	// 通用语音转文字设置
	sttApiKey: string;                  // API Key（所有提供商）
	sttLanguage: string;                // 语言代码（如 'en', 'zh-CN'，空=自动检测）
	sttModel: string;                   // 模型名称（OpenAI: whisper-1）
	sttBaseUrl: string;                 // 自定义 API 端点 或 Azure Region
	
	// 音频设置
	saveAudio: boolean;                 // 是否保存录音文件
	audioFolder: string;                // 录音保存文件夹
	audioFormat: 'wav' | 'webm' | 'mp3'; // 音频文件格式
	recordOnlyMode: boolean;            // 只录音不转录模式
	
	// 播放器设置
	loopCount: number;                  // 单句循环次数（播放几次）
	autoPlayNext: boolean;              // 循环完成后自动播放下一句
	playerHeight: number;               // 播放器高度（像素）
	videoFit: 'contain' | 'cover' | 'fill';  // 视频填充模式
	showInlineSubtitles: boolean;       // 是否在视频下方显示字幕列表

	// 字幕样式设置
	subtitleFontSize: number;           // 字幕字体大小（px）
	subtitleFontWeight: string;         // 字幕字重
	subtitleLineHeight: number;         // 字幕行高
	showIndexAndTime: boolean;          // 是否显示字幕编号和时间

	// Language Learner 集成设置
	openLanguageLearnerPanel: boolean;  // 查词时是否自动打开录入面板

	// 兼容性字段（向后兼容）
	openaiApiKey: string;               // 已废弃，使用 sttApiKey
	azureSubscriptionKey: string;       // 已废弃，使用 sttApiKey
	azureRegion: string;                // 已废弃，使用 sttBaseUrl
}

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS: LinguaFlowSettings = {
	enableVoice2Text: true,
	speechProvider: 'openai',
	sttApiKey: '',
	sttLanguage: '',                    // 空=自动检测
	sttModel: 'whisper-1',
	sttBaseUrl: '',
	// 音频设置
	saveAudio: false,
	audioFolder: 'Recordings',
	audioFormat: 'webm',
	recordOnlyMode: false,
	// 播放器设置
	loopCount: 3, // 默认循环3次（播放3遍）
	autoPlayNext: false, // 默认不自动播放下一句
	playerHeight: 400, // 默认播放器高度 400px
	videoFit: 'cover', // 默认填充模式：填满容器无黑边
	showInlineSubtitles: false, // 默认不显示内嵌字幕列表（使用独立面板）
	// 字幕样式设置
	subtitleFontSize: 15, // 默认字体大小 15px
	subtitleFontWeight: '500', // 默认字重
	subtitleLineHeight: 1.6, // 默认行高
	showIndexAndTime: false, // 默认隐藏编号和时间
	// Language Learner 集成设置
	openLanguageLearnerPanel: true, // 默认打开录入面板
	// 兼容性字段
	openaiApiKey: '',
	azureSubscriptionKey: '',
	azureRegion: 'eastus',
};

/**
 * LinguaFlow 设置选项卡
 */
export class LinguaFlowSettingTab extends PluginSettingTab {
	plugin: LinguaFlowPlugin;

	constructor(app: App, plugin: LinguaFlowPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// 标题
		containerEl.createEl('h2', { text: 'LinguaFlow 设置' });

		// ===== 启用语音转文字 =====
		containerEl.createEl('h3', { text: 'AUDIO / 音频' });

		new Setting(containerEl)
			.setName('启用语音转文字')
			.setDesc('启用语音录制和转文字功能')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableVoice2Text)
				.onChange(async (value) => {
					this.plugin.settings.enableVoice2Text = value;
					await this.plugin.saveSettings();
					this.display(); // 重新渲染
				})
			);

		// 如果未启用，显示提示并返回
		if (!this.plugin.settings.enableVoice2Text) {
			containerEl.createEl('p', {
				text: '💡 启用后可以使用录音和语音转文字功能',
				cls: 'setting-item-description'
			});
			return;
		}

		// ===== 语音服务提供商选择 =====
		containerEl.createEl('h3', { text: '语音识别服务商' });

		new Setting(containerEl)
			.setName('选择服务提供商')
			.setDesc('选择用于语音转录和评分的服务')
			.addDropdown(dropdown => dropdown
				.addOption('openai', '🤖 OpenAI (Whisper)')
				.addOption('azure', '☁️ Azure (Speech Services)')
				.addOption('assemblyai', '🔊 AssemblyAI')
				.addOption('custom', '⚙️ Custom (OpenAI-compatible)')
				.setValue(this.plugin.settings.speechProvider)
				.onChange(async (value: SpeechProvider) => {
					this.plugin.settings.speechProvider = value;
					await this.plugin.saveSettings();
					this.display(); // 重新渲染以显示对应的设置
				})
			);

		containerEl.createEl('br');

		// ===== 通用设置 =====
		const provider = this.plugin.settings.speechProvider;
		
		containerEl.createEl('h3', { 
			text: provider === 'openai' ? '🤖 OpenAI 设置' :
			      provider === 'azure' ? '☁️ Azure 设置' :
			      provider === 'assemblyai' ? '🔊 AssemblyAI 设置' :
			      '⚙️ Custom 设置'
		});

		// API Key
		new Setting(containerEl)
			.setName('API Key')
			.setDesc(
				provider === 'openai' ? 'OpenAI API Key（格式：sk-...）' :
				provider === 'azure' ? 'Azure Subscription Key' :
				provider === 'assemblyai' ? 'AssemblyAI API Key' :
				'自定义服务的 API Key'
			)
			.addText(text => text
				.setPlaceholder(provider === 'openai' ? 'sk-...' : 'Enter API Key')
				.setValue(this.plugin.settings.sttApiKey || this.plugin.settings.openaiApiKey)
				.onChange(async (value) => {
					this.plugin.settings.sttApiKey = value;
					// 同步到旧字段以保持兼容性
					if (provider === 'openai') this.plugin.settings.openaiApiKey = value;
					if (provider === 'azure') this.plugin.settings.azureSubscriptionKey = value;
					await this.plugin.saveSettings();
				})
			)
			.addButton(button => button
				.setButtonText('Test Connection')
				.setTooltip('测试 API 连接')
				.onClick(async () => {
					button.setDisabled(true);
					button.setButtonText('Testing...');
					try {
						await this.testConnection();
						button.setButtonText('✓ Success');
						setTimeout(() => button.setButtonText('Test Connection'), 2000);
					} catch (error) {
						button.setButtonText('✗ Failed');
						setTimeout(() => button.setButtonText('Test Connection'), 2000);
					} finally {
						button.setDisabled(false);
					}
				})
			);

		// Base URL / Region (根据提供商不同)
		if (provider === 'azure') {
			new Setting(containerEl)
				.setName('Azure Region')
				.setDesc('Azure 区域（如 eastus, westus, eastasia）')
				.addText(text => text
					.setPlaceholder('eastus')
					.setValue(this.plugin.settings.sttBaseUrl || this.plugin.settings.azureRegion)
					.onChange(async (value) => {
						this.plugin.settings.sttBaseUrl = value;
						this.plugin.settings.azureRegion = value; // 兼容性
						await this.plugin.saveSettings();
					})
				);
		} else if (provider === 'custom') {
			new Setting(containerEl)
				.setName('API Base URL')
				.setDesc('自定义 API 端点（OpenAI 兼容接口）')
				.addText(text => text
					.setPlaceholder('https://your-api.com/v1/audio/transcriptions')
					.setValue(this.plugin.settings.sttBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.sttBaseUrl = value;
						await this.plugin.saveSettings();
					})
				);
		}

		// Language (所有提供商通用)
		new Setting(containerEl)
			.setName('语言')
			.setDesc('转录语言（留空=自动检测）。如 en, zh-CN, ja')
			.addText(text => text
				.setPlaceholder('自动检测')
				.setValue(this.plugin.settings.sttLanguage)
				.onChange(async (value) => {
					this.plugin.settings.sttLanguage = value;
					await this.plugin.saveSettings();
				})
			);

		// Model (OpenAI 和 Custom)
		if (provider === 'openai' || provider === 'custom') {
			new Setting(containerEl)
				.setName('Model')
				.setDesc('模型名称（OpenAI 默认：whisper-1）')
				.addText(text => text
					.setPlaceholder('whisper-1')
					.setValue(this.plugin.settings.sttModel)
					.onChange(async (value) => {
						this.plugin.settings.sttModel = value;
						await this.plugin.saveSettings();
					})
				);
		}

		// 获取指南
		const instructions = containerEl.createDiv({ cls: 'setting-item-description' });
		instructions.createEl('p', { text: '💡 如何获取 API Key:' });
		
		const list = instructions.createEl('ol');
		if (provider === 'openai') {
			list.createEl('li', { text: '访问 https://platform.openai.com/api-keys' });
			list.createEl('li', { text: '创建新的 API Key' });
			list.createEl('li', { text: '复制并粘贴到上方输入框' });
			instructions.createEl('p', { text: '💰 费用：约 $0.006/分钟' });
			instructions.createEl('p', { text: '📊 评分：文本匹配' });
		} else if (provider === 'azure') {
			list.createEl('li', { text: '访问 https://portal.azure.com' });
			list.createEl('li', { text: '创建 Speech Services 资源' });
			list.createEl('li', { text: '获取密钥和区域' });
			instructions.createEl('p', { text: '💰 费用：$1/1000次（免费5000次/月）' });
			instructions.createEl('p', { text: '📊 评分：专业发音评估' });
		} else if (provider === 'assemblyai') {
			list.createEl('li', { text: '访问 https://www.assemblyai.com' });
			list.createEl('li', { text: '注册并获取 API Key' });
			instructions.createEl('p', { text: '💰 费用：按使用量计费' });
			instructions.createEl('p', { text: '📊 评分：文本匹配' });
		} else if (provider === 'custom') {
			list.createEl('li', { text: '使用 OpenAI 兼容的 API 接口' });
			list.createEl('li', { text: '输入完整的 API 端点 URL' });
			list.createEl('li', { text: '如 https://api.your-service.com/v1/audio/transcriptions' });
		}

		containerEl.createEl('br');

		// ===== 音频文件格式 =====
		containerEl.createEl('h3', { text: '音频文件格式' });

		new Setting(containerEl)
			.setName('选择录音文件格式')
			.setDesc('不同格式各有优劣')
			.addDropdown(dropdown => dropdown
				.addOption('wav', 'WAV (无损，文件大)')
				.addOption('webm', 'WebM (压缩，文件小，推荐)')
				.addOption('mp3', 'MP3 (压缩，兼容性好)')
				.setValue(this.plugin.settings.audioFormat)
				.onChange(async (value: 'wav' | 'webm' | 'mp3') => {
					this.plugin.settings.audioFormat = value;
					await this.plugin.saveSettings();
				})
			);

		// 音频格式说明
		const audioFormatInfo = containerEl.createDiv({ cls: 'setting-item-description' });
		audioFormatInfo.createEl('p', { text: '📊 格式对比：' });
		const formatList = audioFormatInfo.createEl('ul');
		formatList.createEl('li', { text: 'WAV: 无损质量，文件较大（约 10MB/分钟），所有服务支持' });
		formatList.createEl('li', { text: 'WebM: 压缩格式，文件较小（约 1MB/分钟），现代浏览器支持' });
		formatList.createEl('li', { text: 'MP3: 压缩格式，兼容性最好（约 1MB/分钟），需要转换' });

		containerEl.createEl('br');

		// ===== 保存录音文件 =====
		new Setting(containerEl)
			.setName('保存录音文件')
			.setDesc('将录音保存到 vault 中')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.saveAudio)
				.onChange(async (value) => {
					this.plugin.settings.saveAudio = value;
					await this.plugin.saveSettings();
					this.display();
				})
			);

		if (this.plugin.settings.saveAudio) {
			new Setting(containerEl)
				.setName('录音保存文件夹')
				.setDesc('录音文件保存的文件夹路径')
				.addText(text => text
					.setPlaceholder('Recordings')
					.setValue(this.plugin.settings.audioFolder)
					.onChange(async (value) => {
						this.plugin.settings.audioFolder = value;
						await this.plugin.saveSettings();
					})
				);
		}

		// ===== 只录音模式 =====
		new Setting(containerEl)
			.setName('只录音不转录')
			.setDesc('启用后只录音不进行语音转文字（适合练习发音）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.recordOnlyMode)
				.onChange(async (value) => {
					this.plugin.settings.recordOnlyMode = value;
					await this.plugin.saveSettings();
				})
			);

		// ===== 播放器设置 =====
		containerEl.createEl('h3', { text: 'Player / 播放器' });

		new Setting(containerEl)
			.setName('单句循环次数')
			.setDesc('点击循环按钮时的播放次数（选择3次就是播放3遍）')
			.addDropdown(dropdown => dropdown
				.addOption('1', '1 次')
				.addOption('2', '2 次')
				.addOption('3', '3 次')
				.addOption('5', '5 次')
				.addOption('10', '10 次')
				.setValue(String(this.plugin.settings.loopCount))
				.onChange(async (value) => {
					this.plugin.settings.loopCount = parseInt(value);
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('自动播放下一句')
			.setDesc('循环完成后自动跳转到下一句并继续循环')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoPlayNext)
				.onChange(async (value) => {
					this.plugin.settings.autoPlayNext = value;
					await this.plugin.saveSettings();
				})
			);

		const autoPlayInfo = containerEl.createDiv({ cls: 'setting-item-description' });
		autoPlayInfo.createEl('p', { text: '💡 开启后，每句播放指定次数后会自动播放下一句' });
		autoPlayInfo.createEl('p', { text: '例如：设置循环3次，开启自动播放，则每句播放3次后自动跳到下一句' });
		autoPlayInfo.createEl('p', { text: '适合连续学习多句字幕的场景' });

		new Setting(containerEl)
			.setName('视频填充模式')
			.setDesc('选择视频如何填充播放器窗口')
			.addDropdown(dropdown => dropdown
				.addOption('contain', '完整显示 (contain) - 保持比例，完整显示，可能有黑边')
				.addOption('cover', '填满窗口 (cover) - 保持比例，填满窗口，可能裁剪')
				.addOption('fill', '拉伸填满 (fill) - 拉伸填满窗口，可能变形')
				.setValue(this.plugin.settings.videoFit)
				.onChange(async (value: 'contain' | 'cover' | 'fill') => {
					this.plugin.settings.videoFit = value;
					await this.plugin.saveSettings();
				})
			);

		const videoFitInfo = containerEl.createDiv({ cls: 'setting-item-description' });
		videoFitInfo.createEl('p', { text: '💡 推荐使用 "填满窗口" 模式，可避免黑边' });
		videoFitInfo.createEl('p', { text: 'contain: 完整显示视频，但可能有黑边' });
		videoFitInfo.createEl('p', { text: 'cover: 填满窗口无黑边，但可能裁剪画面边缘（推荐）' });
		videoFitInfo.createEl('p', { text: 'fill: 强制拉伸填满，可能导致画面变形' });

		// 显示内嵌字幕列表
		new Setting(containerEl)
			.setName('Show inline subtitle list / 在视频下方显示字幕列表')
			.setDesc('关闭后，请使用命令面板打开独立的字幕面板（推荐）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showInlineSubtitles)
				.onChange(async (value) => {
					this.plugin.settings.showInlineSubtitles = value;
					await this.plugin.saveSettings();
					
					// 刷新所有LinguaFlowView以应用设置
					const leaves = this.plugin.app.workspace.getLeavesOfType('linguaflow-view');
					leaves.forEach(leaf => {
						const view = leaf.view as any;
						if (view && typeof view.refresh === 'function') {
							view.refresh();
						}
					});
					
					new Notice(value ? '✅ 内嵌字幕列表已开启' : '✅ 内嵌字幕列表已关闭，请使用独立字幕面板');
				})
			);

		const subtitleListInfo = containerEl.createDiv({ cls: 'setting-item-description' });
		subtitleListInfo.createEl('p', { text: '💡 推荐关闭内嵌字幕，使用独立面板' });
		subtitleListInfo.createEl('p', { text: '📋 命令面板 → "Open Subtitle Panel" 打开独立字幕面板' });
		subtitleListInfo.createEl('p', { text: '🪟 独立面板可拖动到左侧栏、右侧栏、底部等任意位置' });

		// ===== 字幕样式设置 =====
		containerEl.createEl('h3', { text: 'Subtitle Style / 字幕样式' });

		new Setting(containerEl)
			.setName('字幕字体大小')
			.setDesc('设置字幕文本的字体大小（像素），默认15px')
			.addSlider(slider => slider
				.setLimits(12, 24, 1)
				.setValue(this.plugin.settings.subtitleFontSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.subtitleFontSize = value;
					await this.plugin.saveSettings();
					this.updateSubtitleStyles();
				})
			);

		new Setting(containerEl)
			.setName('字幕字重')
			.setDesc('设置字幕文字粗细')
			.addDropdown(dropdown => dropdown
				.addOption('400', '正常 (400)')
				.addOption('500', '中等 (500) - 推荐')
				.addOption('600', '半粗 (600)')
				.addOption('700', '粗体 (700)')
				.setValue(this.plugin.settings.subtitleFontWeight)
				.onChange(async (value) => {
					this.plugin.settings.subtitleFontWeight = value;
					await this.plugin.saveSettings();
					this.updateSubtitleStyles();
				})
			);

		new Setting(containerEl)
			.setName('字幕行高')
			.setDesc('设置字幕文本的行高倍数')
			.addSlider(slider => slider
				.setLimits(1.0, 2.5, 0.1)
				.setValue(this.plugin.settings.subtitleLineHeight)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.subtitleLineHeight = value;
					await this.plugin.saveSettings();
					this.updateSubtitleStyles();
				})
			);

		new Setting(containerEl)
			.setName('显示字幕编号和时间')
			.setDesc('显示每条字幕的编号和时间轴（如 #28 1:12 → 1:15）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showIndexAndTime)
				.onChange(async (value) => {
					this.plugin.settings.showIndexAndTime = value;
					await this.plugin.saveSettings();
					// 同步更新 store
					const { useMediaStore } = require('./store/mediaStore');
					useMediaStore.getState().updateSubtitleConfig({ showIndexAndTime: value });
				})
			);

		const subtitleStyleInfo = containerEl.createDiv({ cls: 'setting-item-description' });
		subtitleStyleInfo.createEl('p', { text: '💡 修改设置后会实时更新字幕样式' });
		subtitleStyleInfo.createEl('p', { text: '字幕颜色自动适配Obsidian主题，确保在明暗模式下都清晰可读' });

		// ===== Language Learner 集成设置 =====
		containerEl.createEl('h3', { text: 'Language Learner Integration / 语言学习集成' });

		new Setting(containerEl)
			.setName('自动打开新词录入面板')
			.setDesc('点击字幕单词查词时，自动打开 Language Learner 的新词录入界面（包含例句、笔记等）。关闭后仅显示查词结果。')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.openLanguageLearnerPanel)
				.onChange(async (value) => {
					this.plugin.settings.openLanguageLearnerPanel = value;
					await this.plugin.saveSettings();
				})
			);

		const llInfo = containerEl.createDiv({ cls: 'setting-item-description' });
		llInfo.createEl('p', { text: '💡 需要安装 obsidian-language-learner 插件才能使用此功能' });
		llInfo.createEl('p', { text: '开启后：查词 + 自动填充例句 + 打开录入面板' });
		llInfo.createEl('p', { text: '关闭后：仅查词，不打开录入面板' });
	}

	/**
	 * 测试 API 连接
	 */
	async testConnection(): Promise<void> {
		const provider = this.plugin.settings.speechProvider;
		const apiKey = this.plugin.settings.sttApiKey || this.plugin.settings.openaiApiKey;

		if (!apiKey || !apiKey.trim()) {
			new Notice('❌ Please enter API Key first');
			throw new Error('No API Key');
		}

		try {
			if (provider === 'openai' || provider === 'custom') {
				await this.testOpenAI();
			} else if (provider === 'azure') {
				await this.testAzure();
			} else if (provider === 'assemblyai') {
				await this.testAssemblyAI();
			}
			new Notice('✅ Connection successful!');
		} catch (error: any) {
			console.error('[LinguaFlow] Test connection failed:', error);
			new Notice(`❌ Connection failed: ${error.message || 'Unknown error'}`);
			throw error;
		}
	}

	/**
	 * 测试 OpenAI 连接
	 */
	private async testOpenAI(): Promise<void> {
		const apiKey = this.plugin.settings.sttApiKey || this.plugin.settings.openaiApiKey;
		const baseUrl = this.plugin.settings.sttBaseUrl || 'https://api.openai.com/v1';
		
		// 测试 models API
		const url = `${baseUrl}${baseUrl.endsWith('/') ? '' : '/'}models`;
		
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
			},
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`HTTP ${response.status}: ${error}`);
		}

		const data = await response.json();
		console.log('[LinguaFlow] OpenAI test successful:', data);
	}

	/**
	 * 测试 Azure 连接
	 */
	private async testAzure(): Promise<void> {
		const apiKey = this.plugin.settings.sttApiKey || this.plugin.settings.azureSubscriptionKey;
		const region = this.plugin.settings.sttBaseUrl || this.plugin.settings.azureRegion;

		if (!region || !region.trim()) {
			throw new Error('Please enter Azure Region');
		}

		// 测试 token endpoint
		const url = `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
		
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Ocp-Apim-Subscription-Key': apiKey,
			},
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`HTTP ${response.status}: ${error}`);
		}

		console.log('[LinguaFlow] Azure test successful');
	}

	/**
	 * 测试 AssemblyAI 连接
	 */
	private async testAssemblyAI(): Promise<void> {
		const apiKey = this.plugin.settings.sttApiKey;
		
		// 测试 API 访问
		const response = await fetch('https://api.assemblyai.com/v2/transcript', {
			method: 'GET',
			headers: {
				'Authorization': apiKey,
			},
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`HTTP ${response.status}: ${error}`);
		}

		console.log('[LinguaFlow] AssemblyAI test successful');
	}

	/**
	 * 更新字幕样式
	 */
	private updateSubtitleStyles(): void {
		const settings = this.plugin.settings;
		
		// 创建或更新自定义样式
		let styleEl = document.getElementById('linguaflow-custom-subtitle-style');
		if (!styleEl) {
			styleEl = document.createElement('style');
			styleEl.id = 'linguaflow-custom-subtitle-style';
			document.head.appendChild(styleEl);
		}

		styleEl.textContent = `
			.linguaflow-subtitle-item-en,
			.linguaflow-subtitle-item-zh,
			.linguaflow-subtitle-item-main {
				font-size: ${settings.subtitleFontSize}px;
				font-weight: ${settings.subtitleFontWeight};
				line-height: ${settings.subtitleLineHeight};
			}
		`;
	}
}
