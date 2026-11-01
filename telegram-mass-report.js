/**
 * Telegram Account & Channel Mass-Report / Ban Client
 * Author: ZamXDEV, Zamxyy
 * Channel : https://whatsapp.com/channel/0029VbDtt8vISTkP8L5PKG3f
 */

const REPORT_REASONS = {
    spam: { label: 'Spam / Unwanted Advertising', id: 'spam' },
    fake: { label: 'Fake Account / Scam / Impersonation', id: 'fake' },
    violence: { label: 'Violence / Threats of Violence', id: 'violence' },
    porn: { label: 'Pornography / Illegal Adult Content', id: 'porn' },
    childAbuse: { label: 'Child Abuse / CSAM', id: 'childAbuse' },
    copyright: { label: 'Copyright Infringement', id: 'copyright' },
    personal: { label: 'Publishing Personal Info / Doxxing', id: 'personal' }
};

class TelegramReportClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'https://flox-spamotp.vercel.app';
        this.timeout = options.timeout || 15000;
        this.defaultHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Origin': 'https://flox-spamotp.vercel.app',
            'Referer': 'https://flox-spamotp.vercel.app/',
            'Content-Type': 'application/json'
        };
    }

    cleanTarget(target) {
        if (!target) return '';
        let cleaned = target.trim();
        if (cleaned.startsWith('https://t.me/')) {
            cleaned = cleaned.replace('https://t.me/', '');
        } else if (cleaned.startsWith('t.me/')) {
            cleaned = cleaned.replace('t.me/', '');
        }
        if (cleaned.startsWith('@')) {
            cleaned = cleaned.slice(1);
        }
        cleaned = cleaned.split('/')[0].split('?')[0];
        return cleaned;
    }

    /**
     * Get list of connected Telegram session accounts from Flox Engine
     */
    async getAccounts() {
        try {
            const res = await fetch(`${this.baseUrl}/api/report`, {
                method: 'POST',
                headers: this.defaultHeaders,
                body: JSON.stringify({ action: 'get_accounts' }),
                signal: AbortSignal.timeout(this.timeout)
            });
            const data = await res.json().catch(() => ({}));
            return data;
        } catch (err) {
            return {
                success: false,
                error: err.message
            };
        }
    }

    /**
     * Request OTP to add sender account
     */
    async sendOtp(phone) {
        try {
            const res = await fetch(`${this.baseUrl}/api/report`, {
                method: 'POST',
                headers: this.defaultHeaders,
                body: JSON.stringify({
                    action: 'send_otp',
                    phone: phone.replace(/[^0-9]/g, '')
                }),
                signal: AbortSignal.timeout(this.timeout)
            });
            const data = await res.json().catch(() => ({}));
            return data;
        } catch (err) {
            return {
                success: false,
                error: err.message
            };
        }
    }

    /**
     * Verify OTP & 2FA to activate sender account
     */
    async verifyOtp(phone, otp, password = '') {
        try {
            const res = await fetch(`${this.baseUrl}/api/report`, {
                method: 'POST',
                headers: this.defaultHeaders,
                body: JSON.stringify({
                    action: 'verify_otp',
                    phone: phone.replace(/[^0-9]/g, ''),
                    otp,
                    password
                }),
                signal: AbortSignal.timeout(this.timeout)
            });
            const data = await res.json().catch(() => ({}));
            return data;
        } catch (err) {
            return {
                success: false,
                error: err.message
            };
        }
    }

    /**
     * Submit Report directly via Telegram Official Support Gateway
     */
    async reportViaTelegramSupport(username, reasonKey, messageText = '') {
        try {
            const reasonObj = REPORT_REASONS[reasonKey] || REPORT_REASONS.spam;
            const targetUrl = `https://t.me/${username}`;
            const detailMsg = messageText || `Please investigate this account/channel (${targetUrl}) for violating Telegram terms of service: ${reasonObj.label}.`;

            const formPayload = new URLSearchParams({
                message: `${detailMsg}\n\nTarget URL: ${targetUrl}\nReason: ${reasonObj.label}`,
                email: 'security-report@vamxapi.my.id',
                phone: '+62812' + Math.floor(10000000 + Math.random() * 90000000),
                setln: 'en'
            });

            const res = await fetch('https://telegram.org/support', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Referer': 'https://telegram.org/support'
                },
                body: formPayload.toString(),
                signal: AbortSignal.timeout(10000)
            });

            const text = await res.text().catch(() => '');
            const isSuccess = res.status === 200 && (text.includes('Thank you') || text.includes('thanks') || text.includes('support'));
            return {
                success: isSuccess || res.status === 200,
                provider: 'Telegram Official Support Gateway',
                httpStatus: res.status
            };
        } catch (err) {
            return {
                success: false,
                provider: 'Telegram Official Support Gateway',
                error: err.message
            };
        }
    }

    /**
     * Main Report Function (Dual-Channel: Paradox MTProto API + Official Gateway Fallback)
     */
    async startReport(target, reason = 'spam', thread = 25, delay = 0.5) {
        const username = this.cleanTarget(target);
        if (!username) {
            return {
                success: false,
                error: 'Invalid Telegram target. Please provide @username or https://t.me/link'
            };
        }

        const reasonKey = REPORT_REASONS[reason] ? reason : 'spam';
        const reasonInfo = REPORT_REASONS[reasonKey];
        const threadsCount = Math.max(1, Math.min(parseInt(thread) || 25, 250));
        const delaySec = Math.max(0.1, parseFloat(delay) || 0.5);

        // 1. Attempt dispatch via Paradox Engine API
        let paradoxResult = null;
        try {
            const apiRes = await fetch(`${this.baseUrl}/api/report`, {
                method: 'POST',
                headers: this.defaultHeaders,
                body: JSON.stringify({
                    action: 'start_report',
                    target: `@${username}`,
                    reason: reasonKey,
                    thread: threadsCount,
                    delay: delaySec
                }),
                signal: AbortSignal.timeout(this.timeout)
            });
            paradoxResult = await apiRes.json().catch(() => ({}));
        } catch (e) {
            paradoxResult = { success: false, error: e.message };
        }

        // 2. Official Telegram Trust & Safety Gateway Dispatch
        const tgSupportResult = await this.reportViaTelegramSupport(username, reasonKey);

        const isSuccess = (paradoxResult && paradoxResult.success) || tgSupportResult.success;

        return {
            status: isSuccess ? 'success' : 'partial',
            target: {
                username: `@${username}`,
                url: `https://t.me/${username}`
            },
            report: {
                reason: reasonKey,
                description: reasonInfo.label,
                threads: threadsCount,
                delay: `${delaySec}s`
            },
            channels: {
                paradoxEngine: paradoxResult?.success ? 'Dispatched' : (paradoxResult?.error || 'Unavailable'),
                telegramSupportGateway: tgSupportResult.success ? 'Delivered' : (tgSupportResult.error || 'Failed')
            },
            timestamp: new Date().toISOString()
        };
    }
}

// Export module
module.exports = TelegramReportClient;

// CLI Runner 1:1
if (require.main === module) {
    (async () => {
        const target = process.argv[2];
        const reason = process.argv[3] || 'spam';
        const thread = process.argv[4] || 25;

        if (!target) {
            console.log(JSON.stringify({
                error: 'Target parameter is required.',
                usage: 'node telegram-mass-report.js "<target_username_or_url>" "[reason]" "[thread]"',
                available_reasons: Object.keys(REPORT_REASONS)
            }, null, 2));
            process.exit(1);
        }

        const client = new TelegramReportClient();
        const res = await client.startReport(target, reason, thread);
        console.log(JSON.stringify(res, null, 2));
    })();
}
