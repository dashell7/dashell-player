import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * YouTube-DL 服务
 * 使用 yt-dlp 获取 YouTube 视频的直播流 URL
 */
export class YouTubeDLService {
    /**
     * 获取 YouTube 视频的可播放流 URL
     * @param youtubeUrl YouTube 视频 URL
     * @returns 直播流 URL（可直接播放）
     */
    static async getStreamUrl(youtubeUrl: string): Promise<string> {
        console.log('[YouTubeDLService] Fetching stream URL for:', youtubeUrl);
        
        try {
            // 使用 yt-dlp 获取最佳视频流 URL
            // -f bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best
            //  选择最佳质量的 mp4 格式（兼容性最好）
            // -g 只输出 URL，不下载
            const command = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -g "${youtubeUrl}"`;
            
            const { stdout, stderr } = await execAsync(command, {
                timeout: 30000, // 30秒超时
            });
            
            if (stderr && !stderr.includes('[youtube]')) {
                console.warn('[YouTubeDLService] Warning:', stderr);
            }
            
            // yt-dlp 返回两个 URL（视频和音频）或一个 URL（合并的）
            const urls = stdout.trim().split('\n');
            
            if (urls.length === 0 || !urls[0]) {
                throw new Error('No stream URL returned');
            }
            
            // 如果有两个 URL，返回第一个（视频流）
            // 浏览器会自动处理音视频合并
            const streamUrl = urls[0];
            
            console.log('[YouTubeDLService] Stream URL fetched successfully');
            return streamUrl;
            
        } catch (error) {
            console.error('[YouTubeDLService] Failed to fetch stream URL:', error);
            
            if (error instanceof Error) {
                if (error.message.includes('timeout')) {
                    throw new Error('获取视频流超时，请稍后重试');
                } else if (error.message.includes('yt-dlp')) {
                    throw new Error('yt-dlp 未安装或无法执行');
                } else {
                    throw new Error(`获取视频流失败: ${error.message}`);
                }
            }
            
            throw error;
        }
    }
    
    /**
     * 获取视频信息（标题、缩略图等）
     * @param youtubeUrl YouTube 视频 URL
     * @returns 视频信息
     */
    static async getVideoInfo(youtubeUrl: string): Promise<{
        title: string;
        duration: number;
        thumbnail: string;
    }> {
        console.log('[YouTubeDLService] Fetching video info for:', youtubeUrl);
        
        try {
            // 使用 --dump-json 获取视频元数据
            const command = `yt-dlp --dump-json --no-warnings "${youtubeUrl}"`;
            
            const { stdout } = await execAsync(command, {
                timeout: 15000, // 15秒超时
            });
            
            const info = JSON.parse(stdout.trim());
            
            return {
                title: info.title || 'Unknown Title',
                duration: info.duration || 0,
                thumbnail: info.thumbnail || '',
            };
            
        } catch (error) {
            console.error('[YouTubeDLService] Failed to fetch video info:', error);
            
            // 返回默认值而不是抛出错误
            return {
                title: 'YouTube Video',
                duration: 0,
                thumbnail: '',
            };
        }
    }
    
    /**
     * 检查 yt-dlp 是否可用
     * @returns 是否可用
     */
    static async isAvailable(): Promise<boolean> {
        try {
            const { stdout } = await execAsync('yt-dlp --version', {
                timeout: 5000,
            });
            
            const version = stdout.trim();
            console.log('[YouTubeDLService] yt-dlp version:', version);
            return true;
            
        } catch (error) {
            console.error('[YouTubeDLService] yt-dlp not available:', error);
            return false;
        }
    }
}
