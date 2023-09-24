import { FILTER_ACTION } from '@src/pages/background/types/background.types';
import { MAIL_MAGIC_FILTER_EMAIL, storageKeys } from '@src/pages/background/constants/app.constants';
import { getFilterById } from '../helper/gmailFilters';
import { getFilterId } from '../helper/getFilterId';
import { getLocalStorageByKey } from '@src/pages/background/utils/getStorageByKey';

export const getUnsubscribedEmails = async (token: string): Promise<string[]> => {
  let filterEmails = [];
  try {
    // get whitelisted emails from local.storage
    const unsubscribedEmails = await getLocalStorageByKey<string[]>(storageKeys.UNSUBSCRIBED_EMAILS);
    if (unsubscribedEmails && unsubscribedEmails.length > 0) {
      console.log(
        '🚀 ~ file: getUnsubscribedEmails.ts:14 ~ getUnsubscribedEmails ~ unsubscribedEmails:',
        unsubscribedEmails
      );

      filterEmails = unsubscribedEmails;
    } else {
      // if emails not present in local.storage get it from user's filter (gmail-api)

      // check for unsubscribe filter id in sync.storage
      const unsubscribeFilterId = await getFilterId({ token, filterAction: FILTER_ACTION.TRASH });
      if (unsubscribeFilterId) {
        // if exists, get emails from filter by id
        const res = await getFilterById(token, unsubscribeFilterId);

        console.log('🚀 ~ file: getUnsubscribedEmails.ts:28 ~ getUnsubscribedEmails ~ res:', res);

        if (res) {
          // save emails to local.storage
          await chrome.storage.local.set({ [storageKeys.UNSUBSCRIBED_EMAILS]: res.emails });
          filterEmails = res.emails;
        } else {
          throw new Error('❌ Failed to get unsubscribe filter emails');
        }
      } else {
        throw new Error('❌ Failed to get unsubscribe filter id');
      }
    }
    return filterEmails;
  } catch (err) {
    console.log('🚀 ~ file: getUnsubscribedEmails.ts:25 ~ ❌ Failed to get unsubscribe filters ~ err:', err);
    return filterEmails;
    //TODO: send to global error handler
  }
};
