import browser from 'webextension-polyfill';
import isEqual from 'lodash/isEqual';
import credentials from './credentials';
import vpnProvider from './providers/vpnProvider';
import log from '../lib/logger';
import { MESSAGES_TYPES } from '../lib/constants';
import { proxy } from './proxy';
import { getClosestEndpointByCoordinates } from '../lib/helpers';
import connectivity from './connectivity/connectivity';

const vpnCache = {
    endpoints: null,
    vpnInfo: null,
    currentLocation: null,
};

const reconnectEndpoint = async (endpoint) => {
    const { host, domainName } = await proxy.setCurrentEndpoint(endpoint);
    const vpnToken = await credentials.gainVpnToken();
    await connectivity.setCredentials(host, domainName, vpnToken.token);
};

const getClosestEndpointAndReconnect = async (endpoints, currentEndpoint) => {
    const endpointsArr = Object.keys(endpoints).map(endpointKey => endpoints[endpointKey]);
    const sameCityEndpoint = endpointsArr.find((endpoint) => {
        return endpoint.cityName === currentEndpoint.cityName;
    });
    if (sameCityEndpoint) {
        await reconnectEndpoint(sameCityEndpoint);
        log.debug(`Reconnect endpoint from ${currentEndpoint.id} to same city ${sameCityEndpoint.id}`);
        return;
    }
    const closestCityEndpoint = getClosestEndpointByCoordinates(currentEndpoint, endpointsArr);
    await reconnectEndpoint(closestCityEndpoint);
    log.debug(`Reconnect endpoint from ${currentEndpoint.id} to closest city ${closestCityEndpoint.id}`);
};

const getEndpointsRemotely = async () => {
    let vpnToken;
    try {
        vpnToken = await credentials.gainVpnToken();
    } catch (e) {
        log.debug('Unable to get vpn token because: ', e.message);
        return null;
    }

    const token = vpnToken && vpnToken.token;
    if (!token) {
        return null;
    }

    const endpoints = await vpnProvider.getEndpoints(token);

    if (!isEqual(endpoints, vpnCache.endpoints)) {
        vpnCache.endpoints = endpoints;
        browser.runtime.sendMessage({ type: MESSAGES_TYPES.ENDPOINTS_UPDATED, data: endpoints });
    }

    return endpoints;
};

const vpnTokenChanged = (oldVpnToken, newVpnToken) => {
    return oldVpnToken.licenseKey !== newVpnToken.licenseKey;
};

const getVpnInfoRemotely = async () => {
    const vpnToken = await credentials.gainVpnToken();
    if (!vpnToken) {
        log.debug('Can not get vpn info because vpnToken is null');
        return null;
    }
    let vpnInfo = await vpnProvider.getVpnExtensionInfo(vpnToken.token);
    let shouldReconnect = false;

    if (vpnInfo.refreshTokens) {
        log.info('refreshing tokens');
        const updatedVpnToken = await credentials.getVpnTokenRemote();
        if (vpnTokenChanged(vpnToken, updatedVpnToken)) {
            shouldReconnect = true;
        }
        await credentials.gainVpnCredentials(true);
        vpnInfo = await vpnProvider.getVpnExtensionInfo(updatedVpnToken.token);
    }

    // update endpoints
    const endpoints = await getEndpointsRemotely();

    const currentEndpoint = await proxy.getCurrentEndpoint();

    if (currentEndpoint) {
        const currentEndpointInEndpoints = currentEndpoint && Object.keys(endpoints)
            .some(endpoint => endpoint === currentEndpoint.id);

        // if there is no currently connected endpoint in the list of endpoints,
        // get closest and reconnect
        if (!currentEndpointInEndpoints) {
            await getClosestEndpointAndReconnect(endpoints, currentEndpoint);
            shouldReconnect = false;
        }

        if (shouldReconnect) {
            await getClosestEndpointAndReconnect(endpoints, currentEndpoint);
        }
    }

    vpnCache.vpnInfo = vpnInfo;
    browser.runtime.sendMessage({ type: MESSAGES_TYPES.VPN_INFO_UPDATED, data: vpnInfo });
    return vpnInfo;
};

const getVpnInfo = () => {
    getVpnInfoRemotely();
    if (vpnCache.vpnInfo) {
        return vpnCache.vpnInfo;
    }
    return null;
};

const getEndpoints = () => {
    if (vpnCache.endpoints) {
        return vpnCache.endpoints;
    }
    return null;
};

const getCurrentLocationRemote = async () => {
    const MIDDLE_OF_EUROPE = { coordinates: [51.05, 13.73] }; // Chosen approximately
    let currentLocation;
    try {
        currentLocation = await vpnProvider.getCurrentLocation();
    } catch (e) {
        log.error(e.message);
    }

    // if current location wasn't received use predefined
    currentLocation = currentLocation || MIDDLE_OF_EUROPE;

    if (!isEqual(vpnCache.currentLocation, currentLocation)) {
        vpnCache.currentLocation = currentLocation;
    }

    return currentLocation;
};

const getCurrentLocation = () => {
    // update current location information in background
    getCurrentLocationRemote();
    if (vpnCache.currentLocation) {
        return vpnCache.currentLocation;
    }
    return null;
};

const getSelectedEndpoint = async () => {
    const proxySelectedEndpoint = await proxy.getCurrentEndpoint();

    // if found return
    if (proxySelectedEndpoint) {
        return proxySelectedEndpoint;
    }

    const currentLocation = getCurrentLocation();
    const endpoints = getEndpoints();

    if (!currentLocation || !endpoints) {
        return null;
    }

    const closestEndpoint = getClosestEndpointByCoordinates(
        currentLocation,
        Object.values(endpoints)
    );

    await proxy.setCurrentEndpoint(closestEndpoint);
    return closestEndpoint;
};

export default {
    getEndpoints,
    getCurrentLocation,
    getVpnInfo,
    getEndpointsRemotely,
    getSelectedEndpoint,
};
