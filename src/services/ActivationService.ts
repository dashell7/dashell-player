
/**
 * 增强的哈希函数 (SHA-256 模拟 + 多轮混淆)
 * 结合多种算法增加破解难度
 */
function enhancedHash(str: string, rounds: number = 3): string {
    let hash = 0x811C9DC5; // FNV offset basis
    
    // 多轮哈希混淆
    for (let round = 0; round < rounds; round++) {
        const salt = String(round * 0x01000193); // FNV prime
        const data = str + salt;
        
        for (let i = 0; i < data.length; i++) {
            // FNV-1a 算法
            hash ^= data.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
            
            // 额外的位运算混淆
            hash = ((hash << 13) | (hash >>> 19)) ^ 0xDEADBEEF;
        }
    }
    
    // 转为正十六进制字符串并扩展
    const base = (hash >>> 0).toString(16).toUpperCase();
    const extended = enhancedHash2(base);
    return extended;
}

/**
 * 第二层哈希（XOR + 位移）
 */
function enhancedHash2(str: string): string {
    let result = 0;
    for (let i = 0; i < str.length; i++) {
        result ^= str.charCodeAt(i) << (i % 16);
    }
    return (result >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

// 多层混淆的密钥（分散存储）
const SECRET_PARTS = [
    'LINGUA',
    'FLOW',
    'PRO',
    'V2',
    '2025'
];

function getSecretSalt(): string {
    // 动态组合密钥，增加静态分析难度
    return SECRET_PARTS.map((p, i) => 
        String.fromCharCode(...p.split('').map(c => c.charCodeAt(0) + i))
    ).reverse().join('-');
}
const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 Days

export interface TrialStatus {
	isValid: boolean;
	isExpired: boolean;
	daysRemaining: number;
}

export class ActivationService {
	private static instance: ActivationService;
	private activated: boolean = false;

	private constructor() {}

	public static getInstance(): ActivationService {
		if (!ActivationService.instance) {
			ActivationService.instance = new ActivationService();
		}
		return ActivationService.instance;
	}

	/**
	 * 验证激活码（增强版）
	 * 格式: LP-{EXPIRY_HEX}-{RANDOM}-{SIGNATURE}-{CHECKSUM}
	 * 新增校验和防止篡改
	 */
	public validateCode(code: string): boolean {
		if (!code) return false;
		
		const parts = code.trim().toUpperCase().split('-');
		
		// 支持新格式 (5段) 和旧格式 (4段)
		if (parts.length >= 4 && parts[0] === 'LP') {
			const expiryHex = parts[1] || '';
			const randomPart = parts[2] || '';
			const signaturePart = parts[3] || '';
			const checksumPart = parts[4] || ''; // 新增校验和

			// 1. 验证签名
			const expectedSignature = this.generateSignatureV2(expiryHex, randomPart);
			if (signaturePart !== expectedSignature) {
				console.warn('[Activation] Invalid signature');
				return false;
			}

			// 2. 验证校验和（如果存在）
			if (checksumPart) {
				const expectedChecksum = this.generateChecksum(expiryHex, randomPart, signaturePart);
				if (checksumPart !== expectedChecksum) {
					console.warn('[Activation] Invalid checksum');
					return false;
				}
			}

			// 3. 验证过期时间
			if (expiryHex === 'LIFETIME') {
				this.activated = true;
				return true;
			}

			const expiryTimestamp = parseInt(expiryHex, 16);
			const nowTimestamp = Math.floor(Date.now() / 1000);

			// 4. 时间戳合理性检查（防止未来时间）
			const maxValidTimestamp = nowTimestamp + (365 * 24 * 60 * 60 * 10); // 最多10年
			if (isNaN(expiryTimestamp) || expiryTimestamp > maxValidTimestamp) {
				console.warn('[Activation] Invalid expiry timestamp');
				return false;
			}

			if (nowTimestamp < expiryTimestamp) {
				this.activated = true;
				return true;
			} else {
				console.log('[Activation] License expired');
				return false;
			}
		}

		return false;
	}

	/**
	 * 获取过期时间描述
	 */
	public getExpiryDate(code: string): string | null {
		if (!code) return null;
		const parts = code.trim().toUpperCase().split('-');
		if (parts.length === 4 && parts[0] === 'LP') {
			const expiryHex = parts[1] || '';
			if (expiryHex === 'LIFETIME') return '终身有效';
			const ts = parseInt(expiryHex, 16);
			if (!isNaN(ts)) {
				return new Date(ts * 1000).toLocaleDateString();
			}
		}
		return null;
	}

	/**
	 * 生成签名 V2 (增强版)
	 */
	public generateSignatureV2(expiryHex: string, randomPart: string): string {
		const salt = getSecretSalt();
		const payload = `${expiryHex}:${randomPart}:${salt}`;
		const hash = enhancedHash(payload, 3);
		return hash.substring(0, 6).padEnd(6, '0'); // 6位签名更安全
	}

	/**
	 * 生成校验和（新增）
	 */
	private generateChecksum(expiryHex: string, randomPart: string, signature: string): string {
		const payload = `${expiryHex}${randomPart}${signature}`;
		const hash = enhancedHash(payload, 2);
		return hash.substring(0, 4);
	}

	/**
	 * 生成签名 V1 (旧版，已废弃)
	 * @deprecated 请使用 generateSignatureV2
	 */
	public generateSignature(randomPart: string): string {
		const salt = getSecretSalt();
		const payload = `${randomPart}-${salt}`;
		const hash = enhancedHash(payload, 1);
		return hash.substring(0, 4).padEnd(4, '0');
	}

	public isActivated(): boolean {
		return this.activated;
	}

	public setActivationStatus(status: boolean) {
		this.activated = status;
	}

	/**
	 * 检查是否有 Pro 权限 (已激活 或 在试用期内)
	 * @param installDate 安装时间戳
	 */
	public isProAccess(installDate: number): boolean {
		// 1. 如果已激活，则是 Pro
		if (this.activated) return true;

		// 2. 如果在试用期内，享受 Pro 权益
		const trialStatus = this.checkTrialStatus(installDate);
		if (!trialStatus.isExpired) return true;

		// 3. 否则为基础版
		return false;
	}

	/**
	 * 检查试用状态
	 * @param installDate 安装时间戳
	 */
	public checkTrialStatus(installDate: number): TrialStatus {
		// installDate 为 0 表示尚未初始化（将在 main.ts 设置）
		if (!installDate || installDate <= 0) {
			return { isValid: true, isExpired: false, daysRemaining: 3 };
		}

		const now = Date.now();
		const elapsed = now - installDate;
		
		if (elapsed < 0) {
			// 时间异常，允许通过
			return { isValid: true, isExpired: false, daysRemaining: 3 };
		}

		const remainingMs = TRIAL_DURATION_MS - elapsed;
		const daysRemaining = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));

		if (remainingMs > 0) {
			return { isValid: true, isExpired: false, daysRemaining };
		} else {
			return { isValid: false, isExpired: true, daysRemaining: 0 };
		}
	}
}
