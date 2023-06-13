import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

export class Config {
  private readonly tableName: string;
  private readonly app: string;
  private readonly dynamodb: DynamoDBClient;
  private readonly stageName: string;
  constructor(
    app: string,
    stageName: string,
    tableName: string,
    region: string = "us-east-1"
  ) {
    this.tableName = tableName;
    this.app = app;
    this.stageName = stageName;
    this.dynamodb = new DynamoDBClient({ region, apiVersion: "2012-08-10" });
  }

  async get(key: string, defaultValue: string = "") {
    return this.getValue(key, this.stageName) ?? defaultValue;
  }

  async set(key: string, value: string) {
    await this.setValue(key, value, this.stageName);
  }

  async getShared(key: string, defaultValue: string = "") {
    return this.getValue(key) ?? defaultValue;
  }

  async setShared(key: string, value: string) {
    await this.setValue(key, value);
  }

  async getOrSet(key: string, defaultValue: string, isShared?: boolean) {
    const getter = isShared ? this.getShared : this.get;
    const setter = isShared ? this.setShared : this.set;

    const value = await getter(key);
    if (value) return value;

    // Value not found set it
    await setter(key, defaultValue);
    return defaultValue;
  }

  private async getValue(key: string, stage: string = "") {
    const pk = stage ? `${this.app}#${stage}` : this.app;
    const getCommand = new GetItemCommand({
      TableName: this.tableName,
      Key: {
        pk: { S: pk.toUpperCase() },
        sk: { S: key },
      },
    });

    const response = await this.dynamodb.send(getCommand);
    return response.Item?.value?.S;
  }

  private async setValue(key: string, value: string, stage: string = "") {
    const pk = stage ? `${this.app}#${stage}` : this.app;
    const setCommand = new PutItemCommand({
      TableName: this.tableName,
      Item: {
        pk: { S: pk.toUpperCase() },
        sk: { S: key },
        value: { S: value },
      },
    });

    await this.dynamodb.send(setCommand);
  }
}
