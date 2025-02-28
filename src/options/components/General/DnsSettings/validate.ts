import { isIP } from 'is-ip';

import { type DnsServerData } from '../../../../background/schema';
import { translator } from '../../../../common/translator';

const DOH_PREFIX = 'https://';
const DOT_PREFIX = 'tls://';

const DNS_SERVER_ERROR = {
    INVALID: translator.getMessage('settings_dns_add_custom_server_invalid_address'),
    DUPLICATE: translator.getMessage('settings_dns_add_custom_server_duplicate_address'),
};

/**
 * Validate custom dns server address.
 *
 * @param customDnsServers List of custom dns servers.
 * @param address Address to validate.
 * @returns Error message if address is invalid, otherwise null.
 */
export const validateDnsServerAddress = (
    customDnsServers: DnsServerData[],
    address: string,
): string | null => {
    // check existing custom dns addresses
    if (customDnsServers.some((server) => server.address === address)) {
        return DNS_SERVER_ERROR.DUPLICATE;
    }

    // for the moment only plain dns and tls supported
    if (address.startsWith(DOH_PREFIX) || !address.includes('.')) {
        return DNS_SERVER_ERROR.INVALID;
    }
    return null;
};

/**
 * Normalize dns server address.
 *
 * @param address Address to normalize.
 * @returns Normalized address.
 */
export const normalizeDnsServerAddress = (address: string) => {
    if (isIP(address) || address.startsWith(DOT_PREFIX)) {
        return address;
    }
    return `${DOT_PREFIX}${address}`;
};
