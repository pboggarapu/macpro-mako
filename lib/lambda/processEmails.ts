import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";
import {
  Action,
  Authority,
  EmailAddresses,
  KafkaEvent,
  KafkaRecord,
} from "shared-types";
import { decodeBase64WithUtf8, getSecret } from "shared-utils";
import { Handler } from "aws-lambda";
import {
  getEmailTemplates,
  getAllStateUsers,
  StateUser,
} from "./../libs/email";
import * as os from "../libs/opensearch-lib";
import {
  getCpocEmail,
  getSrtEmails,
} from "libs/email/content/email-components";

export const sesClient = new SESClient({ region: process.env.REGION });

export const handler: Handler<KafkaEvent> = async (event) => {
  try {
    const emailAddressLookupSecretName =
      process.env.emailAddressLookupSecretName;
    const applicationEndpointUrl = process.env.applicationEndpointUrl;

    if (!emailAddressLookupSecretName || !applicationEndpointUrl) {
      throw new Error("Environment variables are not set properly.");
    }

    const processRecordsPromises = [];

    for (const topicPartition of Object.keys(event.records)) {
      for (const rec of event.records[topicPartition]) {
        processRecordsPromises.push(
          processRecord(
            rec,
            emailAddressLookupSecretName,
            applicationEndpointUrl,
          ),
        );
      }
    }

    await Promise.all(processRecordsPromises);

    console.log("All emails processed successfully.");
  } catch (error) {
    console.error("Error processing email event:", error);
    throw error;
  }
};

export async function processRecord(
  kafkaRecord: KafkaRecord,
  emailAddressLookupSecretName: string,
  applicationEndpointUrl: string,
) {
  const { key, value, timestamp } = kafkaRecord;

  const id: string = decodeBase64WithUtf8(key);

  if (!value) {
    console.log("Tombstone detected. Doing nothing for this event");
    return;
  }

  const record = {
    timestamp,
    ...JSON.parse(decodeBase64WithUtf8(value)),
  };

  if (record?.origin === "micro") {
    const action: Action | "new-submission" = determineAction(record);
    const authority: Authority = record.authority.toLowerCase() as Authority;

    await processAndSendEmails(
      action,
      authority,
      record,
      id,
      emailAddressLookupSecretName,
      applicationEndpointUrl,
      getAllStateUsers,
    );
  }
}

function determineAction(record: any): Action | "new-submission" {
  if (!record.actionType || record.actionType === "new-submission") {
    return record.seaActionType === "Extend"
      ? Action.TEMP_EXTENSION
      : "new-submission";
  }
  return record.actionType;
}

export async function processAndSendEmails(
  action: Action | "new-submission",
  authority: Authority,
  record: any,
  id: string,
  emailAddressLookupSecretName: string,
  applicationEndpointUrl: string,
  getAllStateUsers: (state: string) => Promise<StateUser[]>,
) {
  console.log("processAndSendEmails has been called");
  const territory = id.slice(0, 2);
  const allStateUsers = await getAllStateUsers(territory);

  const sec = await getSecret(emailAddressLookupSecretName);

  const item = await os.getItem(
    `https://${process.env.openSearchDomainEndpoint}`,
    `${process.env.indexNamespace}main`,
    id,
  );
  console.log("item", JSON.stringify(item, null, 2));

  const cpocEmail = getCpocEmail(item);
  const srtEmails = getSrtEmails(item);
  console.log("cpocEmail", cpocEmail);
  console.log("srtEmails", srtEmails);
  const emails: EmailAddresses = JSON.parse(sec);

  const templates = await getEmailTemplates<typeof record>(action, authority);

  const allStateUsersEmails = allStateUsers.map(
    (user) => user.formattedEmailAddress,
  );

  const templateVariables = {
    ...record,
    id,
    applicationEndpointUrl,
    territory,
    emails: { ...emails, cpocEmail, srtEmails },
    allStateUsersEmails,
  };

  const sendEmailPromises = templates.map(async (template) => {
    const filledTemplate = await template(templateVariables);

    const params = {
      to: filledTemplate.to,
      cc: filledTemplate.cc,
      from: emails.sourceEmail,
      subject: filledTemplate.subject,
      html: filledTemplate.html,
      text: filledTemplate.text,
    };
    await sendEmail(params);
  });

  await Promise.all(sendEmailPromises);
}

export async function sendEmail(emailDetails: {
  to: string[];
  cc?: string[];
  from: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const { to, cc, from, subject, html, text } = emailDetails;

  const params: SendEmailCommandInput = {
    Destination: {
      ToAddresses: to,
      CcAddresses: cc,
    },
    Message: {
      Body: {
        Html: { Data: html, Charset: "UTF-8" },
        Text: text ? { Data: text, Charset: "UTF-8" } : undefined,
      },
      Subject: { Data: subject, Charset: "UTF-8" },
    },
    Source: from,
  };

  // Log the final SES params
  console.log("SES params:", JSON.stringify(params, null, 2));

  const command = new SendEmailCommand(params);
  try {
    await sesClient.send(command);
    console.log("Email sent successfully");
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}
