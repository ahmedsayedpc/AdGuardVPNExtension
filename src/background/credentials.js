import nanoid from 'nanoid';
import md5 from 'crypto-js/md5';
import browser from 'webextension-polyfill';
import accountProvider from './providers/accountProvider';
import auth from './auth';
import storage from './storage';
import log from '../lib/logger';
import vpnProvider from './providers/vpnProvider';
import { MESSAGES_TYPES } from '../lib/constants';

class Credentials {
    VPN_TOKEN_KEY = 'credentials.token';

    APP_ID_KEY = 'credentials.app.id';

    VPN_CREDENTIALS_KEY = 'credentials.vpn';

    async getVpnTokenLocal() {
        return storage.get(this.VPN_TOKEN_KEY);
    }

    async getVpnTokenRemote() {
        const accessToken = await auth.getAccessToken();
        let vpnToken;
        try {
            vpnToken = await accountProvider.getVpnToken(accessToken);
        } catch (e) {
            if (e.status === 401) {
                log.debug('access token expired');
                // log out user
                await auth.deauthenticate();
                throw e;
            }
            log.debug(e.message);
            browser.runtime.sendMessage({
                type: MESSAGES_TYPES.VPN_TOKEN_NOT_FOUND,
                data: { message: e.message },
            });
            throw e;
        }
        await storage.set(this.VPN_TOKEN_KEY, vpnToken);
        return vpnToken;
    }

    /**
     * Checks if vpn token is not expired
     * @param vpnToken
     * @returns {boolean}
     */
    isVpnTokenValid = (vpnToken) => {
        if (!vpnToken) {
            return false;
        }
        return vpnToken.licenseStatus === 'VALID';
    };

    async gainVpnToken() {
        let vpnToken = await this.getVpnTokenLocal();
        if (!this.isVpnTokenValid(vpnToken)) {
            try {
                vpnToken = await this.getVpnTokenRemote();
            } catch (e) {
                log.debug('unable to get vpn token remotely:', e.message);
                return null;
            }
        }
        if (this.isVpnTokenValid(vpnToken)) {
            return vpnToken;
        }
        return null;
    }

    async getVpnCredentialsRemote() {
        const appId = await this.getAppId();
        const vpnToken = await this.gainVpnToken();
        let credentials;
        if (!(vpnToken && vpnToken.token)) {
            throw new Error('was unable to gain vpn token');
        }
        try {
            credentials = await vpnProvider.getVpnCredentials(appId, vpnToken.token);
        } catch (e) {
            log.error(e.message);
            throw new Error('was unable to get vpn credentials: ', e.message);
        }
        return credentials;
    }

    async getVpnCredentialsLocal() {
        let vpnCredentials;
        try {
            vpnCredentials = await storage.get(this.VPN_CREDENTIALS_KEY);
        } catch (e) {
            log.error(`unable to get vpn credentials from storage due to: ${e.message}`);
            throw e;
        }
        return vpnCredentials;
    }

    // TODO [maximtop] add validation
    areCredentialsValid(vpnCredentials) {
        if (!vpnCredentials) {
            return false;
        }
        const { licenseStatus, timeExpiresSec } = vpnCredentials;
        const currentTimeSec = Math.ceil(Date.now() / 1000);
        if (licenseStatus !== 'VALID' || timeExpiresSec < currentTimeSec) {
            return false;
        }
        return true;
    }

    async gainVpnCredentials(remoteForce) {
        throw new Error('some strange error happened');
        let vpnCredentials;

        if (!remoteForce) {
            if (this.areCredentialsValid(this.vpnCredentials)) {
                return this.vpnCredentials;
            }

            vpnCredentials = await this.getVpnCredentialsLocal();
            if (this.areCredentialsValid(vpnCredentials)) {
                this.vpnCredentials = vpnCredentials;
                return vpnCredentials;
            }
        }

        vpnCredentials = await this.getVpnCredentialsRemote();
        if (this.areCredentialsValid(vpnCredentials)) {
            this.vpnCredentials = vpnCredentials;
            await storage.set(this.VPN_CREDENTIALS_KEY, vpnCredentials);
            return vpnCredentials;
        }

        // TODO [maximtop] notify user about error;
        throw new Error('cannot get credentials');
    }

    async getAccessPrefix() {
        const vpnToken = await this.gainVpnToken();
        const { token } = vpnToken;
        const vpnCredentials = await this.gainVpnCredentials();
        const { result: { credentials } } = vpnCredentials;
        return md5(token + credentials).toString();
    }

    async gainAppId() {
        let appId;
        try {
            appId = await storage.get(this.APP_ID_KEY);
        } catch (e) {
            log.error(e.message);
            throw e;
        }

        if (!appId) {
            log.debug('generating app id');
            appId = nanoid();
            try {
                await storage.set(this.APP_ID_KEY, appId);
            } catch (e) {
                log.error(e.message);
                throw e;
            }
        }
        return appId;
    }

    getAppId() {
        return this.appId;
    }

    async init() {
        try {
            this.appId = await this.gainAppId();
            this.vpnCredentials = await this.getVpnCredentialsRemote();
        } catch (e) {
            log.debug('unable to init credentials due: ', e.message);
        }
        log.info('Credentials module is ready');
    }
}

const credentials = new Credentials();

export default credentials;
