import { logger } from './logger';
import wait from './wait';

interface RetryAtIntervalParams<T> {
  retries: number;
  interval: number;
  callback: () => Promise<T>;
}

// retry a logic for certain interval with certain number of retries until it succeeds
export const retryAtIntervals = async <T>({ retries, interval, callback }: RetryAtIntervalParams<T>) => {
  try {
    let retry = 0;

    while (retry < retries) {
      const success = await callback();

      // stop the loop, if the callback is successful
      if (success) {
        retry = retries;
      }

      await wait(interval);
      retry += retry;
    }
    return true;
  } catch (error) {
    logger.error({
      error,
      msg: `error in retryAtIntervals for ${callback}`,
      fileTrace: 'content/utils/retryAtIntervals.ts:35 ~ retryAtIntervals() ~ catch block',
    });
    return null;
  }
};
