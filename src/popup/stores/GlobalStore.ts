import {
    action,
    computed,
    observable,
} from 'mobx';

import { log } from '../../common/logger';
import { tabs } from '../../background/tabs';
import { messenger } from '../../common/messenger';

import type { RootStore } from './RootStore';
import { MAX_GET_POPUP_DATA_ATTEMPTS, RequestStatus } from './constants';

export class GlobalStore {
    @observable initStatus = RequestStatus.Pending;

    rootStore: RootStore;

    constructor(rootStore: RootStore) {
        this.rootStore = rootStore;
    }

    /**
     * Checks whether the desktop AdGuard VPN apps are supported for the current OS.
     * Sets the result to the settings store.
     */
    @action
    async getDesktopAppData(): Promise<void> {
        const { rootStore: { settingsStore } } = this;
        settingsStore.setHasDesktopAppForOs();
    }

    @action
    async getPopupData(numberOfTries = 1): Promise<void> {
        const { rootStore: { vpnStore, settingsStore, authStore } } = this;

        this.setInitStatus(RequestStatus.Pending);

        // Used tab api because calling tab api from background returns wrong result
        const tab = await tabs.getCurrent();
        const url = tab.url || null;

        try {
            const popupData = await messenger.getPopupData(url, numberOfTries);

            const {
                vpnInfo,
                locations,
                selectedLocation,
                permissionsError,
                isAuthenticated,
                canControlProxy,
                isRoutable,
                hasRequiredData,
                isPremiumToken,
                connectivityState,
                promoNotification,
                policyAgreement,
                isFirstRun,
                flagsStorageData,
                isVpnEnabledByUrl,
                shouldShowRateModal,
                shouldShowHintPopup,
                showScreenshotFlow,
                isVpnBlocked,
                isHostPermissionsGranted,
            } = popupData;

            authStore.setIsAuthenticated(isAuthenticated);

            if (!isAuthenticated) {
                await authStore.handleInitPolicyAgreement(policyAgreement);
                await authStore.getAuthCacheFromBackground();
                await authStore.setShowScreenshotFlow(showScreenshotFlow);
                this.setInitStatus(RequestStatus.Done);
                return;
            }

            // set host permissions flag as soon as possible just after the authentication
            // because it is critical for the VPN to work
            settingsStore.setHostPermissionsError(isHostPermissionsGranted);

            if (permissionsError) {
                settingsStore.setGlobalError(permissionsError);
            } else if (!hasRequiredData) {
                settingsStore.setCanControlProxy(canControlProxy);
                settingsStore.setGlobalError(new Error('No required data'));
                this.setInitStatus(RequestStatus.Error);
                return;
            } else {
                settingsStore.setGlobalError(null);
            }

            // retrieve limited offer data after user is authenticated
            // and there is not other errors
            let limitedOfferData = null;
            if (!isPremiumToken) {
                limitedOfferData = await messenger.getLimitedOfferData();
            }

            authStore.setFlagsStorageData(flagsStorageData);
            authStore.setIsFirstRun(isFirstRun);
            authStore.setShouldShowRateModal(shouldShowRateModal);
            authStore.setShowHintPopup(shouldShowHintPopup);
            settingsStore.setCanControlProxy(canControlProxy);
            settingsStore.setConnectivityState(connectivityState);
            settingsStore.setIsRoutable(isRoutable);
            settingsStore.setIsVpnBlocked(isVpnBlocked);
            settingsStore.setLimitedOfferData(limitedOfferData);
            settingsStore.setPromoNotification(promoNotification);
            vpnStore.setVpnInfo(vpnInfo);
            vpnStore.setLocations(locations);
            vpnStore.setSelectedLocation(selectedLocation);
            vpnStore.setIsPremiumToken(isPremiumToken);
            authStore.setIsAuthenticated(isAuthenticated);
            await authStore.getAuthCacheFromBackground();
            await authStore.setPolicyAgreement(policyAgreement);
            await settingsStore.checkRateStatus();
            await settingsStore.getExclusionsInverted();
            await settingsStore.getCurrentTabHostname();
            settingsStore.setIsExcluded(!isVpnEnabledByUrl);

            this.setInitStatus(RequestStatus.Done);
        } catch (e) {
            log.error(e.message);
            this.setInitStatus(RequestStatus.Error);
        }
    }

    @action
    async init(): Promise<void> {
        await this.getPopupData(MAX_GET_POPUP_DATA_ATTEMPTS);
        await this.getDesktopAppData();
        await this.rootStore.authStore.getResendCodeCountdownAndStart();
    }

    @action
    setInitStatus(status: RequestStatus): void {
        this.initStatus = status;
    }

    @computed
    get status() {
        return this.initStatus;
    }
}
