import * as dynamodb from "../../../libs/dynamodb-lib";
import { generateMock } from "@anatine/zod-mock";
import { issueSchema } from "shared-types";
exports.handler = async () => {
  try {
    if (!process.env.tableName) {
      throw "ERROR:  env variable 'tableName' should exist";
    }
    const tableName = process.env.tableName;
    console.log("Putting test data...");

    for (let i = 0; i < 5; i++) {
      const mockData = generateMock(issueSchema, {
        seed: 100 + i,
      });
      await dynamodb.putItem({
        tableName,
        item: { ...mockData, createdAt: Date.now() },
      });
    }
    return "SUCCESS";
  } catch (error) {
    console.log(error);
    throw "ERROR";
  }
};
