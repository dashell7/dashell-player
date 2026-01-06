/**
 * API 密钥加密工具
 *
 * 使用 Web Crypto API 加密敏感数据（如 API 密钥）
 * 注意：这不是军事级别的加密，但可以防止明文存储
 *
 * 使用 AES-GCM (Galois/Counter Mode) 算法
 * - 提供认证加密
 * - 性能优良
 * - 浏览器原生支持
 */

export class CryptoUtils {
	private static readonly ALGORITHM = 'AES-GCM';
	private static readonly KEY_LENGTH = 256;
	private static readonly SALT_LENGTH = 16;
	private static readonly IV_LENGTH = 12;
	private static readonly ITERATIONS = 100000;
	private static readonly SALT = 'obsidian-langplayer-crypto-salt';

	/**
	 * 从插件 ID 派生加密密钥
	 * 使用 PBKDF2 算法从插件 ID 生成密钥
	 */
	private static async deriveKey(pluginId: string): Promise<CryptoKey> {
		const encoder = new TextEncoder();
		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			encoder.encode(pluginId),
			'PBKDF2',
			false,
			['deriveKey']
		);

		return crypto.subtle.deriveKey(
			{
				name: 'PBKDF2',
				salt: encoder.encode(CryptoUtils.SALT),
				iterations: CryptoUtils.ITERATIONS,
				hash: 'SHA-256',
			},
			keyMaterial,
			{ name: CryptoUtils.ALGORITHM, length: CryptoUtils.KEY_LENGTH },
			false,
			['encrypt', 'decrypt']
		);
	}

	/**
	 * 加密文本
	 * @param text - 要加密的文本
	 * @param pluginId - 插件 ID（作为密钥材料）
	 * @returns Base64 编码的加密数据
	 */
	static async encrypt(text: string, pluginId: string): Promise<string> {
		if (!text) return '';

		try {
			const key = await this.deriveKey(pluginId);
			const encoder = new TextEncoder();
			const iv = crypto.getRandomValues(new Uint8Array(CryptoUtils.IV_LENGTH));

			const encrypted = await crypto.subtle.encrypt(
				{
					name: CryptoUtils.ALGORITHM,
					iv: iv,
				},
				key,
				encoder.encode(text)
			);

			// 组合 IV 和加密数据
			const combined = new Uint8Array(iv.length + encrypted.byteLength);
			combined.set(iv);
			combined.set(new Uint8Array(encrypted), iv.length);

			// 转换为 Base64
			return btoa(String.fromCharCode(...combined));
		} catch (error) {
			console.error('[CryptoUtils] Encryption failed:', error);
			throw new Error('Failed to encrypt data');
		}
	}

	/**
	 * 解密文本
	 * @param encrypted - Base64 编码的加密数据
	 * @param pluginId - 插件 ID（必须与加密时相同）
	 * @returns 解密后的原始文本
	 */
	static async decrypt(encrypted: string, pluginId: string): Promise<string> {
		if (!encrypted) return '';

		try {
			const key = await this.deriveKey(pluginId);

			// 从 Base64 解码
			const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

			// 提取 IV 和加密数据
			const iv = combined.slice(0, CryptoUtils.IV_LENGTH);
			const encryptedData = combined.slice(CryptoUtils.IV_LENGTH);

			const decrypted = await crypto.subtle.decrypt(
				{
					name: CryptoUtils.ALGORITHM,
					iv: iv,
				},
				key,
				encryptedData
			);

			const decoder = new TextDecoder();
			return decoder.decode(decrypted);
		} catch (error) {
			console.error('[CryptoUtils] Decryption failed:', error);
			throw new Error('Failed to decrypt data');
		}
	}

	/**
	 * 检查文本是否为加密格式
	 * @param text - 要检查的文本
	 * @returns 如果看起来像加密数据则返回 true
	 */
	static isEncrypted(text: string): boolean {
		if (!text || text.length < 20) return false;

		// Base64 编码的加密数据通常包含特定字符
		// 简单启发式检查：只包含 Base64 字符且长度合理
		const base64Pattern = /^[A-Za-z0-9+/=]+$/;
		return base64Pattern.test(text);
	}

	/**
	 * 验证加密/解密功能是否可用
	 * @returns 如果 Web Crypto API 可用则返回 true
	 */
	static isAvailable(): boolean {
		return typeof crypto !== 'undefined' &&
			crypto.subtle !== undefined &&
			typeof crypto.subtle.importKey === 'function';
	}
}

/**
 * API 密钥管理器
 * 封装加密和存储操作
 */
export class ApiKeyManager {
	private pluginId: string;

	constructor(pluginId: string) {
		this.pluginId = pluginId;
	}

	/**
	 * 加密并保存 API 密钥
	 * @param key - 原始 API 密钥
	 * @param storage - 存储对象（Obsidian 插件的 loadData/saveData）
	 */
	async saveApiKey(
		key: string,
		storage: { setSetting: (key: string, value: any) => void },
		settingName: string = 'sttApiKey'
	): Promise<void> {
		if (!key) {
			storage.setSetting(settingName, '');
			return;
		}

		if (!CryptoUtils.isAvailable()) {
			console.warn('[ApiKeyManager] Crypto API not available, storing as plain text');
			storage.setSetting(settingName, key);
			return;
		}

		try {
			const encrypted = await CryptoUtils.encrypt(key, this.pluginId);
			storage.setSetting(settingName, encrypted);
			console.log('[ApiKeyManager] API key encrypted and saved');
		} catch (error) {
			console.error('[ApiKeyManager] Failed to encrypt API key:', error);
			// 回退到明文存储
			storage.setSetting(settingName, key);
		}
	}

	/**
	 * 加载并解密 API 密钥
	 * @param storage - 存储对象
	 * @returns 解密后的 API 密钥
	 */
	async loadApiKey(
		storage: { getSetting: (key: string) => any },
		settingName: string = 'sttApiKey'
	): Promise<string> {
		const encrypted = storage.getSetting(settingName);

		if (!encrypted) return '';

		// 如果不是加密格式（可能是旧版本明文存储），直接返回
		if (!CryptoUtils.isAvailable() || !CryptoUtils.isEncrypted(encrypted)) {
			return encrypted;
		}

		try {
			const decrypted = await CryptoUtils.decrypt(encrypted, this.pluginId);
			console.log('[ApiKeyManager] API key decrypted');
			return decrypted;
		} catch (error) {
			console.error('[ApiKeyManager] Failed to decrypt API key:', error);
			// 解密失败，返回空值或加密的值（让用户重新输入）
			return '';
		}
	}
}
