import { Handler } from "aws-lambda";
import * as os from "libs/opensearch-lib";
import { Action, Authority, KafkaRecord, opensearch } from "shared-types";
import { KafkaEvent } from "shared-types";
import {
  ErrorType,
  bulkUpdateDataWrapper,
  getTopic,
  logError,
} from "../libs/sink-lib";
import { Index } from "shared-types/opensearch";
import { decodeBase64WithUtf8 } from "shared-utils";

const osDomain = process.env.osDomain;
const indexNamespace = process.env.indexNamespace;
if (!indexNamespace || !osDomain) {
  throw new Error("Missing required environment variable(s)");
}
const index: Index = `${process.env.indexNamespace}main`;

export const handler: Handler<KafkaEvent> = async (event) => {
  const loggableEvent = { ...event, records: "too large to display" };
  try {
    for (const topicPartition of Object.keys(event.records)) {
      const topic = getTopic(topicPartition);
      switch (topic) {
        case undefined:
          logError({ type: ErrorType.BADTOPIC });
          throw new Error();
        case "aws.onemac.migration.cdc":
          await processAndIndex({
            kafkaRecords: event.records[topicPartition],
            index,
            osDomain,
            transforms: opensearch.main.transforms,
            topicPartition: topicPartition,
          });
          await onemac(event.records[topicPartition], topicPartition);
          break;
        case "aws.seatool.ksql.onemac.three.agg.State_Plan":
          await ksql(event.records[topicPartition], topicPartition);
          break;
        case "aws.seatool.debezium.changed_date.SEA.dbo.State_Plan":
          await changed_date(event.records[topicPartition], topicPartition);
          break;
      }
    }
  } catch (error) {
    logError({ type: ErrorType.UNKNOWN, metadata: { event: loggableEvent } });
    throw error;
  }
};

const processAndIndex = async ({
  kafkaRecords,
  index,
  osDomain,
  transforms,
  topicPartition,
}: {
  kafkaRecords: KafkaRecord[];
  index: Index;
  osDomain: string;
  transforms: any;
  topicPartition: string;
}) => {
  const docs: Array<(typeof transforms)[keyof typeof transforms]["Schema"]> =
    [];
  for (const kafkaRecord of kafkaRecords) {
    console.log(JSON.stringify(kafkaRecord, null, 2));
    const { value } = kafkaRecord;
    try {
      // If a legacy tombstone, handle and continue
      // TODO:  handle.  for now, just continue
      if (!value) {
        // docs.push(opensearch.main.legacyPackageView.tombstone(id));
        continue;
      }

      // Parse the kafka record's value
      const record = JSON.parse(decodeBase64WithUtf8(value));

      // If we're not a mako event, continue
      // TODO:  handle legacy.  for now, just continue
      if (!record.event || record?.origin !== "mako") {
        continue;
      }

      // If the event is a supported event, transform and push to docs array for indexing
      if (record.event in transforms) {
        const transformForEvent =
          transforms[record.event as keyof typeof transforms];

        const result = transformForEvent.transform().safeParse(record);

        if (result.success && result.data === undefined) continue;
        if (!result.success) {
          logError({
            type: ErrorType.VALIDATION,
            error: result?.error,
            metadata: { topicPartition, kafkaRecord, record },
          });
          continue;
        }
        console.log(JSON.stringify(result.data, null, 2));
        docs.push(result.data);
      } else {
        console.log(`No transform found for event: ${record.event}`);
      }
    } catch (error) {
      logError({
        type: ErrorType.BADPARSE,
        error,
        metadata: { topicPartition, kafkaRecord },
      });
    }
  }

  // Send all transformed records for indexing
  await bulkUpdateDataWrapper(osDomain, index, docs);
};

const ksql = async (kafkaRecords: KafkaRecord[], topicPartition: string) => {
  const docs: any[] = [];

  // fetch the date for all kafkaRecords in the list from opensearch
  const ids = kafkaRecords.map((record) => {
    const decodedId = JSON.parse(decodeBase64WithUtf8(record.key));

    return decodedId;
  });

  const openSearchRecords = await os.getItems(osDomain, indexNamespace, ids);
  const existingRecordsLookup = openSearchRecords.reduce<
    Record<string, number>
  >((acc, item) => {
    const epochDate = new Date(item.changedDate).getTime(); // Convert `changedDate` to epoch number
    acc[item.id] = epochDate; // Use `id` as the key and epoch date as the value
    return acc;
  }, {});

  for (const kafkaRecord of kafkaRecords) {
    const { key, value } = kafkaRecord;
    try {
      const id: string = JSON.parse(decodeBase64WithUtf8(key));

      // Handle deletes and continue
      if (!value) {
        docs.push(opensearch.main.seatool.tombstone(id));
        continue;
      }

      // Handle everything else and continue
      const record = {
        id,
        ...JSON.parse(decodeBase64WithUtf8(value)),
      };
      const result = opensearch.main.seatool.transform(id).safeParse(record);
      if (!result.success) {
        logError({
          type: ErrorType.VALIDATION,
          error: result?.error,
          metadata: { topicPartition, kafkaRecord, record },
        });
        continue;
      }
      console.log("--------------------");
      console.log(`id: ${result.data.id}`);
      console.log(`mako: ` + existingRecordsLookup[result.data.id]);
      console.log(`seatool: ` + result.data.changed_date);
      if (
        existingRecordsLookup[result.data.id] && // Check if defined
        (!result.data.changed_date || // Check if not defined or...
          result.data.changed_date < existingRecordsLookup[result.data.id]) // ...less than existingRecordsLookup[result.data.id]
      ) {
        console.log(`SKIP`);
        continue;
      }
      console.log(`INDEX`);
      console.log("--------------------");

      if (
        result.data.authority &&
        typeof result.data.seatoolStatus === "string" &&
        result.data.seatoolStatus != "Unknown"
      ) {
        docs.push({ ...result.data });
      }
    } catch (error) {
      logError({
        type: ErrorType.BADPARSE,
        error,
        metadata: { topicPartition, kafkaRecord },
      });
    }
  }
  await bulkUpdateDataWrapper(osDomain, index, docs);
};

const onemac = async (kafkaRecords: KafkaRecord[], topicPartition: string) => {
  let docs: any[] = [];
  for (const kafkaRecord of kafkaRecords) {
    const { key, value, timestamp } = kafkaRecord;
    try {
      const id: string = decodeBase64WithUtf8(key);

      // Handle deletes and continue
      if (!value) {
        docs.push(opensearch.main.legacyPackageView.tombstone(id));
        continue;
      }
      const record = { timestamp, ...JSON.parse(decodeBase64WithUtf8(value)) };
      // Process legacy events
      if (record?.origin !== "mako") {
        // Is a Package View from legacy onemac
        if (record?.sk === "Package" && record.submitterName) {
          const result = opensearch.main.legacyPackageView
            .transform(id)
            .safeParse(record);
          if (result.success && result.data === undefined) continue;
          if (!result.success) {
            logError({
              type: ErrorType.VALIDATION,
              error: result?.error,
              metadata: { topicPartition, kafkaRecord, record },
            });
            continue;
          }
          docs.push(result.data);
        }
        continue;
      }

      // Handle everything else
      if (record.origin === "mako") {
        const result = await (async () => {
          switch (record?.actionType) {
            case "new-submission":
            case undefined:
              return opensearch.main.newSubmission
                .transform()
                .safeParse(record);
            case Action.DISABLE_RAI_WITHDRAW:
            case Action.ENABLE_RAI_WITHDRAW:
              return opensearch.main.toggleWithdrawEnabled
                .transform(id)
                .safeParse(record);
            case Action.ISSUE_RAI:
              return opensearch.main.issueRai.transform(id).safeParse(record);
            case Action.RESPOND_TO_RAI:
              return opensearch.main.respondToRai
                .transform(id)
                .safeParse(record);
            case Action.WITHDRAW_RAI:
              return opensearch.main.withdrawRai
                .transform(id)
                .safeParse(record);
            case Action.WITHDRAW_PACKAGE:
              return opensearch.main.withdrawPackage
                .transform(id)
                .safeParse(record);
            case Action.REMOVE_APPK_CHILD:
              return opensearch.main.removeAppkChild
                .transform(id)
                .safeParse(record);
            case Action.UPDATE_ID: {
              console.log("UPDATE_ID detected...");
              if (!record.newId) {
                console.log(
                  "Malformed update id record.  We're going to skip.",
                  JSON.stringify(record),
                );
                break; // we need to add a safeparse so malformed receords fail in a nominal way.
              }
              // Immediately index all prior documents
              await bulkUpdateDataWrapper(osDomain, index, docs);
              // Reset docs back to empty
              docs = [];
              const item = await os.getItem(osDomain, index, id);
              if (item === undefined) {
                return {
                  error: "An error occured parsing the event.",
                  success: null,
                };
              }

              // Move record
              if (
                item._source.actionType &&
                item._source.actionType === "Extend"
              ) {
                docs.push({ ...item._source, id: record.newId });
              } else {
                docs.push({
                  id: record.newId,
                  appkParentId: item._source.appkParentId,
                  origin: item._source.origin,
                  raiWithdrawEnabled: item._source.raiWithdrawEnabled,
                  submitterName: item._source.submitterName,
                  submitterEmail: item._source.submitterEmail,
                });
              }
              // Delete old
              docs.push({
                id,
                delete: true,
              });

              // Handle the appk children when an appk parent id is updated
              // I'd like a better way to identify an appk parent.
              if (
                item._source.authority === Authority["1915c"] &&
                !item._source.appkParentId
              ) {
                console.log("AppK Parent ID update detected...");
                const items = await os.search(osDomain, index, {
                  from: 0,
                  size: 200,
                  query: {
                    bool: {
                      must: [{ term: { "appkParentId.keyword": id } }],
                    },
                  },
                });
                if (items !== undefined && items.hits.hits !== undefined) {
                  console.log(
                    `Updating children appKParentId from ${id} to ${record.newId}`,
                  );
                  const modifiedHits: opensearch.main.Document[] =
                    items.hits.hits.map(
                      (hit: { _source: opensearch.main.Document }) => {
                        return {
                          id: hit._source.id,
                          appkParentId: record.newId,
                        };
                      },
                    );
                  docs.push(...modifiedHits);
                }
              }
              return undefined;
            }
          }
        })();
        if (result === undefined) {
          continue;
        }
        if (!result?.success) {
          logError({
            type: ErrorType.VALIDATION,
            error: result?.error,
            metadata: { topicPartition, kafkaRecord, record },
          });
          continue;
        }
        docs.push(result.data);
        continue;
      }
    } catch (error) {
      logError({
        type: ErrorType.BADPARSE,
        error,
        metadata: { topicPartition, kafkaRecord },
      });
    }
  }
  await bulkUpdateDataWrapper(osDomain, index, docs);
};

const changed_date = async (
  kafkaRecords: KafkaRecord[],
  topicPartition: string,
) => {
  const docs: any[] = [];
  for (const kafkaRecord of kafkaRecords) {
    const { value } = kafkaRecord;
    try {
      // Handle delete events and continue
      if (value === undefined) {
        continue;
      }

      // Parse record
      const decodedValue = Buffer.from(value, "base64").toString("utf-8");
      const record = JSON.parse(decodedValue).payload.after;

      // Handle tombstone events and continue
      if (!record) continue;

      const result = opensearch.main.changedDate.transform().safeParse(record);
      if (!result.success) {
        logError({
          type: ErrorType.VALIDATION,
          error: result?.error,
          metadata: { topicPartition, kafkaRecord, record },
        });
        continue;
      }
      docs.push(result.data);
    } catch (error) {
      logError({
        type: ErrorType.BADPARSE,
        error,
        metadata: { topicPartition, kafkaRecord },
      });
    }
  }
  await bulkUpdateDataWrapper(osDomain, index, docs);
};
