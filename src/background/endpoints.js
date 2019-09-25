import credentials from './credentials';
import vpnProvider from './providers/vpnProvider';

const getEndpoints = async () => {
    const vpnToken = await credentials.gainVpnToken();
    const token = vpnToken && vpnToken.token;
    if (!token) {
        throw new Error('was unable to get vpn token');
    }
    return vpnProvider.getEndpoints(token);
};

const getCurrentLocation = async () => vpnProvider.getCurrentLocation();

const getVpnExtensionInfo = async () => {
    return vpnProvider.getVpnExtensionInfo();
};

const endpoints = {
    getEndpoints,
    getCurrentLocation,
    getVpnExtensionInfo,
};

export default endpoints;
