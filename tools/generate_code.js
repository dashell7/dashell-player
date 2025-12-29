
/**
 * 激活码生成器
 * 用于生成 LangPlayer 插件的激活码
 * 用法: node generate_code.js
 */

const SECRET_SALT = 'LINGUA-FLOW-SECRET-KEY-2025';

/**
 * 简单的哈希函数 (与插件中一致)
 */
function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16).toUpperCase();
}

/**
 * 生成随机字符串
 */
function generateRandomPart(length = 4) {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * 生成完整的激活码
 */
function generateLicenseKey() {
    const randomPart = generateRandomPart(4);
    const payload = `${randomPart}-${SECRET_SALT}`;
    const hash = simpleHash(payload);
    const signature = hash.substring(0, 4).padEnd(4, '0');
    
    return `LP-${randomPart}-${signature}`;
}

// 生成 5 个示例激活码
console.log('=== LangPlayer Activation Code Generator ===');
console.log('Secret Salt:', SECRET_SALT);
console.log('\nGenerated Codes:');
for (let i = 0; i < 5; i++) {
    console.log(generateLicenseKey());
}
console.log('\n==========================================');
