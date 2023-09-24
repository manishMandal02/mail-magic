import { API_MAX_RESULT, storageKeys } from '@src/pages/background/constants/app.constants';
import { NewsletterEmails } from '@src/pages/background/types/background.types';
import { removeDuplicateEmails } from '@src/pages/background/utils/removeDuplicateEmails';
import { getUnsubscribedEmails } from './getUnsubscribedEmails';
import { getWhitelistedEmails } from './getWhitelistedEmails';

type GetSendEmailFromIdsParams = {
  messageIds: string[];
  token: string;
};

// get sender emails & name from message/email ids
const getSenderEmailsFromIds = async ({ messageIds, token }: GetSendEmailFromIdsParams) => {
  // Construct the batch request body
  const batchRequestBody = messageIds.map(id => {
    return {
      method: 'GET',
      path: `/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From`,
      headers: {
        'Content-Type': 'application/http',
        'Content-ID': `message-${id}`,
      },
    };
  });

  // request boundary
  const boundary = 'newsletter_boundary';

  const batchRequest = batchRequestBody.map(request => {
    return `--${boundary}
Content-Type: application/http
Content-ID: ${request.headers['Content-ID']}

${request.method} ${request.path}
`;
  });

  const requestBody = `${batchRequest.join('')}\n--${boundary}--`;

  const fetchOptions = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/mixed; boundary=${boundary}`,
    },
    body: requestBody,
  };

  try {
    const res = await fetch(`https://gmail.googleapis.com/batch/gmail/v1`, fetchOptions);

    // console.log('🚀 ~ file: getNewsletterEmails.ts:55 ~ getSenderEmailsFromIds ~ res:', res);

    if (res.ok) {
      // Read the response text as multipart/mixed
      const responseText = (await res.text()).toString();

      // find the headers in the response
      const headersRegex = /"headers":\s*\[([^[\]]*("(name|value)":\s*"[^"]*")[^[\]]*)*\]/g;
      const headerMatches = responseText.match(headersRegex);

      // sender emails (name, emails)
      const senderEmails: NewsletterEmails[] = [];

      // lop through each header match to get names and emails
      for (const header of headerMatches!) {
        // clean the string (remove "{}[]"")
        const cleanStrPattern = /[{"\[\]}]/g;
        // parse value string, contains name & emails
        const valueStr = header.split(`"value":`)[1].replace(cleanStrPattern, '').trim();

        // name
        let name = valueStr.split(`\\u003c`)[0].trim();
        // email
        let email = valueStr.split(`\\u003c`)[1]
          ? valueStr.split(`\\u003c`)[1].replace('\\u003e', '').trim()
          : '';

        if (!email) {
          email = name;
          name = '';
        }

        senderEmails.push({ name, email });
      }

      if (senderEmails.length > 0) {
        // return sender email address
        return senderEmails;
      } else {
        throw new Error('No email addresses found in the response.');
      }
    } else {
      throw new Error(`Batch request failed: err: ${await res.text()}`);
    }
  } catch (error) {
    console.error('Error making batch request:', error);
  }
};

// get newsletters/mailing list emails form Gmail ap
export const getNewsletterEmails = async (token: string) => {
  const fetchOptions = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  let nextPageToken: string | null = null;

  // message ids batches to be processed
  let batches: string[][] = [];

  // newsletter emails (processed & filtered)
  let newsletterEmails: NewsletterEmails[] = [];

  try {
    // do while loop to handle pagination (gmail api has a response limit of 500)
    do {
      console.log(
        '🚀 ~ file: getNewsletterEmails.ts:125 ~ getNewsletterEmails ~ nextPageToken: 🏁🏁',
        nextPageToken
      );

      const queryParams = `maxResults=${API_MAX_RESULT}&q={"unsubscribe" "newsletter"} in:anywhere${
        nextPageToken ? `&pageToken=${nextPageToken}` : ''
      }`;

      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${queryParams}`,
        fetchOptions
      );

      const parsedRes = await res.json();

      console.log('🚀 ~ file: getNewsletterEmails.ts:125 ~ getNewsletterEmails ~ parsedRes:', parsedRes);

      if (parsedRes.messages && parsedRes.messages.length < 1) throw new Error('No emails found');

      // save next page token if present to fetch next batch of messages
      if (parsedRes.nextPageToken) {
        nextPageToken = parsedRes.nextPageToken;
      } else {
        nextPageToken = null;
      }

      console.log(
        '🚀 ~ file: getNewsletterEmails.ts:145 ~ getNewsletterEmails ~ nextPageToken:',
        nextPageToken
      );

      // dividing the messageIds into batches ~
      // so we can use the gmail batch api to group multiple requests into on
      const BATCH_SIZE = 45;

      // create batches of emails
      for (let i = 0; i < parsedRes.messages.length; i += BATCH_SIZE) {
        // if last batch is not more than half of batch size then add to previous batch
        batches.push(parsedRes.messages.slice(i, i + BATCH_SIZE).map(msg => msg.id));
      }
      console.log(
        '🚀 ~ file: getNewsletterEmails.ts:158 ~ getNewsletterEmails ~ batches.length:',
        batches.length
      );

      // process batches to get newsletter emails
      for (const batch of batches) {
        // console.log(
        //   '🚀 ~ file: getNewsletterEmails.ts:159 ~ getNewsletterEmails ~ batch.length:',
        //   batch.length
        // );

        // get sender emails from the message ids queried
        const senderEmails = await getSenderEmailsFromIds({
          messageIds: batch,
          token,
        });

        // console.log(
        //   '🚀 ~ file: getNewsletterEmails.ts:170 ~ getNewsletterEmails ~ senderEmails:',
        //   senderEmails
        // );

        // store the emails
        newsletterEmails = removeDuplicateEmails([...newsletterEmails, ...senderEmails]);

        // console.log(
        //   '🚀 ~ file: getNewsletterEmails.ts:177 ~ getNewsletterEmails ~ newsletterEmails:',
        //   newsletterEmails
        // );
      }

      //* check if these emails are already unsubscribed or whitelisted
      // TODO: this is not working, check
      if (newsletterEmails.length > 0) {
        const unsubscribedEmails = await getUnsubscribedEmails(token);

        // console.log(
        //   '🚀 ~ file: getNewsletterEmails.ts:182 ~ getNewsletterEmails ~ unsubscribedEmails:',
        //   unsubscribedEmails
        // );

        const whitelistedEmails = await getWhitelistedEmails(token);

        // console.log(
        //   '🚀 ~ file: getNewsletterEmails.ts:189 ~ getNewsletterEmails ~ whitelistedEmails:',
        //   whitelistedEmails
        // );

        // emails to filter out, combining unsubscribed and whitelisted emails
        const filterEmails = [];

        if (unsubscribedEmails && unsubscribedEmails.length > 0) {
          filterEmails.push(...unsubscribedEmails);
        }

        if (whitelistedEmails && whitelistedEmails.length > 0) {
          filterEmails.push(...whitelistedEmails);
        }

        if (filterEmails.length > 0) {
          console.log(
            '🚀 ~ file: getNewsletterEmails.ts:207 ~ getNewsletterEmails ~ filterEmails:',
            filterEmails
          );

          // filter emails already unsubscribed or whitelisted
          const filteredNewsletterEmails = newsletterEmails.filter(email => !filterEmails.includes(email));
          // store the filtered emails
          newsletterEmails = removeDuplicateEmails(filteredNewsletterEmails);
        } else {
          // store the emails
          newsletterEmails = removeDuplicateEmails(newsletterEmails);
        }
        if (!newsletterEmails[0]) {
          newsletterEmails.splice(0, 1);
        }
      }
      //end of do-while loop
    } while (nextPageToken !== null && newsletterEmails.length < 100);

    console.log('🚀 ~ file: gmail.ts:404 ~ getNewsletterEmails ~ newsletterEmails:', newsletterEmails);

    return newsletterEmails;

    //
  } catch (err) {
    console.log(
      '🚀 ~ file: gmail.ts:307 ~ getNewsletterEmails ❌ Failed to get newsletter emails ~ err:',
      err
    );
  }
};
